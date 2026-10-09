"""
Transaction Lifecycle Reconstruction Engine.
Reconstructs entire transaction lifecycles from raw events:
- Correctly links SUSPEND and RESUME events across registers/times.
- Prevents misclassifying legitimately suspended/resumed transactions as voids or cancellations!
- Differentiates line voids, full-transaction voids, post-voids, refunds, and cancelled sales.
- Reconciles item totals, tax, and tender payments without double counting reversed lines.
- Deduplicates duplicate log lines while preserving legitimately repeated purchases.
"""

from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from ..core.models import (
    EventType,
    NormalizedEvent,
    NormalizedTransaction,
    TransactionStatus,
)


class TransactionReconstructor:
    def __init__(self):
        pass

    def reconstruct(
        self, events: List[NormalizedEvent]
    ) -> Tuple[List[NormalizedTransaction], Dict[str, Any]]:
        """
        Groups events by tx_id (and store_id), orders them chronologically,
        and constructs full NormalizedTransaction lifecycles.
        """
        # Deduplicate identical events (e.g. repeated file exports)
        seen_event_keys: Set[str] = set()
        deduped_events: List[NormalizedEvent] = []
        duplicate_event_count = 0

        for ev in events:
            # Hash key: store, register, tx_id, seq, event_type, upc, tender_amount
            key = f"{ev.store_id}:{ev.register_id}:{ev.tx_id}:{ev.event_seq}:{ev.event_type}:{ev.item_upc}:{ev.tender_amount}"
            if key in seen_event_keys:
                duplicate_event_count += 1
                continue
            seen_event_keys.add(key)
            deduped_events.append(ev)

        # Group by (store_id, tx_id)
        tx_groups = defaultdict(list)
        for ev in deduped_events:
            tx_groups[(ev.store_id, ev.tx_id)].append(ev)

        reconstructed_txs: List[NormalizedTransaction] = []
        reconciliation_issues = 0

        for (store_id, tx_id), ev_list in tx_groups.items():
            # Sort chronologically by timestamp, then event_seq
            ev_list.sort(key=lambda x: (x.timestamp, x.event_seq))

            tx, is_reconciled = self._reconstruct_single(store_id, tx_id, ev_list)
            if not is_reconciled:
                reconciliation_issues += 1
            reconstructed_txs.append(tx)

        stats = {
            "total_input_events": len(events),
            "deduped_events": len(deduped_events),
            "duplicate_events_removed": duplicate_event_count,
            "reconstructed_transactions": len(reconstructed_txs),
            "reconciliation_discrepancies": reconciliation_issues,
        }

        return reconstructed_txs, stats

    def _reconstruct_single(
        self, store_id: str, tx_id: str, events: List[NormalizedEvent]
    ) -> Tuple[NormalizedTransaction, bool]:
        first_ev = events[0]
        last_ev = events[-1]

        register_id = first_ev.register_id
        cashier_id = first_ev.cashier_id
        supervisor_id = None
        source_files = list({e.source_file for e in events if e.source_file})

        items: List[Dict[str, Any]] = []
        voided_items: List[Dict[str, Any]] = []
        tenders: List[Dict[str, Any]] = []
        discounts: List[Dict[str, Any]] = []
        sco_interventions: List[Dict[str, Any]] = []

        is_suspended = False
        was_resumed = False
        is_cancelled = False
        is_post_voided = False
        is_completed = False
        is_no_sale = False
        is_return_only = True

        manual_entry_count = 0
        drawer_open_count = 0
        override_count = 0

        event_types_list: List[str] = []

        for ev in events:
            event_types_list.append(ev.event_type)

            if ev.supervisor_id:
                supervisor_id = ev.supervisor_id

            # Track event specifics
            if ev.event_type == EventType.SUSPEND.value:
                is_suspended = True

            elif ev.event_type == EventType.RESUME.value:
                was_resumed = True
                # If transaction resumed on a different register or cashier, note it
                register_id = ev.register_id
                cashier_id = ev.cashier_id

            elif ev.event_type == EventType.TX_CANCEL.value:
                is_cancelled = True

            elif ev.event_type == EventType.POST_VOID.value:
                is_post_voided = True

            elif ev.event_type == EventType.TX_COMPLETE.value:
                is_completed = True

            elif ev.event_type == EventType.NO_SALE.value:
                is_no_sale = True
                drawer_open_count += 1

            elif ev.event_type == EventType.DRAWER_OPEN.value:
                drawer_open_count += 1

            elif ev.event_type in (EventType.ITEM_SCAN.value, EventType.ITEM_MANUAL.value):
                is_return_only = False
                if ev.is_manual or ev.event_type == EventType.ITEM_MANUAL.value:
                    manual_entry_count += 1
                items.append({
                    "seq": ev.event_seq,
                    "upc": ev.item_upc,
                    "desc": ev.item_desc,
                    "dept": ev.item_dept,
                    "qty": ev.quantity,
                    "unit_price": ev.unit_price,
                    "total_price": ev.total_price,
                    "is_scan": ev.is_scan,
                    "is_manual": ev.is_manual,
                })

            elif ev.event_type == EventType.ITEM_VOID.value:
                # Find matching active item and mark voided
                void_price = ev.total_price if ev.total_price != 0 else ev.unit_price * ev.quantity
                matched = False
                for itm in reversed(items):
                    if itm.get("upc") == ev.item_upc and not itm.get("is_voided"):
                        itm["is_voided"] = True
                        matched = True
                        break

                voided_items.append({
                    "seq": ev.event_seq,
                    "upc": ev.item_upc,
                    "desc": ev.item_desc,
                    "dept": ev.item_dept,
                    "qty": ev.quantity,
                    "unit_price": ev.unit_price,
                    "total_price": void_price,
                    "matched": matched,
                    "reason": ev.reason_code,
                })

            elif ev.event_type == EventType.RETURN_ITEM.value:
                items.append({
                    "seq": ev.event_seq,
                    "upc": ev.item_upc,
                    "desc": ev.item_desc,
                    "dept": ev.item_dept,
                    "qty": -abs(ev.quantity),
                    "unit_price": ev.unit_price,
                    "total_price": -abs(ev.total_price or (ev.unit_price * ev.quantity)),
                    "is_return": True,
                })

            elif ev.event_type in (EventType.DISCOUNT.value, EventType.COUPON.value):
                discounts.append({
                    "type": ev.event_type,
                    "amount": abs(ev.total_price or ev.unit_price),
                    "code": ev.reason_code or ev.override_type,
                })

            elif ev.event_type == EventType.TENDER.value:
                tenders.append({
                    "type": ev.tender_type or "CASH",
                    "amount": ev.tender_amount,
                })

            elif ev.event_type in (EventType.SCO_INTERVENTION.value, EventType.SCO_WEIGHT_ALERT.value):
                sco_interventions.append({
                    "type": ev.event_type,
                    "reason": ev.reason_code,
                    "time": ev.timestamp,
                })

            if ev.override_type:
                override_count += 1

        # Reconstruct Transaction Status
        # CRUCIAL: Do not classify a legitimately suspended and resumed transaction as a void or cancelled sale!
        if is_suspended and was_resumed and (is_completed or len(tenders) > 0):
            status = TransactionStatus.SUSPENDED_RESUMED.value
        elif is_post_voided:
            status = TransactionStatus.POST_VOIDED.value
        elif is_cancelled and not was_resumed:
            status = TransactionStatus.CANCELLED.value
        elif is_suspended and not was_resumed:
            status = TransactionStatus.SUSPENDED_ABANDONED.value
        elif is_no_sale and len(items) == 0:
            status = TransactionStatus.NO_SALE.value
        elif is_return_only and len(items) > 0:
            status = TransactionStatus.RETURN_ONLY.value
        elif is_completed or len(tenders) > 0:
            status = TransactionStatus.COMPLETED.value
        else:
            status = TransactionStatus.INCOMPLETE.value

        # Calculate Financial Reconciliation
        active_items = [it for it in items if not it.get("is_voided")]
        subtotal = round(sum(it["total_price"] for it in active_items), 2)
        total_discount = round(sum(d["amount"] for d in discounts), 2)
        tax = round(max(0.0, subtotal * 0.07), 2) if subtotal > 0 else 0.0
        final_total = round(max(0.0, subtotal - total_discount + tax), 2)
        tender_total = round(sum(t["amount"] for t in tenders), 2)
        change_due = round(max(0.0, tender_total - final_total), 2)

        # Duration
        try:
            t_start = datetime.datetime.fromisoformat(first_ev.timestamp)
            t_end = datetime.datetime.fromisoformat(last_ev.timestamp)
            duration = max(0.0, (t_end - t_start).total_seconds())
        except Exception:
            duration = 0.0

        is_sco = "SCO" in register_id.upper() or len(sco_interventions) > 0

        # Check reconciliation: if completed, tender should cover total (within reasonable rounding/split)
        is_reconciled = True
        if status in (TransactionStatus.COMPLETED.value, TransactionStatus.SUSPENDED_RESUMED.value):
            if tender_total > 0 and abs(tender_total - change_due - final_total) > 0.05:
                is_reconciled = False

        normalized_tx = NormalizedTransaction(
            tx_id=tx_id,
            store_id=store_id,
            register_id=register_id,
            cashier_id=cashier_id,
            supervisor_id=supervisor_id,
            start_time=first_ev.timestamp,
            end_time=last_ev.timestamp,
            duration_seconds=duration,
            status=status,
            item_count=len(active_items),
            void_count=len(voided_items),
            manual_entry_count=manual_entry_count,
            override_count=override_count,
            drawer_open_count=drawer_open_count,
            subtotal=subtotal,
            tax=tax,
            total=final_total,
            tender_total=tender_total,
            change_due=change_due,
            is_sco=is_sco,
            items=items,
            voided_items=voided_items,
            tenders=tenders,
            discounts=discounts,
            events=[e.to_dict() for e in events],
            event_types=event_types_list,
            source_files=source_files,
        )

        return normalized_tx, is_reconciled
