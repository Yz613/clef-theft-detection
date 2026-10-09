"""
Deterministic Exception Rules Engine.
Evaluates normalized transactions against the loss-prevention rule catalog.
Computes financial exposure at risk and captures exact supporting event chains.
"""

from __future__ import annotations

from typing import Any, Dict, List

from ..core.models import ExceptionRuleTrigger, NormalizedTransaction, TransactionStatus
from .catalog import RULE_DEFINITIONS


class RulesEngine:
    def __init__(self):
        self.rules_by_code = {r["code"]: r for r in RULE_DEFINITIONS}

    def evaluate_transactions(
        self,
        transactions: List[NormalizedTransaction],
        cashier_baselines: Dict[str, Dict[str, float]],
    ) -> List[ExceptionRuleTrigger]:
        triggers: List[ExceptionRuleTrigger] = []

        for tx in transactions:
            # Skip legitimate suspended and resumed transactions for void/cancellation false positives
            is_legit_suspend = tx.status == TransactionStatus.SUSPENDED_RESUMED.value

            # 1. Post-Void
            if tx.status == TransactionStatus.POST_VOIDED.value:
                triggers.append(self._make_trigger(
                    "VOID_POST_VOID", tx, tx.total,
                    details={"total_post_voided": tx.total, "item_count": tx.item_count}
                ))

            # 2. Voids Analysis
            if tx.void_count > 0 and not is_legit_suspend:
                total_items_handled = tx.item_count + tx.void_count
                void_ratio = tx.void_count / max(1, total_items_handled)

                # High void ratio
                if void_ratio >= 0.30 and tx.void_count >= 2:
                    void_val = sum(v.get("total_price", 0.0) for v in tx.voided_items)
                    triggers.append(self._make_trigger(
                        "VOID_HIGH_RATIO", tx, void_val,
                        details={"void_count": tx.void_count, "void_ratio": round(void_ratio, 3)}
                    ))

                # High value void
                for v in tx.voided_items:
                    v_price = float(v.get("total_price", 0.0))
                    if v_price >= 35.00:
                        triggers.append(self._make_trigger(
                            "VOID_HIGH_VALUE", tx, v_price,
                            details={"voided_item": v.get("desc"), "price": v_price, "upc": v.get("upc")}
                        ))

            # 3. Scan-Void-Substitute Sequence
            # Pattern: Item scan > $15, followed by VOID of that item, followed by manual item or PLU < $5
            ev_types = [e.get("event_type") for e in tx.events]
            for i in range(len(tx.events) - 2):
                e1, e2, e3 = tx.events[i], tx.events[i+1], tx.events[i+2]
                if (
                    e1.get("event_type") == "ITEM_SCAN"
                    and float(e1.get("total_price", 0)) >= 15.0
                    and e2.get("event_type") == "ITEM_VOID"
                    and e2.get("item_upc") == e1.get("item_upc")
                    and (e3.get("is_manual") or float(e3.get("total_price", 0)) <= 5.0)
                ):
                    price_diff = float(e1.get("total_price", 0)) - float(e3.get("total_price", 0))
                    triggers.append(self._make_trigger(
                        "VOID_SCAN_VOID_SUBSTITUTE", tx, price_diff,
                        details={
                            "scanned_item": e1.get("item_desc"),
                            "voided_item": e2.get("item_desc"),
                            "substitute_item": e3.get("item_desc"),
                            "price_diff": round(price_diff, 2),
                        }
                    ))
                    break

            # 4. Cash Drawer Open Near Void
            for i in range(len(tx.events) - 1):
                e1, e2 = tx.events[i], tx.events[i+1]
                if (
                    (e1.get("event_type") == "ITEM_VOID" and e2.get("event_type") in ("DRAWER_OPEN", "NO_SALE"))
                    or (e1.get("event_type") in ("DRAWER_OPEN", "NO_SALE") and e2.get("event_type") == "ITEM_VOID")
                ):
                    triggers.append(self._make_trigger(
                        "CASH_DRAWER_OPEN_NEAR_VOID", tx, 25.0,
                        details={"void_item": e1.get("item_desc") or e2.get("item_desc")}
                    ))
                    break

            # 5. Refunds & Returns
            if tx.status == TransactionStatus.RETURN_ONLY.value or any(e.get("event_type") == "RETURN_ITEM" for e in tx.events):
                cash_payout = sum(t.get("amount", 0.0) for t in tx.tenders if t.get("type") == "CASH")
                if cash_payout >= 50.00:
                    triggers.append(self._make_trigger(
                        "REFUND_HIGH_CASH", tx, cash_payout,
                        details={"cash_payout": cash_payout, "item_count": tx.item_count}
                    ))

            # 6. Pricing & Zero-Price Merchandise
            for itm in tx.items:
                if not itm.get("is_voided"):
                    if float(itm.get("total_price", 0.0)) == 0.0 and float(itm.get("qty", 0)) > 0:
                        triggers.append(self._make_trigger(
                            "PRICE_ZERO_MERCHANDISE", tx, 10.0,
                            details={"zero_item": itm.get("desc"), "upc": itm.get("upc")}
                        ))
                        break

            # 7. Self-Checkout Excessive Interventions / Abandonment
            if tx.is_sco:
                if tx.status == TransactionStatus.SUSPENDED_ABANDONED.value and tx.item_count > 2:
                    triggers.append(self._make_trigger(
                        "SCO_TRANSACTION_ABANDONED", tx, tx.total,
                        details={"abandoned_items": tx.item_count, "unpaid_total": tx.total}
                    ))
                interventions = sum(1 for e in tx.events if "SCO" in e.get("event_type", ""))
                if interventions >= 3:
                    triggers.append(self._make_trigger(
                        "SCO_EXCESSIVE_INTERVENTIONS", tx, 0.0,
                        details={"intervention_count": interventions}
                    ))

            # 8. Cashier Void Outlier vs Peer Baseline
            cashier_stats = cashier_baselines.get(tx.cashier_id)
            if cashier_stats and tx.void_count > 0:
                c_rate = cashier_stats.get("void_rate", 0.0)
                peer_rate = cashier_stats.get("peer_void_rate", 0.02)
                if c_rate > (peer_rate * 3.0) and cashier_stats.get("tx_count", 0) >= 10:
                    triggers.append(self._make_trigger(
                        "EMP_CASHIER_VOID_OUTLIER", tx, round(tx.total * 0.15, 2),
                        details={"cashier_rate": c_rate, "peer_rate": peer_rate}
                    ))

        return triggers

    def _make_trigger(
        self,
        rule_code: str,
        tx: NormalizedTransaction,
        financial_exposure: float,
        details: Dict[str, Any],
    ) -> ExceptionRuleTrigger:
        rule_def = self.rules_by_code.get(rule_code, {
            "category": "GENERAL",
            "severity": "MEDIUM",
            "title": rule_code,
            "description": "Triggered LP exception rule.",
        })
        return ExceptionRuleTrigger(
            rule_code=rule_code,
            category=rule_def["category"],
            severity=rule_def["severity"],
            title=rule_def["title"],
            description=rule_def["description"],
            tx_id=tx.tx_id,
            store_id=tx.store_id,
            cashier_id=tx.cashier_id,
            register_id=tx.register_id,
            timestamp=tx.start_time,
            financial_exposure=round(max(0.0, financial_exposure), 2),
            related_transactions=[tx.tx_id],
            supporting_events=tx.events[:8],
            details=details,
        )
