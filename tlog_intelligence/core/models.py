"""
Core Domain Models for T-Log Intelligence.
Normalized representation of events, reconstructed transactions,
exception triggers, unsupervised anomaly scores, Clef decisions, and LP findings.
"""

from __future__ import annotations

import datetime
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class TransactionStatus(str, Enum):
    COMPLETED = "COMPLETED"
    SUSPENDED_RESUMED = "SUSPENDED_RESUMED"
    SUSPENDED_ABANDONED = "SUSPENDED_ABANDONED"
    POST_VOIDED = "POST_VOIDED"
    CANCELLED = "CANCELLED"
    RETURN_ONLY = "RETURN_ONLY"
    NO_SALE = "NO_SALE"
    INCOMPLETE = "INCOMPLETE"


class EventType(str, Enum):
    TX_START = "TX_START"
    ITEM_SCAN = "ITEM_SCAN"
    ITEM_MANUAL = "ITEM_MANUAL"
    ITEM_VOID = "ITEM_VOID"
    DISCOUNT = "DISCOUNT"
    COUPON = "COUPON"
    PRICE_OVERRIDE = "PRICE_OVERRIDE"
    QUANTITY_OVERRIDE = "QUANTITY_OVERRIDE"
    TENDER = "TENDER"
    TENDER_REVERSAL = "TENDER_REVERSAL"
    DRAWER_OPEN = "DRAWER_OPEN"
    NO_SALE = "NO_SALE"
    SUSPEND = "SUSPEND"
    RESUME = "RESUME"
    POST_VOID = "POST_VOID"
    TX_CANCEL = "TX_CANCEL"
    TX_COMPLETE = "TX_COMPLETE"
    RETURN_ITEM = "RETURN_ITEM"
    SCO_INTERVENTION = "SCO_INTERVENTION"
    SCO_WEIGHT_ALERT = "SCO_WEIGHT_ALERT"
    SUPERVISOR_OVERRIDE = "SUPERVISOR_OVERRIDE"


@dataclass
class ItemLine:
    line_number: int
    upc: str
    description: str
    department: str
    quantity: float
    unit_price: float
    total_price: float
    is_scan: bool = True
    is_manual: bool = False
    is_voided: bool = False
    is_produce: bool = False
    weight_lbs: Optional[float] = None
    override_reason: Optional[str] = None
    original_price: Optional[float] = None


@dataclass
class TenderLine:
    tender_type: str  # CASH, CREDIT, DEBIT, CHECK, GIFT_CARD, EBT
    amount: float
    masked_account: Optional[str] = None
    authorization_code: Optional[str] = None
    change_returned: float = 0.0


@dataclass
class NormalizedEvent:
    event_id: str
    tx_id: str
    store_id: str
    register_id: str
    cashier_id: str
    timestamp: str  # ISO-8601 string
    event_seq: int
    event_type: str
    supervisor_id: Optional[str] = None
    item_upc: Optional[str] = None
    item_desc: Optional[str] = None
    item_dept: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    total_price: float = 0.0
    is_scan: bool = True
    is_manual: bool = False
    tender_type: Optional[str] = None
    tender_amount: float = 0.0
    override_type: Optional[str] = None
    reason_code: Optional[str] = None
    source_file: str = ""
    raw_data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "tx_id": self.tx_id,
            "store_id": self.store_id,
            "register_id": self.register_id,
            "cashier_id": self.cashier_id,
            "timestamp": self.timestamp,
            "event_seq": self.event_seq,
            "event_type": self.event_type,
            "supervisor_id": self.supervisor_id,
            "item_upc": self.item_upc,
            "item_desc": self.item_desc,
            "item_dept": self.item_dept,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "total_price": self.total_price,
            "is_scan": self.is_scan,
            "is_manual": self.is_manual,
            "tender_type": self.tender_type,
            "tender_amount": self.tender_amount,
            "override_type": self.override_type,
            "reason_code": self.reason_code,
            "source_file": self.source_file,
        }


