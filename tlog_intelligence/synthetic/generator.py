"""
Realistic Synthetic Grocery POS Dataset Generator.
Generates 50,000+ realistic transaction logs spanning:
1. Normal shopping baskets with realistic UPCs, produce PLUs, tax, and tenders
2. Legitimate suspended and resumed transactions (essential validation case!)
3. Normal single-item voids
4. Legitimate verified returns with receipts
5. Seeded loss-prevention scenarios:
   - Sweethearting / scan-void-substitute sequences ($39.99 steak -> void -> $3.99 banana PLU)
   - High-value unverified cash refunds
   - Cashier peer void rate outliers (Cashier 17 with 4x void rate)
   - Completed sales subsequently post-voided
   - Cash drawer opening adjacent to line voids
   - Self-checkout abandonment & excessive interventions
   - Duplicated log lines to test deduplication & reconciliation
"""

from __future__ import annotations

import csv
import datetime
import json
import os
import random
from typing import Any, Dict, List, Optional


GROCERY_CATALOG = [
    {"upc": "011110417001", "desc": "Whole Milk 1 Gallon", "dept": "DAIRY", "price": 3.99, "is_produce": False},
    {"upc": "011110512002", "desc": "Large Eggs Grade A Dozen", "dept": "DAIRY", "price": 3.49, "is_produce": False},
    {"upc": "021000658831", "desc": "Cheddar Cheese Block 8oz", "dept": "DAIRY", "price": 4.29, "is_produce": False},
    {"upc": "041129410101", "desc": "Organic White Bread Loaf", "dept": "BAKERY", "price": 2.99, "is_produce": False},
    {"upc": "073420000115", "desc": "Boneless Chicken Breast 2lb", "dept": "MEAT", "price": 9.98, "is_produce": False},
    {"upc": "098234110902", "desc": "USDA Prime Ribeye Steak", "dept": "MEAT", "price": 34.99, "is_produce": False},
    {"upc": "098234110903", "desc": "Organic Filet Mignon 12oz", "dept": "MEAT", "price": 39.99, "is_produce": False},
    {"upc": "040110000000", "desc": "Yellow Bananas (PLU 4011)", "dept": "PRODUCE", "price": 0.59, "is_produce": True},
    {"upc": "040650000000", "desc": "Green Bell Pepper (PLU 4065)", "dept": "PRODUCE", "price": 0.99, "is_produce": True},
    {"upc": "040870000000", "desc": "Roma Tomatoes (PLU 4087)", "dept": "PRODUCE", "price": 1.49, "is_produce": True},
    {"upc": "012000001291", "desc": "Sparkling Mineral Water 12pk", "dept": "BEVERAGE", "price": 6.49, "is_produce": False},
    {"upc": "078000000104", "desc": "Potato Chips Family Size", "dept": "SNACKS", "price": 4.99, "is_produce": False},
    {"upc": "037000123456", "desc": "Tide Laundry Detergent 92oz", "dept": "NON_FOOD", "price": 14.99, "is_produce": False},
    {"upc": "036000012345", "desc": "Kleenex Facial Tissue 3pk", "dept": "NON_FOOD", "price": 5.99, "is_produce": False},
    {"upc": "054321098765", "desc": "Gourmet Olive Oil 750ml", "dept": "GROCERY", "price": 18.99, "is_produce": False},
]


