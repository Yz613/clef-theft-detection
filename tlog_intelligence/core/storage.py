"""
Analytical Storage Engine for T-Log Intelligence.
Utilizes DuckDB for blazing-fast columnar analytical queries,
Parquet integration, indexing, deduplication, and local persistence.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional
import duckdb

from .models import (
    AnomalyScore,
    ClefDecisionResult,
    ExceptionRuleTrigger,
    Finding,
    NormalizedEvent,
    NormalizedTransaction,
)


class StorageEngine:
    def __init__(self, db_path: str = "data/tlog_intelligence.duckdb"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = duckdb.connect(self.db_path)
        self._init_schema()

    def _init_schema(self) -> None:
        """Initializes tables, views, and indexes."""
        # Events Table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS events (
                event_id VARCHAR PRIMARY KEY,
                tx_id VARCHAR NOT NULL,
                store_id VARCHAR NOT NULL,
                register_id VARCHAR NOT NULL,
                cashier_id VARCHAR NOT NULL,
                timestamp VARCHAR NOT NULL,
                event_seq INTEGER NOT NULL,
                event_type VARCHAR NOT NULL,
                supervisor_id VARCHAR,
                item_upc VARCHAR,
                item_desc VARCHAR,
                item_dept VARCHAR,
                quantity DOUBLE DEFAULT 1.0,
                unit_price DOUBLE DEFAULT 0.0,
                total_price DOUBLE DEFAULT 0.0,
                is_scan BOOLEAN DEFAULT TRUE,
                is_manual BOOLEAN DEFAULT FALSE,
                tender_type VARCHAR,
                tender_amount DOUBLE DEFAULT 0.0,
                override_type VARCHAR,
                reason_code VARCHAR,
                source_file VARCHAR,
                raw_data VARCHAR
            );
            CREATE INDEX IF NOT EXISTS idx_events_tx ON events(tx_id, store_id);
            CREATE INDEX IF NOT EXISTS idx_events_cashier ON events(cashier_id);
            CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
        """)

        # Transactions Table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                tx_id VARCHAR PRIMARY KEY,
                store_id VARCHAR NOT NULL,
                register_id VARCHAR NOT NULL,
                cashier_id VARCHAR NOT NULL,
                supervisor_id VARCHAR,
                start_time VARCHAR NOT NULL,
                end_time VARCHAR NOT NULL,
                duration_seconds DOUBLE DEFAULT 0.0,
                status VARCHAR NOT NULL,
                item_count INTEGER DEFAULT 0,
                void_count INTEGER DEFAULT 0,
                manual_entry_count INTEGER DEFAULT 0,
                override_count INTEGER DEFAULT 0,
                drawer_open_count INTEGER DEFAULT 0,
                subtotal DOUBLE DEFAULT 0.0,
                tax DOUBLE DEFAULT 0.0,
                total DOUBLE DEFAULT 0.0,
                tender_total DOUBLE DEFAULT 0.0,
                change_due DOUBLE DEFAULT 0.0,
                is_sco BOOLEAN DEFAULT FALSE,
                items_json VARCHAR,
                voided_items_json VARCHAR,
                tenders_json VARCHAR,
                discounts_json VARCHAR,
                event_types_str VARCHAR,
                source_files_json VARCHAR
            );
            CREATE INDEX IF NOT EXISTS idx_tx_cashier ON transactions(cashier_id);
            CREATE INDEX IF NOT EXISTS idx_tx_store ON transactions(store_id);
            CREATE INDEX IF NOT EXISTS idx_tx_time ON transactions(start_time);
            CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
        """)

        # Rule Triggers Table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS rule_triggers (
                trigger_id VARCHAR PRIMARY KEY,
                rule_code VARCHAR NOT NULL,
                category VARCHAR NOT NULL,
                severity VARCHAR NOT NULL,
                title VARCHAR NOT NULL,
                description VARCHAR NOT NULL,
                tx_id VARCHAR NOT NULL,
                store_id VARCHAR NOT NULL,
                cashier_id VARCHAR NOT NULL,
                register_id VARCHAR NOT NULL,
                timestamp VARCHAR NOT NULL,
                financial_exposure DOUBLE DEFAULT 0.0,
                related_tx_json VARCHAR,
                supporting_events_json VARCHAR,
                details_json VARCHAR
            );
            CREATE INDEX IF NOT EXISTS idx_rules_tx ON rule_triggers(tx_id);
            CREATE INDEX IF NOT EXISTS idx_rules_cashier ON rule_triggers(cashier_id);
            CREATE INDEX IF NOT EXISTS idx_rules_code ON rule_triggers(rule_code);
        """)

        # Anomaly Scores Table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS anomaly_scores (
                anomaly_id VARCHAR PRIMARY KEY,
                level VARCHAR NOT NULL,
                entity_id VARCHAR NOT NULL,
                score DOUBLE NOT NULL,
                method VARCHAR NOT NULL,
                label VARCHAR NOT NULL,
                features_json VARCHAR,
                contributing_factors_json VARCHAR,
                related_tx_json VARCHAR
            );
            CREATE INDEX IF NOT EXISTS idx_anom_entity ON anomaly_scores(entity_id);
            CREATE INDEX IF NOT EXISTS idx_anom_level ON anomaly_scores(level);
        """)

        # Findings Table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS findings (
                finding_id VARCHAR PRIMARY KEY,
                title VARCHAR NOT NULL,
                what_happened VARCHAR NOT NULL,
                why_unusual VARCHAR NOT NULL,
                evidence_tx_ids_json VARCHAR NOT NULL,
                supporting_events_json VARCHAR,
                store_ids_json VARCHAR,
                register_ids_json VARCHAR,
                cashier_ids_json VARCHAR,
                event_count INTEGER DEFAULT 1,
                financial_exposure_at_risk DOUBLE DEFAULT 0.0,
                confirmed_financial_loss DOUBLE DEFAULT 0.0,
                alternative_explanations_json VARCHAR,
                recommended_investigation VARCHAR,
                evidence_completeness DOUBLE DEFAULT 1.0,
                anomaly_strength DOUBLE DEFAULT 0.0,
                clef_confidence DOUBLE DEFAULT 0.0,
                combined_score DOUBLE DEFAULT 0.0,
                priority VARCHAR NOT NULL,
                category VARCHAR NOT NULL,
                status VARCHAR DEFAULT 'NEW',
                investigator_notes_json VARCHAR,
                clef_decision_json VARCHAR,
                created_at VARCHAR NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_findings_priority ON findings(priority);
            CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
        """)

        # Mapping Profiles Table
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS mapping_profiles (
                profile_id VARCHAR PRIMARY KEY,
                vendor_name VARCHAR NOT NULL,
                customer_name VARCHAR NOT NULL,
                file_format VARCHAR NOT NULL,
                mapping_config_json VARCHAR NOT NULL,
                created_at VARCHAR NOT NULL
            );
        """)

    def insert_events_batch(self, events: List[NormalizedEvent]) -> int:
        """Inserts a batch of events with deduplication."""
        if not events:
            return 0
        records = []
        for e in events:
            records.append((
                e.event_id,
                e.tx_id,
                e.store_id,
                e.register_id,
                e.cashier_id,
                e.timestamp,
                e.event_seq,
                e.event_type,
                e.supervisor_id,
                e.item_upc,
                e.item_desc,
                e.item_dept,
                e.quantity,
                e.unit_price,
                e.total_price,
                e.is_scan,
                e.is_manual,
                e.tender_type,
                e.tender_amount,
                e.override_type,
                e.reason_code,
                e.source_file,
                json.dumps(e.raw_data) if e.raw_data else "{}",
            ))
        self.conn.begin()
        self.conn.executemany("""
            INSERT OR REPLACE INTO events VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, records)
        self.conn.commit()
        return len(records)

    def insert_transactions_batch(self, txs: List[NormalizedTransaction]) -> int:
        """Inserts a batch of reconstructed transactions."""
        if not txs:
            return 0
        records = []
        for t in txs:
            records.append((
                t.tx_id,
                t.store_id,
                t.register_id,
                t.cashier_id,
                t.supervisor_id,
                t.start_time,
                t.end_time,
                t.duration_seconds,
                t.status,
                t.item_count,
                t.void_count,
                t.manual_entry_count,
                t.override_count,
                t.drawer_open_count,
                t.subtotal,
                t.tax,
                t.total,
                t.tender_total,
                t.change_due,
                t.is_sco,
                json.dumps(t.items),
                json.dumps(t.voided_items),
                json.dumps(t.tenders),
                json.dumps(t.discounts),
                " ".join(t.event_types),
                json.dumps(t.source_files),
            ))
        self.conn.begin()
        self.conn.executemany("""
            INSERT OR REPLACE INTO transactions VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, records)
        self.conn.commit()
        return len(records)

    def insert_rule_triggers_batch(self, triggers: List[ExceptionRuleTrigger]) -> int:
        if not triggers:
            return 0
        records = []
        for i, tr in enumerate(triggers):
            tr_id = f"{tr.rule_code}_{tr.tx_id}_{i}"
            records.append((
                tr_id,
                tr.rule_code,
                tr.category,
                tr.severity,
                tr.title,
                tr.description,
                tr.tx_id,
                tr.store_id,
                tr.cashier_id,
                tr.register_id,
                tr.timestamp,
                tr.financial_exposure,
                json.dumps(tr.related_transactions),
                json.dumps(tr.supporting_events),
                json.dumps(tr.details),
            ))
        self.conn.executemany("""
            INSERT OR REPLACE INTO rule_triggers VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, records)
        return len(records)

    def insert_anomalies_batch(self, anomalies: List[AnomalyScore]) -> int:
        if not anomalies:
            return 0
        records = []
        for a in anomalies:
            records.append((
                a.anomaly_id,
                a.level,
                a.entity_id,
                a.score,
                a.method,
                a.label,
                json.dumps(a.features),
                json.dumps(a.contributing_factors),
                json.dumps(a.related_transactions),
            ))
        self.conn.executemany("""
            INSERT OR REPLACE INTO anomaly_scores VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, records)
        return len(records)

    def insert_findings_batch(self, findings: List[Finding]) -> int:
        if not findings:
            return 0
        records = []
        for f in findings:
            records.append((
                f.finding_id,
                f.title,
                f.what_happened,
                f.why_unusual,
                json.dumps(f.evidence_tx_ids),
                json.dumps(f.supporting_events),
                json.dumps(f.store_ids),
                json.dumps(f.register_ids),
                json.dumps(f.cashier_ids),
                f.event_count,
                f.financial_exposure_at_risk,
                f.confirmed_financial_loss,
                json.dumps(f.alternative_explanations),
                f.recommended_investigation,
                f.evidence_completeness,
                f.anomaly_strength,
                f.clef_confidence,
                f.combined_score,
                f.priority,
                f.category,
                f.status,
                json.dumps(f.investigator_notes),
                json.dumps(f.clef_decision.to_dict()) if f.clef_decision else None,
                f.created_at,
            ))
        self.conn.executemany("""
            INSERT OR REPLACE INTO findings VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        """, records)
        return len(records)

    def update_finding_status(
        self,
        finding_id: str,
        status: str,
        note: Optional[str] = None,
        author: str = "Investigator",
        confirmed_loss: Optional[float] = None,
    ) -> bool:
        cur = self.conn.execute("SELECT investigator_notes_json, confirmed_financial_loss FROM findings WHERE finding_id = ?", [finding_id]).fetchone()
        if not cur:
            return False
        notes = json.loads(cur[0] or "[]")
        loss = cur[1] if confirmed_loss is None else confirmed_loss
        if note:
            import datetime
            notes.append({
                "author": author,
                "timestamp": datetime.datetime.now().isoformat(),
                "text": note,
                "status_applied": status,
            })
        self.conn.execute("""
            UPDATE findings
            SET status = ?, investigator_notes_json = ?, confirmed_financial_loss = ?
            WHERE finding_id = ?
        """, [status, json.dumps(notes), loss, finding_id])
        return True

    def get_kpis(self) -> Dict[str, Any]:
        tx_stats = self.conn.execute("""
            SELECT
                COUNT(*) as total_transactions,
                COUNT(DISTINCT store_id) as store_count,
                COUNT(DISTINCT cashier_id) as cashier_count,
                MIN(start_time) as min_date,
                MAX(end_time) as max_date,
                SUM(total) as gross_sales,
                SUM(CASE WHEN void_count > 0 THEN void_count ELSE 0 END) as total_voids
            FROM transactions
        """).fetchone()

        findings_stats = self.conn.execute("""
            SELECT
                COUNT(*) as total_findings,
                SUM(CASE WHEN priority IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END) as high_priority_count,
                SUM(financial_exposure_at_risk) as total_exposure_at_risk,
                SUM(confirmed_financial_loss) as confirmed_loss,
                SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END) as unreviewed_count
            FROM findings
        """).fetchone()

        anom_count = self.conn.execute("SELECT COUNT(*) FROM anomaly_scores").fetchone()[0]
        rule_count = self.conn.execute("SELECT COUNT(*) FROM rule_triggers").fetchone()[0]

        return {
            "total_transactions": tx_stats[0] or 0,
            "store_count": tx_stats[1] or 0,
            "cashier_count": tx_stats[2] or 0,
            "date_range_start": tx_stats[3] or "",
            "date_range_end": tx_stats[4] or "",
            "gross_sales": round(tx_stats[5] or 0.0, 2),
            "total_voids": tx_stats[6] or 0,
            "total_findings": findings_stats[0] or 0,
            "high_priority_findings": findings_stats[1] or 0,
            "total_exposure_at_risk": round(findings_stats[2] or 0.0, 2),
            "confirmed_loss": round(findings_stats[3] or 0.0, 2),
            "unreviewed_count": findings_stats[4] or 0,
            "total_anomalies_discovered": anom_count,
            "total_rule_exceptions": rule_count,
        }

    def get_findings(
        self,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM findings WHERE 1=1"
        params = []
        if priority:
            query += " AND priority = ?"
            params.append(priority)
        if status:
            query += " AND status = ?"
            params.append(status)
        if category:
            query += " AND category = ?"
            params.append(category)
        if search:
            query += " AND (title ILIKE ? OR what_happened ILIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY combined_score DESC, financial_exposure_at_risk DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = self.conn.execute(query, params).fetchall()
        cols = [desc[0] for desc in self.conn.description]
        results = []
        for row in rows:
            d = dict(zip(cols, row))
            for json_col in [
                "evidence_tx_ids_json",
                "supporting_events_json",
                "store_ids_json",
                "register_ids_json",
                "cashier_ids_json",
                "alternative_explanations_json",
                "investigator_notes_json",
                "clef_decision_json",
            ]:
                if d.get(json_col):
                    clean_name = json_col.replace("_json", "")
                    try:
                        d[clean_name] = json.loads(d[json_col])
                    except Exception:
                        d[clean_name] = d[json_col]
            results.append(d)
        return results

    def get_transaction_details(self, tx_id: str) -> Optional[Dict[str, Any]]:
        tx_row = self.conn.execute("SELECT * FROM transactions WHERE tx_id = ?", [tx_id]).fetchone()
        if not tx_row:
            return None
        cols = [desc[0] for desc in self.conn.description]
        tx = dict(zip(cols, tx_row))
        for jcol in ["items_json", "voided_items_json", "tenders_json", "discounts_json", "source_files_json"]:
            if tx.get(jcol):
                try:
                    tx[jcol.replace("_json", "")] = json.loads(tx[jcol])
                except Exception:
                    pass

        # Fetch events
        events_rows = self.conn.execute(
            "SELECT * FROM events WHERE tx_id = ? ORDER BY event_seq ASC", [tx_id]
        ).fetchall()
        e_cols = [desc[0] for desc in self.conn.description]
        events = [dict(zip(e_cols, er)) for er in events_rows]
        for e in events:
            if e.get("raw_data"):
                try:
                    e["raw_data"] = json.loads(e["raw_data"])
                except Exception:
                    pass
        tx["timeline_events"] = events
        return tx

    def get_cashier_aggregates(self) -> List[Dict[str, Any]]:
        rows = self.conn.execute("""
            SELECT
                cashier_id,
                COUNT(*) as tx_count,
                SUM(item_count) as total_items,
                SUM(void_count) as total_voids,
                SUM(manual_entry_count) as total_manual_entries,
                SUM(override_count) as total_overrides,
                SUM(drawer_open_count) as total_no_sales,
                ROUND(AVG(total), 2) as avg_basket,
                ROUND(SUM(void_count)::FLOAT / NULLIF(SUM(item_count), 0), 4) as void_rate,
                ROUND(SUM(manual_entry_count)::FLOAT / NULLIF(SUM(item_count), 0), 4) as manual_rate,
                ROUND(SUM(drawer_open_count)::FLOAT / NULLIF(COUNT(*), 0), 4) as no_sale_rate
            FROM transactions
            GROUP BY cashier_id
            ORDER BY tx_count DESC
        """).fetchall()
        cols = [desc[0] for desc in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def get_hourly_activity(self) -> List[Dict[str, Any]]:
        rows = self.conn.execute("""
            SELECT
                SUBSTR(start_time, 12, 2) as hour_of_day,
                COUNT(*) as tx_count,
                SUM(void_count) as void_count,
                SUM(manual_entry_count) as manual_count,
                SUM(drawer_open_count) as drawer_opens,
                ROUND(SUM(total), 2) as total_volume
            FROM transactions
            WHERE LENGTH(start_time) >= 13
            GROUP BY hour_of_day
            ORDER BY hour_of_day ASC
        """).fetchall()
        cols = [desc[0] for desc in self.conn.description]
        return [dict(zip(cols, r)) for r in rows]

    def close(self) -> None:
        self.conn.close()
