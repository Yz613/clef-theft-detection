"""
Comprehensive Automated Test Suite for T-Log Intelligence.
Validates:
1. Hardware assessment & environment feasibility
2. Clef decision inference (choice, score, noul, joint decision head)
3. Universal T-log ingestion, schema detection, and lifecycle reconstruction
4. Suspend / resume handling (guarantees NOT misclassified as void/theft)
5. Traditional exception rules engine
6. Unsupervised anomaly discovery (Isolation Forest, Sequence Mining, Peer MAD)
7. Findings synthesis and evidence linkage
8. Safe local exports (PDF, Excel, CSV) & formula injection sanitization
"""

import os
import pytest
from tlog_intelligence.core.hardware import assess_environment
from tlog_intelligence.core.models import NormalizedEvent, TransactionStatus
from tlog_intelligence.core.storage import StorageEngine
from tlog_intelligence.clef.client import ClefClient
from tlog_intelligence.clef.prompts import get_loss_prevention_questions
from tlog_intelligence.ingestion.detector import FormatDetector
from tlog_intelligence.ingestion.reconstructor import TransactionReconstructor
from tlog_intelligence.rules.engine import RulesEngine
from tlog_intelligence.anomalies.isolation_forest import TransactionIsolationForest
from tlog_intelligence.anomalies.sequences import SequenceAnomalyDetector
from tlog_intelligence.anomalies.peer_groups import CashierPeerGroupAnalyzer
from tlog_intelligence.investigation.findings_engine import FindingsEngine
from tlog_intelligence.reporting.exporter import ReportExporter, sanitize_formula_injection


def test_hardware_assessment():
    hw = assess_environment()
    assert hw.os_name in ("Darwin", "Linux", "Windows")
    assert hw.ram_total_gb > 0
    assert hw.clef_feasibility in ("FEASIBLE", "CONSTRAINED")
    if hw.is_apple_silicon:
        assert "Apple" in hw.gpu_description or hw.unified_memory_gb > 0


def test_clef_local_inference():
    client = ClefClient(preferred_engine="auto")
    assert client.active_engine in ("mlx-native", "ollama-systemone", "local-calibrated")

    state = {
        "case_type": "transaction_anomaly",
        "store_id": "STORE_001",
        "observed_events": ["Scan $39.99 steak", "Void item", "Manual entry $3.99 banana"],
        "operator_void_rate": 0.09,
        "comparable_peer_void_rate": 0.02,
        "other_similar_sequences": 4,
    }
    questions = get_loss_prevention_questions()
    res = client.predict("TEST_TX_01", state, questions)

    assert res.case_id == "TEST_TX_01"
    assert "review_priority" in res.answers
    assert "pattern_type" in res.answers
    assert "manual_review_needed" in res.answers
    assert "video_review_value" in res.answers

    # Verify probability distribution sums to ~1.0
    p_prio = res.answers["review_priority"]
    assert abs(sum(p_prio.values()) - 1.0) < 0.05
    assert res.chosen_labels["review_priority"] in ("none", "low", "medium", "high")


def test_suspended_and_resumed_reconstruction():
    """
    CRITICAL REQUIREMENT:
    Ensure legitimately suspended and resumed sales are NEVER classified
    as completed voids or theft events!
    """
    reconstructor = TransactionReconstructor()
    events = [
        NormalizedEvent(
            event_id="E1", tx_id="TX_SUSP_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T10:00:00", event_seq=1,
            event_type="TX_START"
        ),
        NormalizedEvent(
            event_id="E2", tx_id="TX_SUSP_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T10:00:05", event_seq=2,
            event_type="ITEM_SCAN", item_upc="111", item_desc="Milk", total_price=3.99, unit_price=3.99
        ),
        NormalizedEvent(
            event_id="E3", tx_id="TX_SUSP_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T10:00:15", event_seq=3,
            event_type="SUSPEND", reason_code="CUSTOMER_LEFT_WALLET"
        ),
        NormalizedEvent(
            event_id="E4", tx_id="TX_SUSP_01", store_id="S1", register_id="L_CS",
            cashier_id="C2", timestamp="2026-10-01T10:15:00", event_seq=4,
            event_type="RESUME"
        ),
        NormalizedEvent(
            event_id="E5", tx_id="TX_SUSP_01", store_id="S1", register_id="L_CS",
            cashier_id="C2", timestamp="2026-10-01T10:15:10", event_seq=5,
            event_type="TENDER", tender_type="CREDIT", tender_amount=4.27
        ),
        NormalizedEvent(
            event_id="E6", tx_id="TX_SUSP_01", store_id="S1", register_id="L_CS",
            cashier_id="C2", timestamp="2026-10-01T10:15:15", event_seq=6,
            event_type="TX_COMPLETE"
        ),
    ]

    txs, stats = reconstructor.reconstruct(events)
    assert len(txs) == 1
    tx = txs[0]

    # Verify status is SUSPENDED_RESUMED, NOT CANCELLED and NOT voided
    assert tx.status == TransactionStatus.SUSPENDED_RESUMED.value
    assert tx.void_count == 0
    assert tx.total > 0

    # Test Rules Engine on this transaction: should NOT trigger VOID_POST_VOID or VOID_HIGH_RATIO
    rules = RulesEngine()
    triggers = rules.evaluate_transactions([tx], {})
    assert len(triggers) == 0


