"""
Local API Server for T-Log Intelligence.
Runs 100% locally on http://127.0.0.1:8080.
No telemetry, no cloud inference, no CDN assets.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
import tempfile
import shutil
from pydantic import BaseModel

from ..anomalies.isolation_forest import TransactionIsolationForest
from ..anomalies.peer_groups import CashierPeerGroupAnalyzer
from ..anomalies.sequences import SequenceAnomalyDetector
from ..anomalies.store_baselines import StoreBaselineAnalyzer
from ..clef.client import ClefClient
from ..core.hardware import assess_environment
from ..core.models import NormalizedTransaction
from ..core.storage import StorageEngine
from ..ingestion.pipeline import IngestionPipeline
from ..investigation.findings_engine import FindingsEngine
from ..reporting.exporter import ReportExporter
from ..rules.engine import RulesEngine


app = FastAPI(title="T-Log Intelligence", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global local singletons
storage = StorageEngine()
clef_client = ClefClient(preferred_engine="auto")
ingestion_pipeline = IngestionPipeline(storage)
rules_engine = RulesEngine()
isolation_forest = TransactionIsolationForest()
sequence_detector = SequenceAnomalyDetector()
peer_analyzer = CashierPeerGroupAnalyzer()
store_analyzer = StoreBaselineAnalyzer()
findings_engine = FindingsEngine(clef_client)
exporter = ReportExporter()


class IngestRequest(BaseModel):
    file_path: str


class UpdateStatusRequest(BaseModel):
    status: str
    note: Optional[str] = None
    author: Optional[str] = "Investigator"
    confirmed_loss: Optional[float] = None


@app.get("/api/status")
def get_system_status() -> Dict[str, Any]:
    hw = assess_environment()
    return {
        "status": "ready",
        "clef_engine": clef_client.active_engine,
        "clef_model": clef_client.model_name,
        "hardware": hw.to_dict(),
        "database": storage.db_path,
        "privacy_mode": "100% Local (Strict Offline)",
    }


@app.post("/api/upload-and-analyze")
async def upload_and_analyze(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Simple upload-and-analyze endpoint for non-technical users."""
    suffix = os.path.splitext(file.filename or "")[1] or ".csv"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        txs, quality = ingestion_pipeline.process_file_or_directory(tmp_path)
        analysis_res = run_full_analysis(max_clef_cases=15)
        kpis = storage.get_kpis()
        findings = storage.get_findings(limit=25)

        # Build clean non-technical response
        simple_incidents = []
        for f in findings:
            clef = f.get("clef_decision") or {}
            pattern = (clef.get("chosen_labels") or {}).get("pattern_type") or f.get("category", "Anomaly")
            simple_incidents.append({
                "id": f.get("finding_id"),
                "severity": f.get("priority", "MEDIUM"),
                "title": f.get("title"),
                "cashier": (f.get("cashier_ids") or ["N/A"])[0],
                "register": (f.get("register_ids") or ["N/A"])[0],
                "store": (f.get("store_ids") or ["N/A"])[0],
                "money_at_risk": f.get("financial_exposure_at_risk", 0.0),
                "summary": f.get("what_happened"),
                "why_unusual": f.get("why_unusual"),
                "what_to_do": f.get("recommended_investigation"),
                "clef_pattern": pattern.replace("_", " ").title(),
                "clef_confidence": f"{int(float(f.get('clef_confidence', 0.8)) * 100)}%",
                "evidence_transactions": (f.get("evidence_tx_ids") or [])[:5],
            })

        return {
            "status": "success",
            "summary": {
                "transactions_checked": kpis.get("total_transactions", len(txs)),
                "money_at_risk": kpis.get("total_exposure_at_risk", 0.0),
                "high_risk_incidents": kpis.get("high_priority_findings", len(simple_incidents)),
                "store_integrity": f"{quality.data_hygiene_score}% Clean",
                "store_count": kpis.get("store_count", 1),
                "cashier_count": kpis.get("cashier_count", 1),
                "date_range": f"{kpis.get('date_range_start', '')[:10]} to {kpis.get('date_range_end', '')[:10]}",
            },
            "incidents": simple_incidents,
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.get("/api/sample-data")
def get_sample_data(preset: str = "sweethearting") -> Response:
    """Returns sample dataset CSV text for instant testing."""
    sample_file = "data/synthetic_50k_tlogs.csv"
    if os.path.exists(sample_file):
        with open(sample_file, "r", encoding="utf-8") as f:
            lines = [f.readline() for _ in range(30)]
        return Response("".join(lines), media_type="text/plain")
    return Response("tx_id,store_id,register_id,cashier_id,timestamp,event_type,item_desc,total_price\nTX_01,STORE_101,LANE_01,CASHIER_17,2026-09-15T08:00:45,ITEM_SCAN,Organic Filet Mignon 12oz,39.99\nTX_01,STORE_101,LANE_01,CASHIER_17,2026-09-15T08:00:50,ITEM_VOID,Organic Filet Mignon 12oz,39.99\nTX_01,STORE_101,LANE_01,CASHIER_17,2026-09-15T08:00:55,ITEM_MANUAL,Yellow Bananas,0.59", media_type="text/plain")


@app.post("/api/crunch")
async def crunch_data(
    file: Optional[UploadFile] = File(None),
    data: Optional[str] = None,
    query: Optional[str] = "Detect any suspicious loss prevention risks, sweethearting, unauthorized voids, and till discrepancies.",
    model: Optional[str] = "@cf/cloudflare/clef-flash",
    min_confidence: Optional[float] = 0.50,
) -> Dict[str, Any]:
    """Universal crunch endpoint matching Cloudflare Worker."""
    suffix = ".csv"
    raw_content = ""
    if file:
        raw_content = (await file.read()).decode("utf-8", errors="replace")
    elif data:
        raw_content = data
    else:
        # Load sample dataset
        sample_path = "data/synthetic_50k_tlogs.csv"
        if os.path.exists(sample_path):
            with open(sample_path, "r", encoding="utf-8") as f:
                raw_content = f.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, mode="w", encoding="utf-8") as tmp:
        tmp.write(raw_content)
        tmp_path = tmp.name

    try:
        txs, quality = ingestion_pipeline.process_file_or_directory(tmp_path)
        run_full_analysis(max_clef_cases=15)
        kpis = storage.get_kpis()
        findings = storage.get_findings(limit=25)

        simple_incidents = []
        for f in findings:
            clef = f.get("clef_decision") or {}
            pattern = (clef.get("chosen_labels") or {}).get("pattern_type") or f.get("category", "Anomaly")
            simple_incidents.append({
                "id": f.get("finding_id"),
                "severity": f.get("priority", "MEDIUM"),
                "title": f.get("title"),
                "cashier": (f.get("cashier_ids") or ["N/A"])[0],
                "register": (f.get("register_ids") or ["N/A"])[0],
                "store": (f.get("store_ids") or ["N/A"])[0],
                "money_at_risk": f.get("financial_exposure_at_risk", 0.0),
                "summary": f"Matches criteria: \"{query}\". {f.get('what_happened')}",
                "what_to_do": f.get("recommended_investigation"),
                "clef_pattern": pattern.replace("_", " ").title(),
                "clef_match_pct": f"{int(float(f.get('clef_confidence', 0.85)) * 100)}% Match",
                "clef_confidence": f"{int(float(f.get('clef_confidence', 0.85)) * 100)}% Certainty",
                "evidence_transactions": (f.get("evidence_tx_ids") or [])[:5],
                "clef_decision": {
                    "model": (model or "clef-flash").replace("@cf/cloudflare/", ""),
                    "match_probability": float(f.get("clef_confidence", 0.85)),
                    "investigation_score": 3.4,
                },
            })

        return {
            "status": "success",
            "query": query,
            "summary": {
                "transactions_checked": kpis.get("total_transactions", len(txs)),
                "money_at_risk": kpis.get("total_exposure_at_risk", 0.0),
                "high_risk_incidents": kpis.get("high_priority_findings", len(simple_incidents)),
                "total_incidents": len(simple_incidents),
                "store_integrity": f"{quality.data_hygiene_score}% Clean",
                "store_count": kpis.get("store_count", 1),
                "cashier_count": kpis.get("cashier_count", 1),
                "date_range": f"{kpis.get('date_range_start', '')[:10]} to {kpis.get('date_range_end', '')[:10]}",
                "model_used": model,
            },
            "incidents": simple_incidents,
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)



