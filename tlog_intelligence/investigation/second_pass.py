"""
Second-Pass Investigation Engine.
Searches the entire local dataset for related transactions, repeated item sequences,
cross-shift patterns, and connected exceptions.
"""

from __future__ import annotations

from typing import Any, Dict, List, Set

from ..core.models import NormalizedTransaction


class SecondPassInvestigator:
    def __init__(self, all_transactions: List[NormalizedTransaction]):
        self.tx_map = {t.tx_id: t for t in all_transactions}
        self.by_cashier: Dict[str, List[NormalizedTransaction]] = {}
        for t in all_transactions:
            self.by_cashier.setdefault(t.cashier_id, []).append(t)

    def correlate_case(
        self,
        primary_tx_id: str,
        cashier_id: str,
        pattern_type: str,
        target_upcs: List[str],
    ) -> Dict[str, Any]:
        """Discovers related transactions connected to the initial finding."""
        related_tx_ids: Set[str] = set()
        connected_cashiers: Set[str] = {cashier_id}
        connected_registers: Set[str] = set()

        primary_tx = self.tx_map.get(primary_tx_id)
        if primary_tx:
            connected_registers.add(primary_tx.register_id)

        # 1. Look for other transactions by same cashier with similar pattern
        cashier_txs = self.by_cashier.get(cashier_id, [])
        for other in cashier_txs:
            if other.tx_id == primary_tx_id:
                continue

            if pattern_type in ("price_substitution", "VOID_SCAN_VOID_SUBSTITUTE"):
                if other.void_count > 0 and other.manual_entry_count > 0:
                    related_tx_ids.add(other.tx_id)
                    connected_registers.add(other.register_id)

            elif pattern_type in ("unusual_refund", "REFUND_HIGH_CASH"):
                if other.status == "RETURN_ONLY" or any(e.get("event_type") == "RETURN_ITEM" for e in other.events):
                    related_tx_ids.add(other.tx_id)
                    connected_registers.add(other.register_id)

            elif pattern_type in ("tender_manipulation", "CASH_DRAWER_OPEN_NEAR_VOID"):
                if other.drawer_open_count > 0 and (other.void_count > 0 or other.status == "CANCELLED"):
                    related_tx_ids.add(other.tx_id)
                    connected_registers.add(other.register_id)

            # UPC matching if high-value items involved
            if target_upcs:
                other_upcs = {itm.get("upc") for itm in other.items + other.voided_items}
                if any(u in other_upcs for u in target_upcs if u):
                    related_tx_ids.add(other.tx_id)
                    connected_registers.add(other.register_id)

            if len(related_tx_ids) >= 15:
                break

        return {
            "related_transaction_ids": sorted(list(related_tx_ids)),
            "related_count": len(related_tx_ids),
            "connected_cashiers": sorted(list(connected_cashiers)),
            "connected_registers": sorted(list(connected_registers)),
        }
