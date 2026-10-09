"""
Comprehensive Exception Rule Catalog for Retail Loss Prevention.
Covers:
A. Voids and cancellations
B. Refunds and returns
C. Pricing and item manipulation
D. Discounts, loyalty, and coupons
E. Cash handling and tender irregularities
F. Self-checkout (SCO) and assisted checkout
G. Employee and supervisory activity
"""

from typing import Any, Dict, List


RULE_DEFINITIONS: List[Dict[str, Any]] = [
    # A. Voids & Cancellations
    {
        "code": "VOID_HIGH_RATIO",
        "category": "VOIDS",
        "severity": "HIGH",
        "title": "High Item Void Ratio",
        "description": "Transaction has excessive item void count relative to basket size (>30% voided items).",
    },
    {
        "code": "VOID_HIGH_VALUE",
        "category": "VOIDS",
        "severity": "HIGH",
        "title": "Disproportionate High-Value Void",
        "description": "Item void exceeds $35.00 or represents >60% of total basket value.",
    },
    {
        "code": "VOID_POST_VOID",
        "category": "VOIDS",
        "severity": "CRITICAL",
        "title": "Completed Transaction Post-Voided",
        "description": "Sale was completed and tendered, then subsequently post-voided.",
    },
    {
        "code": "VOID_TENDER_ADJACENT",
        "category": "VOIDS",
        "severity": "HIGH",
        "title": "Tender-Adjacent Void Pattern",
        "description": "Item void occurred immediately after tender entry or total calculation.",
    },
    {
        "code": "VOID_SCAN_VOID_SUBSTITUTE",
        "category": "VOIDS",
        "severity": "CRITICAL",
        "title": "Scan-Void-Substitute Sequence",
        "description": "High-value item scanned, immediately voided, and replaced by a low-value manual entry or generic PLU.",
    },
    {
        "code": "VOID_LATE_IN_TRANSACTION",
        "category": "VOIDS",
        "severity": "MEDIUM",
        "title": "Late Basket Item Void",
        "description": "Line void occurred as the final event prior to tender.",
    },

    # B. Refunds and Returns
    {
        "code": "REFUND_HIGH_CASH",
        "category": "REFUNDS",
        "severity": "HIGH",
        "title": "High-Value Cash Refund",
        "description": "Cash refund paid out exceeding $50.00 without verified receipt reference.",
    },
    {
        "code": "REFUND_NO_RECEIPT",
        "category": "REFUNDS",
        "severity": "MEDIUM",
        "title": "No-Receipt Merchandise Return",
        "description": "Merchandise return processed without original receipt barcode reference.",
    },
    {
        "code": "REFUND_REPEATED_ITEM",
        "category": "REFUNDS",
        "severity": "HIGH",
        "title": "Repeated Refund of Identical Item",
        "description": "Same high-value UPC refunded multiple times within short timeframe.",
    },
    {
        "code": "REFUND_TENDER_SWITCH",
        "category": "REFUNDS",
        "severity": "HIGH",
        "title": "Refund Tender Switching",
        "description": "Original purchase paid by card/check, refund disbursed as cash.",
    },

    # C. Pricing and Item Manipulation
    {
        "code": "PRICE_MANUAL_OVERRIDE",
        "category": "PRICING",
        "severity": "HIGH",
        "title": "Excessive Manual Price Override",
        "description": "Item price manually overridden by more than 50% below standard price.",
    },
    {
        "code": "PRICE_ZERO_MERCHANDISE",
        "category": "PRICING",
        "severity": "CRITICAL",
        "title": "Zero-Price Merchandise Sale",
        "description": "Merchandise item rung at $0.00 without valid promotion or manufacturer coupon.",
    },
    {
        "code": "PRICE_GENERIC_PLU_ABUSE",
        "category": "PRICING",
        "severity": "HIGH",
        "title": "High-Frequency Generic Produce PLU",
        "description": "Unusual use of generic produce PLU (e.g. 4011 Bananas) alongside expensive merchandise voids.",
    },
    {
        "code": "PRICE_QUANTITY_OVERRIDE",
        "category": "PRICING",
        "severity": "MEDIUM",
        "title": "Unusual High-Quantity Override",
        "description": "Manual quantity entry exceeding 12 units on non-bulk grocery department items.",
    },

    # D. Discounts, Loyalty, and Coupons
    {
        "code": "DISC_MANUAL_EXCESSIVE",
        "category": "DISCOUNTS",
        "severity": "HIGH",
        "title": "Excessive Manual Percentage Discount",
        "description": "Manual discount applied exceeding 30% of total basket value.",
    },
    {
        "code": "DISC_STACKED_COUPONS",
        "category": "DISCOUNTS",
        "severity": "MEDIUM",
        "title": "Stacked Policy-Exceeding Coupons",
        "description": "More than 3 manufacturer coupons or identical loyalty discounts stacked on a single basket.",
    },
    {
        "code": "DISC_EMPLOYEE_DISCOUNT_OUTLIER",
        "category": "DISCOUNTS",
        "severity": "HIGH",
        "title": "Suspicious Employee Discount Transaction",
        "description": "Employee discount applied to high-ticket basket outside operator's own shift hours.",
    },

    # E. Cash Handling and Tender Irregularities
    {
        "code": "CASH_EXCESSIVE_NO_SALE",
        "category": "CASH",
        "severity": "HIGH",
        "title": "Drawer Opening / No-Sale Burst",
        "description": "Multiple no-sale drawer openings within a short window without active sales.",
    },
    {
        "code": "CASH_DRAWER_OPEN_NEAR_VOID",
        "category": "CASH",
        "severity": "CRITICAL",
        "title": "Drawer Open Adjacent to Void / Cancel",
        "description": "Cash drawer opened immediately prior to or following an item void or cancelled sale.",
    },
    {
        "code": "CASH_REPEATED_EXACT_TENDER",
        "category": "CASH",
        "severity": "LOW",
        "title": "Statistically Unusual Exact Cash Tender",
        "description": "Unusual cluster of exact cash tenders without change calculation.",
    },

    # F. Self-Checkout and Assisted Checkout
    {
        "code": "SCO_EXCESSIVE_INTERVENTIONS",
        "category": "SCO",
        "severity": "MEDIUM",
        "title": "Excessive SCO Attendant Interventions",
        "description": "Self-checkout transaction required 3+ attendant interventions or weight-security overrides.",
    },
    {
        "code": "SCO_TRANSACTION_ABANDONED",
        "category": "SCO",
        "severity": "HIGH",
        "title": "SCO Basket Abandonment",
        "description": "Self-checkout transaction started, multiple items scanned, and abandoned without tender.",
    },

    # G. Employee and Supervisory Activity
    {
        "code": "EMP_CASHIER_VOID_OUTLIER",
        "category": "EMPLOYEE",
        "severity": "HIGH",
        "title": "Cashier Void Rate Statistical Outlier",
        "description": "Operator item void rate exceeds peer group baseline by more than 3.0 standard deviations.",
    },
    {
        "code": "EMP_SUPERVISOR_COLLUSION_CLUSTER",
        "category": "EMPLOYEE",
        "severity": "CRITICAL",
        "title": "Supervisor Approval Cluster",
        "description": "Disproportionate cluster of manager overrides between the same supervisor and cashier.",
    },
    {
        "code": "EMP_OFF_SHIFT_ACTIVITY",
        "category": "EMPLOYEE",
        "severity": "HIGH",
        "title": "Transaction Outside Scheduled Shift Window",
        "description": "Operator processed high-exception transactions during store closing or low-traffic periods.",
    },
]