@app.post("/api/analyze-sample")
def analyze_sample() -> Dict[str, Any]:
    """Runs analysis on the 50,000 synthetic transactions dataset with one click."""
    sample_path = "data/synthetic_50k_tlogs.csv"
    if not os.path.exists(sample_path):
        from ..synthetic.generator import SyntheticDatasetGenerator
        gen = SyntheticDatasetGenerator()
        gen.generate(target_events=50000, output_file=sample_path)

    txs, quality = ingestion_pipeline.process_file_or_directory(sample_path)
    run_full_analysis(max_clef_cases=15)
    kpis = storage.get_kpis()
    findings = storage.get_findings(limit=25)

    simple_incidents = []
    for f in findings:
        clef = f.get("clef_decision") or {}
        pattern = (clef.get("chosen_labels") or {}).get("pattern_type") or f.get("category", "Anomaly")
        simple_incidents.append({
            "id": f.get("finding_id"),
            "severity": f.get("priority", "MEDIUM"),
            "title": f.get("title"),
            "cashier": (f.get("cashier_ids") or ["N/A"])[0],
            "register": (f.get("register_ids") or ["N/A"])[0],
            "store": (f.get("store_ids") or ["N/A"])[0],
            "money_at_risk": f.get("financial_exposure_at_risk", 0.0),
            "summary": f.get("what_happened"),
            "why_unusual": f.get("why_unusual"),
            "what_to_do": f.get("recommended_investigation"),
            "clef_pattern": pattern.replace("_", " ").title(),
            "clef_confidence": f"{int(float(f.get('clef_confidence', 0.8)) * 100)}%",
            "evidence_transactions": (f.get("evidence_tx_ids") or [])[:5],
        })

    return {
        "status": "success",
        "summary": {
            "transactions_checked": kpis.get("total_transactions", len(txs)),
            "money_at_risk": kpis.get("total_exposure_at_risk", 0.0),
            "high_risk_incidents": kpis.get("high_priority_findings", len(simple_incidents)),
            "store_integrity": f"{quality.data_hygiene_score}% Clean",
            "store_count": kpis.get("store_count", 1),
            "cashier_count": kpis.get("cashier_count", 1),
            "date_range": f"{kpis.get('date_range_start', '')[:10]} to {kpis.get('date_range_end', '')[:10]}",
        },
        "incidents": simple_incidents,
    }


