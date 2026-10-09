"""
Universal Ingestion Pipeline.
Handles chunked / streaming processing of multi-format logs,
safe archive extraction, schema adaptation, lifecycle reconstruction,
and analytical persistence into DuckDB.
"""

from __future__ import annotations

import csv
import io
import json
import os
import shutil
import tempfile
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from ..core.models import NormalizedEvent, NormalizedTransaction
from ..core.storage import StorageEngine
from .adapters import UniversalAdapter
from .detector import FormatDetector
from .quality import QualityAuditor, QualityReport
from .reconstructor import TransactionReconstructor


class IngestionPipeline:
    def __init__(self, storage: StorageEngine):
        self.storage = storage
        self.detector = FormatDetector()
        self.reconstructor = TransactionReconstructor()
        self.auditor = QualityAuditor()

    def process_file_or_directory(
        self,
        path: str,
        custom_mapping: Optional[Dict[str, str]] = None,
        batch_size: int = 10000,
    ) -> Tuple[List[NormalizedTransaction], QualityReport]:
        """Processes a single file, ZIP archive, or directory of transaction logs."""
        all_events: List[NormalizedEvent] = []

        if os.path.isdir(path):
            for root, _, files in os.walk(path):
                for f in sorted(files):
                    if not f.startswith(".") and not f.startswith("__"):
                        fp = os.path.join(root, f)
                        all_events.extend(self._read_file_events(fp, custom_mapping))
        elif zipfile.is_zipfile(path):
            temp_dir = tempfile.mkdtemp(prefix="tlog_unzip_")
            try:
                with zipfile.ZipFile(path, "r") as z:
                    # Guard against Zip Slip path traversal
                    for member in z.infolist():
                        extracted_path = os.path.abspath(os.path.join(temp_dir, member.filename))
                        if not extracted_path.startswith(os.path.abspath(temp_dir)):
                            raise SecurityError(f"Attempted Path Traversal in ZIP member: {member.filename}")
                    z.extractall(temp_dir)
                for root, _, files in os.walk(temp_dir):
                    for f in sorted(files):
                        if not f.startswith(".") and not f.startswith("__"):
                            fp = os.path.join(root, f)
                            all_events.extend(self._read_file_events(fp, custom_mapping))
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            all_events.extend(self._read_file_events(path, custom_mapping))

        # Reconstruct transactions
        transactions, stats = self.reconstructor.reconstruct(all_events)

        # Audit quality
        quality_report = self.auditor.evaluate(all_events, transactions, stats)

        # Persist into DuckDB analytical database in chunks
        for i in range(0, len(all_events), batch_size):
            self.storage.insert_events_batch(all_events[i : i + batch_size])

        for i in range(0, len(transactions), batch_size):
            self.storage.insert_transactions_batch(transactions[i : i + batch_size])

        return transactions, quality_report

    def _read_file_events(
        self, file_path: str, custom_mapping: Optional[Dict[str, str]]
    ) -> List[NormalizedEvent]:
        detection = self.detector.detect_file(file_path)
        mapping_dict = {}
        if custom_mapping:
            mapping_dict.update(custom_mapping)
        else:
            for k, conf in detection.inferred_mappings.items():
                mapping_dict[k] = conf.source_field

        adapter = UniversalAdapter(mapping=mapping_dict, source_file=os.path.basename(file_path))
        events: List[NormalizedEvent] = []

        fmt = detection.detected_format
        if fmt in ("CSV", "TSV", "TXT_DELIMITED"):
            delim = detection.delimiter or ","
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f, delimiter=delim)
                for seq, row in enumerate(reader, start=1):
                    events.append(adapter.normalize_record(row, event_seq=seq))

        elif fmt == "JSONL":
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for seq, line in enumerate(f, start=1):
                    if line.strip():
                        try:
                            row = json.loads(line)
                            events.append(adapter.normalize_record(row, event_seq=seq))
                        except Exception:
                            pass

        elif fmt == "JSON":
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)
                if not isinstance(data, list):
                    data = [data]
                for seq, row in enumerate(data, start=1):
                    events.append(adapter.normalize_record(row, event_seq=seq))

        return events