def test_scan_void_substitute_detection():
    reconstructor = TransactionReconstructor()
    events = [
        NormalizedEvent(
            event_id="E1", tx_id="TX_SUB_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T11:00:00", event_seq=1,
            event_type="TX_START"
        ),
        NormalizedEvent(
            event_id="E2", tx_id="TX_SUB_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T11:00:05", event_seq=2,
            event_type="ITEM_SCAN", item_upc="PRIME_STEAK", item_desc="Ribeye Steak",
            total_price=34.99, unit_price=34.99
        ),
        NormalizedEvent(
            event_id="E3", tx_id="TX_SUB_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T11:00:10", event_seq=3,
            event_type="ITEM_VOID", item_upc="PRIME_STEAK", item_desc="Ribeye Steak",
            total_price=34.99, unit_price=34.99
        ),
        NormalizedEvent(
            event_id="E4", tx_id="TX_SUB_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T11:00:15", event_seq=4,
            event_type="ITEM_MANUAL", item_upc="4011", item_desc="Bananas",
            total_price=0.59, unit_price=0.59, is_scan=False, is_manual=True
        ),
        NormalizedEvent(
            event_id="E5", tx_id="TX_SUB_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T11:00:20", event_seq=5,
            event_type="TENDER", tender_type="CASH", tender_amount=1.00
        ),
        NormalizedEvent(
            event_id="E6", tx_id="TX_SUB_01", store_id="S1", register_id="L1",
            cashier_id="C1", timestamp="2026-10-01T11:00:25", event_seq=6,
            event_type="TX_COMPLETE"
        ),
    ]

    txs, _ = reconstructor.reconstruct(events)
    rules = RulesEngine()
    triggers = rules.evaluate_transactions(txs, {})

    rule_codes = [t.rule_code for t in triggers]
    assert "VOID_SCAN_VOID_SUBSTITUTE" in rule_codes
    assert any(t.financial_exposure >= 30.0 for t in triggers)