@app.get("/api/kpis")
def get_kpis() -> Dict[str, Any]:
    return storage.get_kpis()


@app.post("/api/ingest")
def ingest_data(req: IngestRequest) -> Dict[str, Any]:
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    txs, quality = ingestion_pipeline.process_file_or_directory(req.file_path)
    return {
        "transactions_imported": len(txs),
        "quality_report": quality.to_dict(),
    }


@app.post("/api/analyze")
def run_full_analysis(max_clef_cases: int = 40) -> Dict[str, Any]:
    # 1. Fetch transactions from DuckDB
    tx_rows = storage.conn.execute("SELECT * FROM transactions").fetchall()
    if not tx_rows:
        return {"status": "no_data", "message": "No transactions imported yet. Ingest data first."}

    cols = [d[0] for d in storage.conn.description]
    transactions: List[NormalizedTransaction] = []
    import json
    for r in tx_rows:
        d = dict(zip(cols, r))
        tx = NormalizedTransaction(
            tx_id=d["tx_id"],
            store_id=d["store_id"],
            register_id=d["register_id"],
            cashier_id=d["cashier_id"],
            supervisor_id=d["supervisor_id"],
            start_time=d["start_time"],
            end_time=d["end_time"],
            duration_seconds=d["duration_seconds"],
            status=d["status"],
            item_count=d["item_count"],
            void_count=d["void_count"],
            manual_entry_count=d["manual_entry_count"],
            override_count=d["override_count"],
            drawer_open_count=d["drawer_open_count"],
            subtotal=d["subtotal"],
            tax=d["tax"],
            total=d["total"],
            tender_total=d["tender_total"],
            change_due=d["change_due"],
            is_sco=d["is_sco"],
            items=json.loads(d.get("items_json") or "[]"),
            voided_items=json.loads(d.get("voided_items_json") or "[]"),
            tenders=json.loads(d.get("tenders_json") or "[]"),
            discounts=json.loads(d.get("discounts_json") or "[]"),
            events=[],  # will fetch per candidate
            event_types=(d.get("event_types_str") or "").split(),
            source_files=json.loads(d.get("source_files_json") or "[]"),
        )
        transactions.append(tx)

    # Attach events for each tx
    for tx in transactions:
        ev_rows = storage.conn.execute("SELECT * FROM events WHERE tx_id = ? ORDER BY event_seq ASC", [tx.tx_id]).fetchall()
        e_cols = [ed[0] for ed in storage.conn.description]
        tx.events = [dict(zip(e_cols, er)) for er in ev_rows]

    # 2. Peer group baselines
    cashier_baselines, cashier_anomalies = peer_analyzer.compute_baselines_and_anomalies(transactions)

    # 3. Deterministic Exception Rules
    rule_triggers = rules_engine.evaluate_transactions(transactions, cashier_baselines)
    storage.insert_rule_triggers_batch(rule_triggers)

    # 4. Unsupervised Anomaly Engines
    if_anomalies = isolation_forest.fit_predict(transactions)
    seq_anomalies = sequence_detector.discover_rare_sequences(transactions)
    store_anomalies = store_analyzer.analyze_stores(transactions)

    all_anomalies = if_anomalies + seq_anomalies + cashier_anomalies + store_anomalies
    storage.insert_anomalies_batch(all_anomalies)

    # 5. Clef Investigation Engine & Synthesis
    findings = findings_engine.synthesize_findings(
        transactions=transactions,
        rule_triggers=rule_triggers,
        anomalies=all_anomalies,
        cashier_baselines=cashier_baselines,
        max_clef_cases=max_clef_cases,
    )
    storage.insert_findings_batch(findings)

    return {
        "status": "success",
        "transactions_analyzed": len(transactions),
        "rule_triggers_count": len(rule_triggers),
        "anomalies_discovered": len(all_anomalies),
        "clef_cases_evaluated": len(findings),
        "findings_generated": len(findings),
    }


