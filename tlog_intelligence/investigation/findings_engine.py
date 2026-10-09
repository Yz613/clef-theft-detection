"""
Findings Synthesis and Clef Case Prioritization Engine.
Transforms rule triggers, unsupervised anomaly scores, and second-pass correlations
into compact structured cases, runs Clef System One joint inference, and produces
actionable loss-prevention findings with complete evidentiary backing.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from ..clef.client import ClefClient
from ..core.models import (
    AnomalyScore,
    ClefDecisionResult,
    ExceptionRuleTrigger,
    Finding,
    NormalizedTransaction,
)
from .second_pass import SecondPassInvestigator


class FindingsEngine:
    def __init__(self, clef_client: ClefClient):
        self.clef = clef_client

    def synthesize_findings(
        self,
        transactions: List[NormalizedTransaction],
        rule_triggers: List[ExceptionRuleTrigger],
        anomalies: List[AnomalyScore],
        cashier_baselines: Dict[str, Dict[str, float]],
        max_clef_cases: int = 50,
    ) -> List[Finding]:
        tx_map = {t.tx_id: t for t in transactions}
        second_pass = SecondPassInvestigator(transactions)
        findings: List[Finding] = []

        # Deduplicate candidates across triggers and anomalies by tx_id
        candidate_cases: Dict[str, Dict[str, Any]] = {}

        for tr in rule_triggers:
            cid = tr.tx_id
            if cid not in candidate_cases:
                candidate_cases[cid] = {
                    "tx_id": cid,
                    "triggers": [],
                    "anomalies": [],
                    "exposure": 0.0,
                    "store_id": tr.store_id,
                    "cashier_id": tr.cashier_id,
                }
            candidate_cases[cid]["triggers"].append(tr)
            candidate_cases[cid]["exposure"] = max(candidate_cases[cid]["exposure"], tr.financial_exposure)

        for an in anomalies:
            cid = an.entity_id
            if an.level == "TRANSACTION":
                if cid not in candidate_cases:
                    tx = tx_map.get(cid)
                    if tx:
                        candidate_cases[cid] = {
                            "tx_id": cid,
                            "triggers": [],
                            "anomalies": [],
                            "exposure": round(tx.total * 0.25, 2),
                            "store_id": tx.store_id,
                            "cashier_id": tx.cashier_id,
                        }
                if cid in candidate_cases:
                    candidate_cases[cid]["anomalies"].append(an)

        # Sort candidate cases by priority (severity + exposure)
        ranked_candidates = sorted(
            candidate_cases.values(),
            key=lambda c: (
                any(t.severity == "CRITICAL" for t in c["triggers"]),
                any(t.severity == "HIGH" for t in c["triggers"]),
                c["exposure"],
            ),
            reverse=True,
        )

        # Diversify candidate cases across cashiers so no single employee monopolizes findings
        cashier_case_counts: Dict[str, int] = {}
        cases_to_evaluate: List[Dict[str, Any]] = []
        for cand in ranked_candidates:
            cid = cand.get("cashier_id", "UNKNOWN")
            if cashier_case_counts.get(cid, 0) < 3:
                cases_to_evaluate.append(cand)
                cashier_case_counts[cid] = cashier_case_counts.get(cid, 0) + 1
            if len(cases_to_evaluate) >= max_clef_cases:
                break

        # Fill remaining slots if any
        if len(cases_to_evaluate) < max_clef_cases:
            for cand in ranked_candidates:
                if cand not in cases_to_evaluate:
                    cases_to_evaluate.append(cand)
                    if len(cases_to_evaluate) >= max_clef_cases:
                        break

        for case_data in cases_to_evaluate:
            tx_id = case_data["tx_id"]
            tx = tx_map.get(tx_id)
            if not tx:
                continue

            # Build human-readable observed events summary
            obs_events = []
            for ev in tx.events[:8]:
                etype = ev.get("event_type", "").replace("ITEM_", "").replace("TX_", "")
                desc = ev.get("item_desc") or ""
                price = float(ev.get("total_price", 0.0))
                if price > 0:
                    obs_events.append(f"{etype}: {desc} (${price:.2f})")
                else:
                    obs_events.append(f"{etype}: {desc or 'N/A'}")

            c_stats = cashier_baselines.get(tx.cashier_id, {})
            c_void_rate = c_stats.get("void_rate", 0.02)
            peer_void_rate = c_stats.get("peer_void_rate", 0.02)

            # Second-pass correlation
            upcs = [it.get("upc") for it in tx.items + tx.voided_items if it.get("upc")]
            corr = second_pass.correlate_case(
                primary_tx_id=tx.tx_id,
                cashier_id=tx.cashier_id,
                pattern_type=case_data["triggers"][0].rule_code if case_data["triggers"] else "anomaly",
                target_upcs=upcs,
            )

            # Build structured Clef state
            state_payload = {
                "case_type": "transaction_exception_review",
                "store_id": tx.store_id,
                "transaction_id": tx.tx_id,
                "observed_events": obs_events,
                "operator_void_rate": c_void_rate,
                "comparable_peer_void_rate": peer_void_rate,
                "other_similar_sequences": corr["related_count"],
                "financial_exposure_at_risk": case_data["exposure"],
                "data_quality": "complete",
            }

            # Execute Clef decision inference
            case_uuid = f"CASE_{uuid.uuid4().hex[:8]}"
            clef_dec = self.clef.predict(case_id=case_uuid, state=state_payload)

            # Determine Priority from Clef + Rules
            clef_prio = clef_dec.chosen_labels.get("review_priority", "medium").upper()
            if any(t.severity == "CRITICAL" for t in case_data["triggers"]):
                final_priority = "CRITICAL"
            elif clef_prio in ("HIGH", "CRITICAL") or any(t.severity == "HIGH" for t in case_data["triggers"]):
                final_priority = "HIGH"
            elif clef_prio == "LOW" and not case_data["triggers"]:
                final_priority = "LOW"
            else:
                final_priority = "MEDIUM"

            # Generate Phase 6 structured narrative
            finding = self._compose_finding(
                finding_id=f"FIND_{uuid.uuid4().hex[:8]}",
                tx=tx,
                case_data=case_data,
                clef_dec=clef_dec,
                correlation=corr,
                priority=final_priority,
            )
            findings.append(finding)

        # Sort findings by combined score and exposure
        findings.sort(key=lambda f: (f.priority == "CRITICAL", f.priority == "HIGH", f.combined_score, f.financial_exposure_at_risk), reverse=True)
        return findings

    def _compose_finding(
        self,
        finding_id: str,
        tx: NormalizedTransaction,
        case_data: Dict[str, Any],
        clef_dec: ClefDecisionResult,
        correlation: Dict[str, Any],
        priority: str,
    ) -> Finding:
        triggers: List[ExceptionRuleTrigger] = case_data["triggers"]
        anomalies: List[AnomalyScore] = case_data["anomalies"]

        # Synthesize Title & What Happened
        if triggers:
            tr0 = triggers[0]
            title = tr0.title
            category = tr0.category
            what_happened = f"Observed {tr0.title.lower()} during checkout on register {tx.register_id}. {tr0.description}"
        elif anomalies:
            an0 = anomalies[0]
            title = an0.label
            category = "UNSUPERVISED_ANOMALY"
            what_happened = f"Unsupervised detection surfaced {an0.label.lower()}. Factors: {'; '.join(an0.contributing_factors)}"
        else:
            title = "Atypical Transaction Sequence"
            category = "TRANSACTION"
            what_happened = f"Transaction {tx.tx_id} exhibited irregular event order and pricing flow."

        # Why unusual
        clef_pattern = clef_dec.chosen_labels.get("pattern_type", "unknown").replace("_", " ")
        why_unusual = (
            f"Clef classified behavior as '{clef_pattern}'. "
            f"Cashier {tx.cashier_id} processed transaction with {len(tx.voided_items)} voids and {tx.manual_entry_count} manual entries. "
            f"Second-pass analysis discovered {correlation['related_count']} similar sequence(s) across registers {correlation['connected_registers']}."
        )

        all_tx_ids = [tx.tx_id] + correlation["related_transaction_ids"]

        # Scope
        stores = list({tx.store_id})
        regs = list({tx.register_id} | set(correlation["connected_registers"]))
        cashiers = list({tx.cashier_id} | set(correlation["connected_cashiers"]))

        # Exposure
        at_risk = case_data["exposure"]
        confirmed_loss = 0.0  # Confirmed loss starts strictly at 0.0 until investigator verifies!

        # Alternative explanations
        alts = [
            "Customer had insufficient funds or changed mind at checkout, causing legitimate item void/removal.",
            "Produce scale or barcode reader malfunction requiring manual cashier PLU entry.",
            "Customer requested price-match guarantee against competitor ad.",
        ]

        # Recommended investigation
        rec_inv = (
            f"Review checkout CCTV video for Register {tx.register_id} at {tx.start_time}. "
            f"Verify if voided merchandise was bagged or retained by customer, and inspect register cash drawer count for cashier {tx.cashier_id}."
        )

        clef_conf = clef_dec.confidence_scores.get("review_priority", 0.70)
        anom_strength = anomalies[0].score if anomalies else 0.50
        evidence_comp = 0.95 if len(tx.events) >= 3 else 0.70

        combined = round(0.40 * clef_conf + 0.35 * anom_strength + 0.25 * (1.0 if triggers else 0.5), 3)

        return Finding(
            finding_id=finding_id,
            title=title,
            what_happened=what_happened,
            why_unusual=why_unusual,
            evidence_tx_ids=all_tx_ids,
            supporting_events=tx.events,
            store_ids=stores,
            register_ids=regs,
            cashier_ids=cashiers,
            event_count=len(tx.events),
            financial_exposure_at_risk=round(at_risk, 2),
            confirmed_financial_loss=confirmed_loss,
            alternative_explanations=alts,
            recommended_investigation=rec_inv,
            evidence_completeness=evidence_comp,
            anomaly_strength=anom_strength,
            clef_confidence=clef_conf,
            combined_score=combined,
            priority=priority,
            category=category,
            clef_decision=clef_dec,
        )