@dataclass
class NormalizedTransaction:
    tx_id: str
    store_id: str
    register_id: str
    cashier_id: str
    supervisor_id: Optional[str]
    start_time: str
    end_time: str
    duration_seconds: float
    status: str
    item_count: int
    void_count: int
    manual_entry_count: int
    override_count: int
    drawer_open_count: int
    subtotal: float
    tax: float
    total: float
    tender_total: float
    change_due: float
    is_sco: bool
    items: List[Dict[str, Any]] = field(default_factory=list)
    voided_items: List[Dict[str, Any]] = field(default_factory=list)
    tenders: List[Dict[str, Any]] = field(default_factory=list)
    discounts: List[Dict[str, Any]] = field(default_factory=list)
    events: List[Dict[str, Any]] = field(default_factory=list)
    event_types: List[str] = field(default_factory=list)
    source_files: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tx_id": self.tx_id,
            "store_id": self.store_id,
            "register_id": self.register_id,
            "cashier_id": self.cashier_id,
            "supervisor_id": self.supervisor_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_seconds": self.duration_seconds,
            "status": self.status,
            "item_count": self.item_count,
            "void_count": self.void_count,
            "manual_entry_count": self.manual_entry_count,
            "override_count": self.override_count,
            "drawer_open_count": self.drawer_open_count,
            "subtotal": self.subtotal,
            "tax": self.tax,
            "total": self.total,
            "tender_total": self.tender_total,
            "change_due": self.change_due,
            "is_sco": self.is_sco,
            "items": self.items,
            "voided_items": self.voided_items,
            "tenders": self.tenders,
            "discounts": self.discounts,
            "event_types": self.event_types,
            "source_files": self.source_files,
        }


@dataclass
class ExceptionRuleTrigger:
    rule_code: str
    category: str  # VOIDS, REFUNDS, PRICING, DISCOUNTS, CASH, SCO, EMPLOYEE
    severity: str  # LOW, MEDIUM, HIGH, CRITICAL
    title: str
    description: str
    tx_id: str
    store_id: str
    cashier_id: str
    register_id: str
    timestamp: str
    financial_exposure: float
    related_transactions: List[str] = field(default_factory=list)
    supporting_events: List[Dict[str, Any]] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AnomalyScore:
    anomaly_id: str
    level: str  # TRANSACTION, CASHIER, STORE, CROSS_STORE
    entity_id: str  # tx_id, cashier_id, or store_id
    score: float  # Normalized 0.0 - 1.0 (higher = more anomalous)
    method: str  # ISOLATION_FOREST, SEQUENCE_MINING, ROBUST_MAD, CHANGE_POINT
    label: str  # Neutral descriptive label
    features: Dict[str, Any] = field(default_factory=dict)
    contributing_factors: List[str] = field(default_factory=list)
    related_transactions: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ClefDecisionResult:
    case_id: str
    model_name: str
    runtime_mode: str  # mlx-native, ollama-systemone, local-calibrated
    state: Dict[str, Any]
    answers: Dict[str, Dict[str, float]]  # {question_id: {option_id: probability}}
    chosen_labels: Dict[str, str]  # {question_id: argmax_option}
    confidence_scores: Dict[str, float]
    latency_ms: float
    raw_response: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Finding:
    finding_id: str
    title: str
    what_happened: str
    why_unusual: str
    evidence_tx_ids: List[str]
    supporting_events: List[Dict[str, Any]]
    store_ids: List[str]
    register_ids: List[str]
    cashier_ids: List[str]
    event_count: int
    financial_exposure_at_risk: float
    confirmed_financial_loss: float
    alternative_explanations: List[str]
    recommended_investigation: str
    evidence_completeness: float  # 0.0 - 1.0
    anomaly_strength: float  # 0.0 - 1.0
    clef_confidence: float  # 0.0 - 1.0
    combined_score: float  # 0.0 - 1.0
    priority: str  # LOW, MEDIUM, HIGH, CRITICAL
    category: str
    status: str = "NEW"  # NEW, IN_REVIEW, VERIFIED_LOSS, LEGITIMATE, UNRESOLVED, SUPPRESSED
    investigator_notes: List[Dict[str, Any]] = field(default_factory=list)
    clef_decision: Optional[ClefDecisionResult] = None
    created_at: str = field(default_factory=lambda: datetime.datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        res = asdict(self)
        if self.clef_decision:
            res["clef_decision"] = self.clef_decision.to_dict()
        return res