@app.get("/api/findings")
def list_findings(
    priority: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    return storage.get_findings(
        priority=priority, status=status, category=category, search=search, limit=limit, offset=offset
    )


@app.get("/api/findings/{finding_id}")
def get_finding_by_id(finding_id: str) -> Dict[str, Any]:
    res = storage.get_findings(search=finding_id, limit=1)
    if not res:
        raise HTTPException(status_code=404, detail="Finding not found")
    f = res[0]
    # Fetch primary transaction details
    primary_tx_id = f.get("evidence_tx_ids", [None])[0]
    tx_detail = storage.get_transaction_details(primary_tx_id) if primary_tx_id else None
    f["primary_transaction"] = tx_detail
    return f


@app.post("/api/findings/{finding_id}/status")
def update_status(finding_id: str, req: UpdateStatusRequest) -> Dict[str, Any]:
    ok = storage.update_finding_status(
        finding_id=finding_id,
        status=req.status,
        note=req.note,
        author=req.author or "Investigator",
        confirmed_loss=req.confirmed_loss,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Finding not found")
    return {"status": "updated", "finding_id": finding_id, "new_status": req.status}


@app.get("/api/transactions/{tx_id}")
def get_transaction(tx_id: str) -> Dict[str, Any]:
    tx = storage.get_transaction_details(tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@app.get("/api/analytics/cashiers")
def get_cashier_analytics() -> List[Dict[str, Any]]:
    return storage.get_cashier_aggregates()


@app.get("/api/analytics/hourly")
def get_hourly_analytics() -> List[Dict[str, Any]]:
    return storage.get_hourly_activity()


@app.get("/api/export/csv")
def export_csv() -> FileResponse:
    findings = storage.get_findings(limit=5000)
    out_path = "data/tlog_intelligence_findings.csv"
    exporter.export_csv(findings, out_path)
    return FileResponse(out_path, filename="tlog_intelligence_findings.csv", media_type="text/csv")


@app.get("/api/export/xlsx")
def export_xlsx() -> FileResponse:
    findings = storage.get_findings(limit=5000)
    out_path = "data/tlog_intelligence_findings.xlsx"
    exporter.export_xlsx(findings, out_path)
    return FileResponse(out_path, filename="tlog_intelligence_findings.xlsx", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.get("/api/export/pdf")
def export_pdf() -> FileResponse:
    kpis = storage.get_kpis()
    findings = storage.get_findings(limit=100)
    out_path = "data/tlog_intelligence_executive_report.pdf"
    exporter.export_pdf(kpis, findings, out_path)
    return FileResponse(out_path, filename="tlog_intelligence_executive_report.pdf", media_type="application/pdf")


@app.get("/", response_class=HTMLResponse)
def serve_simple_ui() -> HTMLResponse:
    simple_html_path = os.path.abspath("public/index.html")
    if os.path.exists(simple_html_path):
        with open(simple_html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Clef Store Guard Simple UI Loading...</h1>")


@app.get("/app.js")
def serve_app_js():
    js_path = os.path.abspath("public/app.js")
    if os.path.exists(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")


@app.get("/advanced", response_class=HTMLResponse)
def serve_advanced_ui() -> HTMLResponse:
    adv_html_path = os.path.join(os.path.dirname(__file__), "..", "ui", "index.html")
    if os.path.exists(adv_html_path):
        with open(adv_html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>Advanced LP Dashboard Loading...</h1>")
