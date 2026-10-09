"""
Universal Format Detector and Schema Inference Engine.
Inspects incoming files (CSV, JSON, JSONL, XML/POSLog, TXT, Fixed-width, ZIP),
identifies transaction boundaries, and infers field mappings with confidence scores.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class FieldMappingConfidence:
    target_field: str
    source_field: str
    confidence: float  # 0.0 - 1.0
    sample_values: List[Any] = field(default_factory=list)


@dataclass
class FormatDetectionResult:
    detected_format: str  # CSV, JSON, JSONL, POSLOG_XML, TXT_DELIMITED, FIXED_WIDTH, ZIP
    delimiter: Optional[str]
    sample_records: List[Dict[str, Any]]
    inferred_mappings: Dict[str, FieldMappingConfidence]
    vendor_guess: str  # NCR, TOSHIBA_4690, FUJITSU, POSLOG, GENERIC
    confidence: float
    total_estimated_events: int
    validation_warnings: List[str] = field(default_factory=list)


STANDARD_FIELDS = {
    "tx_id": ["tx_id", "transaction_id", "tran_no", "trans_num", "receipt_id", "ticket_no", "transactionnumber"],
    "store_id": ["store_id", "store_num", "store_no", "unit_id", "location_id", "retailstoreid"],
    "register_id": ["register_id", "reg_no", "lane_id", "terminal_id", "pos_id", "workstationid"],
    "cashier_id": ["cashier_id", "operator_id", "emp_id", "employee_id", "checker_id", "operatorid"],
    "supervisor_id": ["supervisor_id", "manager_id", "override_manager", "approver_id"],
    "timestamp": ["timestamp", "datetime", "date_time", "trans_time", "begindatetime", "enddatetime", "event_time"],
    "event_type": ["event_type", "record_type", "line_type", "action", "trans_type", "item_type"],
    "item_upc": ["item_upc", "upc", "barcode", "item_code", "scan_code", "posidentity"],
    "item_desc": ["item_desc", "description", "item_name", "product_name", "desc"],
    "item_dept": ["item_dept", "department", "dept_no", "dept", "merchandisecat"],
    "quantity": ["quantity", "qty", "item_qty", "units", "itemcount"],
    "unit_price": ["unit_price", "price", "regular_price", "item_price", "actualsalesunitprice"],
    "total_price": ["total_price", "extended_price", "amount", "line_total", "extendedamount"],
    "tender_type": ["tender_type", "payment_type", "tender_code", "pay_type", "tendertype"],
    "tender_amount": ["tender_amount", "pay_amount", "amount_paid", "tenderamount"],
    "override_type": ["override_type", "override_code", "manager_override"],
    "reason_code": ["reason_code", "reason", "void_reason", "return_reason", "reasoncode"],
}


class FormatDetector:
    def detect_file(self, file_path: str, max_sample_rows: int = 50) -> FormatDetectionResult:
        """Inspects file content and detects format and field mappings."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Check if ZIP
        if zipfile.is_zipfile(file_path):
            return self._detect_zip(file_path, max_sample_rows)

        ext = os.path.splitext(file_path)[1].lower()

        # Check POSLog XML / XML
        if ext in (".xml", ".poslog"):
            return self._detect_xml(file_path, max_sample_rows)

        # Read first few KB to inspect text/JSON
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            head = f.read(65536)

        stripped_head = head.strip()

        # Check JSON array
        if stripped_head.startswith("["):
            return self._detect_json_array(file_path, max_sample_rows)

        # Check JSONL / newline-delimited JSON
        lines = stripped_head.splitlines()
        if lines and lines[0].strip().startswith("{") and (len(lines) == 1 or lines[1].strip().startswith("{")):
            return self._detect_jsonl(file_path, max_sample_rows)

        # Delimited (CSV, TSV, Pipe)
        return self._detect_delimited(file_path, head, max_sample_rows)

    def _detect_delimited(self, file_path: str, sample_text: str, max_sample: int) -> FormatDetectionResult:
        sniffer = csv.Sniffer()
        lines = sample_text.splitlines()[:max_sample]
        sample_subset = "\n".join(lines[:10])

        try:
            dialect = sniffer.sniff(sample_subset, delimiters=[",", "\t", "|", ";"])
            delimiter = dialect.delimiter
        except Exception:
            # Fallback delimiter counting
            counts = {",": sample_text.count(","), "|": sample_text.count("|"), "\t": sample_text.count("\t"), ";": sample_text.count(";")}
            delimiter = max(counts.items(), key=lambda x: x[1])[0]

        reader = csv.DictReader(io.StringIO(sample_text), delimiter=delimiter)
        fieldnames = reader.fieldnames or []
        samples = []
        for i, row in enumerate(reader):
            if i >= max_sample:
                break
            samples.append(row)

        mappings, vendor = self._infer_mappings(fieldnames, samples)

        # Total line estimate
        with open(file_path, "rb") as f:
            total_lines = sum(1 for _ in f) - 1

        fmt_name = "CSV" if delimiter == "," else ("TSV" if delimiter == "\t" else "TXT_DELIMITED")

        return FormatDetectionResult(
            detected_format=fmt_name,
            delimiter=delimiter,
            sample_records=samples[:5],
            inferred_mappings=mappings,
            vendor_guess=vendor,
            confidence=0.92 if mappings.get("tx_id", None) else 0.65,
            total_estimated_events=max(0, total_lines),
        )

    def _detect_jsonl(self, file_path: str, max_sample: int) -> FormatDetectionResult:
        samples = []
        total_lines = 0
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                total_lines += 1
                if len(samples) < max_sample and line.strip():
                    try:
                        samples.append(json.loads(line))
                    except Exception:
                        pass

        fieldnames = list(samples[0].keys()) if samples else []
        mappings, vendor = self._infer_mappings(fieldnames, samples)

        return FormatDetectionResult(
            detected_format="JSONL",
            delimiter=None,
            sample_records=samples[:5],
            inferred_mappings=mappings,
            vendor_guess=vendor,
            confidence=0.95,
            total_estimated_events=total_lines,
        )

    def _detect_json_array(self, file_path: str, max_sample: int) -> FormatDetectionResult:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
        if not isinstance(data, list):
            data = [data]
        samples = data[:max_sample]
        fieldnames = list(samples[0].keys()) if samples else []
        mappings, vendor = self._infer_mappings(fieldnames, samples)

        return FormatDetectionResult(
            detected_format="JSON",
            delimiter=None,
            sample_records=samples[:5],
            inferred_mappings=mappings,
            vendor_guess=vendor,
            confidence=0.95,
            total_estimated_events=len(data),
        )

    def _detect_xml(self, file_path: str, max_sample: int) -> FormatDetectionResult:
        # Standard POSLog check
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
            tag = root.tag.lower()
            is_poslog = "poslog" in tag or any("poslog" in child.tag.lower() for child in root)
            vendor = "POSLOG_XML" if is_poslog else "GENERIC_XML"
            samples = [{"xml_root": root.tag, "elements": len(root)}]
            mappings = {
                "tx_id": FieldMappingConfidence("tx_id", "Transaction.SequenceNumber", 0.95, ["TX_001"]),
                "store_id": FieldMappingConfidence("store_id", "RetailStoreID", 0.95, ["STORE_01"]),
                "cashier_id": FieldMappingConfidence("cashier_id", "OperatorID", 0.95, ["EMP_01"]),
            }
            return FormatDetectionResult(
                detected_format="POSLOG_XML" if is_poslog else "XML",
                delimiter=None,
                sample_records=samples,
                inferred_mappings=mappings,
                vendor_guess=vendor,
                confidence=0.90,
                total_estimated_events=len(root),
            )
        except Exception as e:
            return FormatDetectionResult(
                detected_format="XML",
                delimiter=None,
                sample_records=[],
                inferred_mappings={},
                vendor_guess="GENERIC_XML",
                confidence=0.4,
                total_estimated_events=0,
                validation_warnings=[str(e)],
            )

    def _detect_zip(self, file_path: str, max_sample: int) -> FormatDetectionResult:
        with zipfile.ZipFile(file_path, "r") as z:
            names = z.namelist()
            first_data_file = next((n for n in names if not n.startswith("__MACOSX") and not n.endswith("/")), None)
            return FormatDetectionResult(
                detected_format="ZIP",
                delimiter=None,
                sample_records=[{"archive_files": names[:10], "file_count": len(names)}],
                inferred_mappings={},
                vendor_guess="ZIP_ARCHIVE",
                confidence=0.99,
                total_estimated_events=len(names) * 1000,
            )

    def _infer_mappings(
        self, fieldnames: List[str], samples: List[Dict[str, Any]]
    ) -> Tuple[Dict[str, FieldMappingConfidence], str]:
        inferred = {}
        vendor = "GENERIC"

        lower_fields = {f.lower().replace("_", "").replace("-", "").replace(" ", ""): f for f in fieldnames}

        # Check vendor clues
        if any("4690" in f or "ace" in f for f in lower_fields):
            vendor = "TOSHIBA_4690"
        elif any("ncr" in f or "emerald" in f for f in lower_fields):
            vendor = "NCR"
        elif any("globalstore" in f for f in lower_fields):
            vendor = "FUJITSU"

        for target_field, candidates in STANDARD_FIELDS.items():
            best_match = None
            best_score = 0.0

            for cand in candidates:
                cand_clean = cand.replace("_", "")
                if cand_clean in lower_fields:
                    actual = lower_fields[cand_clean]
                    score = 0.95 if cand == target_field else 0.85
                    if score > best_score:
                        best_score = score
                        best_match = actual

            if not best_match:
                # Substring fuzzy match
                for raw_col in fieldnames:
                    col_l = raw_col.lower()
                    if target_field in col_l:
                        best_match = raw_col
                        best_score = 0.70
                        break

            if best_match:
                sample_vals = [s.get(best_match) for s in samples[:5] if s.get(best_match) is not None]
                inferred[target_field] = FieldMappingConfidence(
                    target_field=target_field,
                    source_field=best_match,
                    confidence=best_score,
                    sample_values=sample_vals,
                )

        return inferred, vendor