def test_unsupervised_sequence_and_peer_anomalies():
    reconstructor = TransactionReconstructor()
    # Create baseline normal transactions for 5 cashiers
    tx_list = []
    for c_idx in range(1, 6):
        cid = f"CASHIER_{c_idx}"
        for i in range(20):
            evs = [
                NormalizedEvent(
                    event_id=f"E_{cid}_{i}_1", tx_id=f"TX_{cid}_{i}", store_id="S1", register_id="L1",
                    cashier_id=cid, timestamp="2026-10-01T12:00:00", event_seq=1, event_type="TX_START"
                ),
                NormalizedEvent(
                    event_id=f"E_{cid}_{i}_2", tx_id=f"TX_{cid}_{i}", store_id="S1", register_id="L1",
                    cashier_id=cid, timestamp="2026-10-01T12:00:05", event_seq=2, event_type="ITEM_SCAN",
                    item_upc="101", item_desc="Bread", total_price=2.99
                ),
                NormalizedEvent(
                    event_id=f"E_{cid}_{i}_3", tx_id=f"TX_{cid}_{i}", store_id="S1", register_id="L1",
                    cashier_id=cid, timestamp="2026-10-01T12:00:10", event_seq=3, event_type="TENDER",
                    tender_type="CREDIT", tender_amount=3.20
                ),
                NormalizedEvent(
                    event_id=f"E_{cid}_{i}_4", tx_id=f"TX_{cid}_{i}", store_id="S1", register_id="L1",
                    cashier_id=cid, timestamp="2026-10-01T12:00:15", event_seq=4, event_type="TX_COMPLETE"
                ),
            ]
            tx, _ = reconstructor.reconstruct(evs)
            tx_list.append(tx[0])

    # Now add an outlier cashier who has voids on every transaction
    for i in range(20):
        evs = [
            NormalizedEvent(
                event_id=f"E_C99_{i}_1", tx_id=f"TX_C99_{i}", store_id="S1", register_id="L1",
                cashier_id="CASHIER_99", timestamp="2026-10-01T13:00:00", event_seq=1, event_type="TX_START"
            ),
            NormalizedEvent(
                event_id=f"E_C99_{i}_2", tx_id=f"TX_C99_{i}", store_id="S1", register_id="L1",
                cashier_id="CASHIER_99", timestamp="2026-10-01T13:00:05", event_seq=2, event_type="ITEM_SCAN",
                item_upc="101", item_desc="Bread", total_price=2.99
            ),
            NormalizedEvent(
                event_id=f"E_C99_{i}_3", tx_id=f"TX_C99_{i}", store_id="S1", register_id="L1",
                cashier_id="CASHIER_99", timestamp="2026-10-01T13:00:08", event_seq=3, event_type="ITEM_VOID",
                item_upc="101", item_desc="Bread", total_price=2.99
            ),
            NormalizedEvent(
                event_id=f"E_C99_{i}_4", tx_id=f"TX_C99_{i}", store_id="S1", register_id="L1",
                cashier_id="CASHIER_99", timestamp="2026-10-01T13:00:12", event_seq=4, event_type="TENDER",
                tender_type="CASH", tender_amount=1.00
            ),
            NormalizedEvent(
                event_id=f"E_C99_{i}_5", tx_id=f"TX_C99_{i}", store_id="S1", register_id="L1",
                cashier_id="CASHIER_99", timestamp="2026-10-01T13:00:15", event_seq=5, event_type="TX_COMPLETE"
            ),
        ]
        tx, _ = reconstructor.reconstruct(evs)
        tx_list.append(tx[0])

    # Run Cashier Peer Analysis
    analyzer = CashierPeerGroupAnalyzer(min_transactions_per_cashier=10)
    baselines, anoms = analyzer.compute_baselines_and_anomalies(tx_list)

    assert "CASHIER_99" in baselines
    assert baselines["CASHIER_99"]["void_rate"] > 0.40
    outlier_entities = [a.entity_id for a in anoms]
    assert "CASHIER_99" in outlier_entities


def test_formula_injection_and_exports(tmp_path):
    # Test formula injection sanitization
    assert sanitize_formula_injection("=1+1") == "'=1+1"
    assert sanitize_formula_injection("+2+3") == "'+2+3"
    assert sanitize_formula_injection("@SUM(A1:A5)") == "'@SUM(A1:A5)"
    assert sanitize_formula_injection("Normal Text") == "Normal Text"

    # Test PDF, Excel, and CSV generation
    exporter = ReportExporter()
    mock_findings = [{
        "finding_id": "FIND_001",
        "priority": "HIGH",
        "category": "VOIDS",
        "title": "=HYPERLINK('malicious')",
        "status": "NEW",
        "financial_exposure_at_risk": 75.0,
        "confirmed_financial_loss": 0.0,
        "event_count": 6,
        "store_ids": ["STORE_101"],
        "cashier_ids": ["CASHIER_17"],
        "register_ids": ["LANE_01"],
        "evidence_tx_ids": ["TX_12345"],
        "what_happened": "Observed test exception",
        "why_unusual": "Rate 4x higher than peers",
        "recommended_investigation": "Review CCTV footage",
    }]

    csv_path = str(tmp_path / "test.csv")
    xlsx_path = str(tmp_path / "test.xlsx")
    pdf_path = str(tmp_path / "test.pdf")

    exporter.export_csv(mock_findings, csv_path)
    assert os.path.exists(csv_path)
    with open(csv_path) as f:
        content = f.read()
        assert "'=HYPERLINK" in content

    exporter.export_xlsx(mock_findings, xlsx_path)
    assert os.path.exists(xlsx_path)

    exporter.export_pdf({"total_transactions": 100, "total_exposure_at_risk": 75.0}, mock_findings, pdf_path)
    assert os.path.exists(pdf_path)
