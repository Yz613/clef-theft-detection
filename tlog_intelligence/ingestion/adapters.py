"""
Ingestion Adapters for Universal POS Formats.
Transforms raw dictionary records from CSV, JSON, POSLog XML, etc.
into typed NormalizedEvent domain objects using mapped fields.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, List, Optional

from ..core.models import EventType, NormalizedEvent


class UniversalAdapter:
    def __init__(self, mapping: Optional[Dict[str, str]] = None, source_file: str = ""):
        self.mapping = mapping or {}
        self.source_file = source_file

    def normalize_record(self, raw: Dict[str, Any], event_seq: int = 1) -> NormalizedEvent:
        """Translates a raw log event dict into a NormalizedEvent."""
        get_val = lambda key: raw.get(self.mapping.get(key, key))

        tx_id = str(get_val("tx_id") or raw.get("transaction_id") or raw.get("receipt_id") or f"TX_{event_seq}")
        store_id = str(get_val("store_id") or raw.get("store_no") or "STORE_001")
        register_id = str(get_val("register_id") or raw.get("lane_id") or raw.get("terminal_id") or "REG_01")
        cashier_id = str(get_val("cashier_id") or raw.get("operator_id") or raw.get("emp_id") or "EMP_001")
        supervisor_id = get_val("supervisor_id") or raw.get("manager_id")

        # Timestamp normalization
        raw_ts = get_val("timestamp") or raw.get("datetime") or raw.get("time") or datetime.datetime.now().isoformat()
        clean_ts = str(raw_ts).replace("Z", "").replace(" ", "T")
        if "T" not in clean_ts:
            clean_ts = f"{datetime.date.today().isoformat()}T{clean_ts}"

        # Event type determination
        raw_type = str(get_val("event_type") or raw.get("type") or raw.get("action") or "ITEM_SCAN").upper()
        event_type = self._map_event_type(raw_type)

        # Item info
        upc = str(get_val("item_upc") or raw.get("upc") or raw.get("barcode") or "")
        desc = str(get_val("item_desc") or raw.get("description") or raw.get("name") or "")
        dept = str(get_val("item_dept") or raw.get("department") or "GROCERY")

        qty = float(get_val("quantity") or raw.get("qty") or 1.0)
        unit_price = float(get_val("unit_price") or raw.get("price") or 0.0)
        total_price = float(get_val("total_price") or raw.get("amount") or (unit_price * qty))

        is_scan = bool(raw.get("is_scan", True))
        is_manual = bool(raw.get("is_manual", False))
        if event_type == EventType.ITEM_MANUAL.value or raw.get("entry_mode") == "MANUAL":
            is_manual = True
            is_scan = False

        tender_type = get_val("tender_type") or raw.get("pay_type")
        tender_amount = float(get_val("tender_amount") or raw.get("tender_amt") or 0.0)

        override_type = get_val("override_type") or raw.get("override_code")
        reason_code = get_val("reason_code") or raw.get("reason")

        event_id = f"{store_id}_{register_id}_{tx_id}_{event_seq}"

        return NormalizedEvent(
            event_id=event_id,
            tx_id=tx_id,
            store_id=store_id,
            register_id=register_id,
            cashier_id=cashier_id,
            supervisor_id=supervisor_id,
            timestamp=clean_ts,
            event_seq=event_seq,
            event_type=event_type,
            item_upc=upc,
            item_desc=desc,
            item_dept=dept,
            quantity=qty,
            unit_price=unit_price,
            total_price=total_price,
            is_scan=is_scan,
            is_manual=is_manual,
            tender_type=str(tender_type).upper() if tender_type else None,
            tender_amount=tender_amount,
            override_type=override_type,
            reason_code=reason_code,
            source_file=self.source_file,
            raw_data=raw,
        )

    def _map_event_type(self, raw_type: str) -> str:
        rt = raw_type.upper().replace("-", "_").replace(" ", "_")
        if "VOID" in rt and ("LINE" in rt or "ITEM" in rt):
            return EventType.ITEM_VOID.value
        elif "POST_VOID" in rt or "POSTVOID" in rt:
            return EventType.POST_VOID.value
        elif "SUSPEND" in rt:
            return EventType.SUSPEND.value
        elif "RESUME" in rt:
            return EventType.RESUME.value
        elif "CANCEL" in rt or "ABANDON" in rt:
            return EventType.TX_CANCEL.value
        elif "RETURN" in rt or "REFUND" in rt:
            return EventType.RETURN_ITEM.value
        elif "NO_SALE" in rt or "NOSALE" in rt:
            return EventType.NO_SALE.value
        elif "DRAWER" in rt:
            return EventType.DRAWER_OPEN.value
        elif "TENDER" in rt or "PAYMENT" in rt:
            return EventType.TENDER.value
        elif "DISCOUNT" in rt:
            return EventType.DISCOUNT.value
        elif "COUPON" in rt:
            return EventType.COUPON.value
        elif "START" in rt:
            return EventType.TX_START.value
        elif "END" in rt or "COMPLETE" in rt:
            return EventType.TX_COMPLETE.value
        elif "MANUAL" in rt:
            return EventType.ITEM_MANUAL.value
        elif "SCO" in rt or "INTERVENTION" in rt:
            return EventType.SCO_INTERVENTION.value
        return EventType.ITEM_SCAN.value