class SyntheticDatasetGenerator:
    def __init__(self, seed: int = 42):
        random.seed(seed)
        self.stores = ["STORE_101", "STORE_102", "STORE_103", "STORE_104"]
        self.cashiers = [f"CASHIER_{i:02d}" for i in range(1, 26)]
        self.supervisors = ["MGR_01", "MGR_02", "MGR_03"]

    def generate(
        self,
        target_events: int = 50000,
        output_file: str = "data/synthetic_tlogs.csv",
    ) -> Dict[str, Any]:
        """Generates realistic T-log records up to target_events."""
        os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)

        start_date = datetime.datetime(2026, 9, 15, 8, 0, 0)
        current_time = start_date

        events_written = 0
        tx_count = 0
        seeded_scenario_counts = {
            "normal_sale": 0,
            "suspended_resumed": 0,
            "normal_void": 0,
            "normal_return": 0,
            "sweethearting_substitution": 0,
            "high_cash_refund": 0,
            "post_void_abuse": 0,
            "drawer_open_near_void": 0,
            "cashier_17_void_outlier": 0,
            "sco_abandonment": 0,
        }

        fieldnames = [
            "tx_id",
            "store_id",
            "register_id",
            "cashier_id",
            "supervisor_id",
            "timestamp",
            "event_seq",
            "event_type",
            "item_upc",
            "item_desc",
            "item_dept",
            "quantity",
            "unit_price",
            "total_price",
            "is_scan",
            "is_manual",
            "tender_type",
            "tender_amount",
            "override_type",
            "reason_code",
        ]

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            while events_written < target_events:
                tx_count += 1
                tx_id = f"TX_{tx_count:06d}"
                store_id = random.choice(self.stores)
                is_sco = random.random() < 0.20
                register_id = f"SCO_{random.randint(1, 4):02d}" if is_sco else f"LANE_{random.randint(1, 8):02d}"
                cashier_id = "SCO_ATTENDANT_01" if is_sco else random.choice(self.cashiers)
                supervisor_id = random.choice(self.supervisors) if random.random() < 0.10 else None

                current_time += datetime.timedelta(seconds=random.randint(10, 180))
                tx_time = current_time

                # Scenario selection
                roll = random.random()

                # Scenario A: Cashier 17 Void Outlier (Elevated void frequency)
                if not is_sco and cashier_id == "CASHIER_17" and random.random() < 0.40:
                    evs = self._generate_void_outlier(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["cashier_17_void_outlier"] += 1

                # Scenario B: Suspended and Resumed Sale (Crucial validation: MUST NOT be counted as void/theft)
                elif roll < 0.05:
                    evs = self._generate_suspended_resumed(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["suspended_resumed"] += 1

                # Scenario C: Sweethearting Scan-Void-Substitute ($39.99 steak voided -> $0.59 banana)
                elif roll < 0.08:
                    evs = self._generate_sweethearting_substitution(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["sweethearting_substitution"] += 1

                # Scenario D: High Value Cash Refund (> $50 without receipt)
                elif roll < 0.11:
                    evs = self._generate_high_cash_refund(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["high_cash_refund"] += 1

                # Scenario E: Post-Void Abuse
                elif roll < 0.13:
                    evs = self._generate_post_void(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["post_void_abuse"] += 1

                # Scenario F: Drawer Open Adjacent to Void
                elif roll < 0.16:
                    evs = self._generate_drawer_near_void(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["drawer_open_near_void"] += 1

                # Scenario G: SCO Basket Abandonment
                elif is_sco and roll < 0.20:
                    evs = self._generate_sco_abandonment(tx_id, store_id, register_id, tx_time)
                    seeded_scenario_counts["sco_abandonment"] += 1

                # Scenario H: Normal Return with receipt
                elif roll < 0.24:
                    evs = self._generate_normal_return(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["normal_return"] += 1

                # Scenario I: Normal Single-Item Void
                elif roll < 0.32:
                    evs = self._generate_normal_void(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["normal_void"] += 1

                # Scenario J: Normal Clean Shopping Basket
                else:
                    evs = self._generate_normal_sale(tx_id, store_id, register_id, cashier_id, tx_time)
                    seeded_scenario_counts["normal_sale"] += 1

                for ev in evs:
                    writer.writerow(ev)
                    events_written += 1

                # Occasionally emit duplicate events to test deduplication resilience
                if random.random() < 0.005 and len(evs) > 0:
                    dup_ev = dict(evs[0])
                    writer.writerow(dup_ev)
                    events_written += 1

        return {
            "total_events_generated": events_written,
            "total_transactions_generated": tx_count,
            "output_path": output_file,
            "seeded_scenarios": seeded_scenario_counts,
        }

    def _generate_normal_sale(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        item_count = random.randint(2, 6)
        subtotal = 0.0

        for i in range(item_count):
            item = random.choice(GROCERY_CATALOG)
            t = t0 + datetime.timedelta(seconds=(i + 1) * 6)
            qty = random.randint(1, 3) if not item["is_produce"] else round(random.uniform(1.0, 3.5), 2)
            price = item["price"]
            tot = round(qty * price, 2)
            subtotal += tot
            evs.append(self._make_event(
                tx_id, store, reg, cashier, t, len(evs) + 1,
                "ITEM_MANUAL" if item["is_produce"] else "ITEM_SCAN",
                upc=item["upc"], desc=item["desc"], dept=item["dept"],
                qty=qty, unit_price=price, total_price=tot,
                is_scan=not item["is_produce"], is_manual=item["is_produce"]
            ))

        tax = round(subtotal * 0.07, 2)
        total = round(subtotal + tax, 2)
        tender_t = t0 + datetime.timedelta(seconds=(item_count + 1) * 7)
        tender_type = random.choice(["CREDIT", "DEBIT", "CASH", "EBT"])
        tender_amt = total if tender_type != "CASH" else float(int(total) + 5.0)

        evs.append(self._make_event(
            tx_id, store, reg, cashier, tender_t, len(evs) + 1, "TENDER",
            tender_type=tender_type, tender_amount=tender_amt
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, tender_t + datetime.timedelta(seconds=2), len(evs) + 1, "TX_COMPLETE"
        ))
        return evs

    def _generate_suspended_resumed(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        """A customer starts scanning, suspends the transaction, and resumes it later on another register."""
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        it1 = GROCERY_CATALOG[0]
        it2 = GROCERY_CATALOG[3]

        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=5), 2, "ITEM_SCAN",
            upc=it1["upc"], desc=it1["desc"], dept=it1["dept"], qty=1, unit_price=it1["price"], total_price=it1["price"]
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=10), 3, "ITEM_SCAN",
            upc=it2["upc"], desc=it2["desc"], dept=it2["dept"], qty=1, unit_price=it2["price"], total_price=it2["price"]
        ))
        # Suspend
        t_sus = t0 + datetime.timedelta(seconds=20)
        evs.append(self._make_event(tx_id, store, reg, cashier, t_sus, 4, "SUSPEND", reason="CUSTOMER_FETCHING_WALLET"))

        # Resume 10 minutes later on customer service lane
        t_res = t0 + datetime.timedelta(minutes=10)
        res_reg = "LANE_CS_01"
        res_cashier = "CASHIER_02"
        evs.append(self._make_event(tx_id, store, res_reg, res_cashier, t_res, 5, "RESUME"))
        tot = round(it1["price"] + it2["price"] + 0.50, 2)
        evs.append(self._make_event(
            tx_id, store, res_reg, res_cashier, t_res + datetime.timedelta(seconds=15), 6, "TENDER",
            tender_type="CREDIT", tender_amount=tot
        ))
        evs.append(self._make_event(
            tx_id, store, res_reg, res_cashier, t_res + datetime.timedelta(seconds=20), 7, "TX_COMPLETE"
        ))
        return evs

    def _generate_sweethearting_substitution(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        # Expensive steak scanned
        steak = GROCERY_CATALOG[6]  # Filet Mignon $39.99
        t1 = t0 + datetime.timedelta(seconds=5)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t1, 2, "ITEM_SCAN",
            upc=steak["upc"], desc=steak["desc"], dept=steak["dept"], qty=1, unit_price=steak["price"], total_price=steak["price"]
        ))
        # Immediately voided
        t2 = t1 + datetime.timedelta(seconds=4)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t2, 3, "ITEM_VOID",
            upc=steak["upc"], desc=steak["desc"], dept=steak["dept"], qty=1, unit_price=steak["price"], total_price=steak["price"]
        ))
        # Replaced by manual entry banana PLU 4011 at $0.59
        t3 = t2 + datetime.timedelta(seconds=4)
        banana = GROCERY_CATALOG[7]
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t3, 4, "ITEM_MANUAL",
            upc=banana["upc"], desc=banana["desc"], dept=banana["dept"], qty=1, unit_price=banana["price"], total_price=banana["price"],
            is_scan=False, is_manual=True
        ))
        # Tender small amount
        t4 = t3 + datetime.timedelta(seconds=8)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t4, 5, "TENDER", tender_type="CASH", tender_amount=1.00
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t4 + datetime.timedelta(seconds=2), 6, "TX_COMPLETE"
        ))
        return evs

    def _generate_high_cash_refund(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        it = GROCERY_CATALOG[5]  # Ribeye $34.99 x 2 = $69.98
        t1 = t0 + datetime.timedelta(seconds=10)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t1, 2, "RETURN_ITEM",
            upc=it["upc"], desc=it["desc"], dept=it["dept"], qty=2, unit_price=it["price"], total_price=-69.98,
            reason_code="NO_RECEIPT_CUSTOMER_CLAIM"
        ))
        t2 = t1 + datetime.timedelta(seconds=12)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t2, 3, "TENDER",
            tender_type="CASH", tender_amount=-69.98
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t2 + datetime.timedelta(seconds=2), 4, "TX_COMPLETE"
        ))
        return evs

    def _generate_post_void(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = self._generate_normal_sale(tx_id, store, reg, cashier, t0)
        t_pv = t0 + datetime.timedelta(minutes=3)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t_pv, len(evs) + 1, "POST_VOID",
            reason_code="OPERATOR_ERROR_CLAIMED", supervisor_id="MGR_01"
        ))
        return evs

    def _generate_drawer_near_void(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        it = GROCERY_CATALOG[12]  # Laundry detergent $14.99
        t1 = t0 + datetime.timedelta(seconds=8)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t1, 2, "ITEM_SCAN",
            upc=it["upc"], desc=it["desc"], dept=it["dept"], qty=1, unit_price=it["price"], total_price=it["price"]
        ))
        t2 = t1 + datetime.timedelta(seconds=5)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t2, 3, "ITEM_VOID",
            upc=it["upc"], desc=it["desc"], dept=it["dept"], qty=1, unit_price=it["price"], total_price=it["price"]
        ))
        # Cash drawer opened right after void
        t3 = t2 + datetime.timedelta(seconds=3)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t3, 4, "NO_SALE", reason_code="MAKING_CHANGE_UNOFFICIAL"
        ))
        t4 = t3 + datetime.timedelta(seconds=10)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t4, 5, "TX_CANCEL"
        ))
        return evs

    def _generate_void_outlier(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        """Cashier 17 repeatedly voids 30-50% of items in their baskets."""
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        seq = 2
        subtotal = 0.0

        for i in range(4):
            it = random.choice(GROCERY_CATALOG)
            t = t0 + datetime.timedelta(seconds=i * 6)
            evs.append(self._make_event(
                tx_id, store, reg, cashier, t, seq, "ITEM_SCAN",
                upc=it["upc"], desc=it["desc"], dept=it["dept"], qty=1, unit_price=it["price"], total_price=it["price"]
            ))
            seq += 1

            # High chance of voiding this item
            if random.random() < 0.60:
                evs.append(self._make_event(
                    tx_id, store, reg, cashier, t + datetime.timedelta(seconds=2), seq, "ITEM_VOID",
                    upc=it["upc"], desc=it["desc"], dept=it["dept"], qty=1, unit_price=it["price"], total_price=it["price"]
                ))
                seq += 1
            else:
                subtotal += it["price"]

        subtotal = max(1.99, subtotal)
        t_end = t0 + datetime.timedelta(seconds=40)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t_end, seq, "TENDER", tender_type="CASH", tender_amount=subtotal
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t_end + datetime.timedelta(seconds=2), seq + 1, "TX_COMPLETE"
        ))
        return evs

    def _generate_sco_abandonment(self, tx_id, store, reg, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, "SCO_ATTENDANT_01", t0, 1, "TX_START"))
        it1 = GROCERY_CATALOG[5]
        it2 = GROCERY_CATALOG[14]
        evs.append(self._make_event(
            tx_id, store, reg, "SCO_ATTENDANT_01", t0 + datetime.timedelta(seconds=5), 2, "ITEM_SCAN",
            upc=it1["upc"], desc=it1["desc"], dept=it1["dept"], qty=1, unit_price=it1["price"], total_price=it1["price"]
        ))
        evs.append(self._make_event(
            tx_id, store, reg, "SCO_ATTENDANT_01", t0 + datetime.timedelta(seconds=12), 3, "ITEM_SCAN",
            upc=it2["upc"], desc=it2["desc"], dept=it2["dept"], qty=1, unit_price=it2["price"], total_price=it2["price"]
        ))
        # SCO Weight Alert
        evs.append(self._make_event(
            tx_id, store, reg, "SCO_ATTENDANT_01", t0 + datetime.timedelta(seconds=15), 4, "SCO_INTERVENTION",
            reason_code="SECURITY_SCALE_WEIGHT_MISMATCH"
        ))
        # Abandoned
        evs.append(self._make_event(
            tx_id, store, reg, "SCO_ATTENDANT_01", t0 + datetime.timedelta(seconds=45), 5, "TX_CANCEL",
            reason_code="CUSTOMER_WALK_OFF"
        ))
        return evs

    def _generate_normal_return(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        it = GROCERY_CATALOG[1]
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=8), 2, "RETURN_ITEM",
            upc=it["upc"], desc=it["desc"], dept=it["dept"], qty=1, unit_price=it["price"], total_price=-it["price"],
            reason_code="VERIFIED_RECEIPT_RETURN"
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=15), 3, "TENDER",
            tender_type="CREDIT", tender_amount=-it["price"]
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=18), 4, "TX_COMPLETE"
        ))
        return evs

    def _generate_normal_void(self, tx_id, store, reg, cashier, t0) -> List[Dict[str, Any]]:
        evs = []
        evs.append(self._make_event(tx_id, store, reg, cashier, t0, 1, "TX_START"))
        it1 = GROCERY_CATALOG[0]
        it2 = GROCERY_CATALOG[11]
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=5), 2, "ITEM_SCAN",
            upc=it1["upc"], desc=it1["desc"], dept=it1["dept"], qty=1, unit_price=it1["price"], total_price=it1["price"]
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=10), 3, "ITEM_SCAN",
            upc=it2["upc"], desc=it2["desc"], dept=it2["dept"], qty=1, unit_price=it2["price"], total_price=it2["price"]
        ))
        # Customer decided against chips
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=14), 4, "ITEM_VOID",
            upc=it2["upc"], desc=it2["desc"], dept=it2["dept"], qty=1, unit_price=it2["price"], total_price=it2["price"],
            reason_code="CUSTOMER_CHANGED_MIND"
        ))
        tot = round(it1["price"] * 1.07, 2)
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=22), 5, "TENDER",
            tender_type="DEBIT", tender_amount=tot
        ))
        evs.append(self._make_event(
            tx_id, store, reg, cashier, t0 + datetime.timedelta(seconds=25), 6, "TX_COMPLETE"
        ))
        return evs

    def _make_event(
        self, tx_id, store, reg, cashier, dt, seq, etype,
        upc="", desc="", dept="", qty=1.0, unit_price=0.0, total_price=0.0,
        is_scan=True, is_manual=False, tender_type=None, tender_amount=0.0,
        reason="", reason_code="", supervisor_id=None,
    ) -> Dict[str, Any]:
        return {
            "tx_id": tx_id,
            "store_id": store,
            "register_id": reg,
            "cashier_id": cashier,
            "supervisor_id": supervisor_id or "",
            "timestamp": dt.isoformat(),
            "event_seq": seq,
            "event_type": etype,
            "item_upc": upc,
            "item_desc": desc,
            "item_dept": dept,
            "quantity": qty,
            "unit_price": unit_price,
            "total_price": total_price,
            "is_scan": is_scan,
            "is_manual": is_manual,
            "tender_type": tender_type or "",
            "tender_amount": tender_amount,
            "override_type": "",
            "reason_code": reason_code or reason,
        }
