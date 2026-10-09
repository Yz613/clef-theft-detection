"""
Import Quality and Reconciliation Reporter.
Audits completeness, unmapped codes, duplicates, missing IDs,
and mathematical balance across imported transaction logs.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List

from ..core.models import NormalizedEvent, NormalizedTransaction


@dataclass
class QualityReport:
    total_raw_records: int
    valid_events_imported: int
    total_transactions_reconstructed: int
    duplicate_events_deduped: int
    missing_cashier_id_count: int
    missing_timestamp_count: int
    unmapped_event_types: List[str]
    reconciliation_discrepancy_count: int
    suspended_resumed_count: int
    post_void_count: int
    data_hygiene_score: float  # 0.0 - 100.0
    quality_summary: str
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class QualityAuditor:
    def evaluate(
        self,
        events: List[NormalizedEvent],
        transactions: List[NormalizedTransaction],
        reconstruction_stats: Dict[str, Any],
    ) -> QualityReport:
        missing_cashier = sum(1 for e in events if not e.cashier_id or e.cashier_id == "UNKNOWN")
        missing_ts = sum(1 for e in events if not e.timestamp)
        unmapped_types = list({e.event_type for e in events if "UNKNOWN" in e.event_type})

        reconcil_disc = reconstruction_stats.get("reconciliation_discrepancies", 0)
        deduped = reconstruction_stats.get("duplicate_events_removed", 0)

        suspended_resumed = sum(1 for t in transactions if t.status == "SUSPENDED_RESUMED")
        post_voids = sum(1 for t in transactions if t.status == "POST_VOIDED")

        # Compute data hygiene score (100 is perfect)
        penalties = 0.0
        if len(events) > 0:
            penalties += (missing_cashier / len(events)) * 30.0
            penalties += (missing_ts / len(events)) * 30.0
        if len(transactions) > 0:
            penalties += (reconcil_disc / len(transactions)) * 25.0
        if len(unmapped_types) > 0:
            penalties += 10.0

        hygiene_score = round(max(0.0, min(100.0, 100.0 - penalties)), 1)

        warnings = []
        if reconcil_disc > 0:
            warnings.append(f"{reconcil_disc} transactions exhibited tender-total reconciliation discrepancies.")
        if deduped > 0:
            warnings.append(f"{deduped} duplicate log events were safely deduplicated.")
        if suspended_resumed > 0:
            warnings.append(f"{suspended_resumed} suspended transactions were correctly matched with resumption events.")

        summary = f"Import quality: {hygiene_score}% hygiene score across {len(transactions):,} reconstructed transactions."

        return QualityReport(
            total_raw_records=reconstruction_stats.get("total_input_events", len(events)),
            valid_events_imported=len(events),
            total_transactions_reconstructed=len(transactions),
            duplicate_events_deduped=deduped,
            missing_cashier_id_count=missing_cashier,
            missing_timestamp_count=missing_ts,
            unmapped_event_types=unmapped_types,
            reconciliation_discrepancy_count=reconcil_disc,
            suspended_resumed_count=suspended_resumed,
            post_void_count=post_voids,
            data_hygiene_score=hygiene_score,
            quality_summary=summary,
            warnings=warnings,
        )
