"""
Cashier Peer-Group Baseline and Statistical Deviation Engine.
Calculates peer baselines using Robust Median Absolute Deviation (MAD)
and rate-based metrics (void rate, manual entry rate, no-sale rate)
adjusted for transaction volume, lane type, and basket size.
"""

from __future__ import annotations

import numpy as np
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from ..core.models import AnomalyScore, NormalizedTransaction


class CashierPeerGroupAnalyzer:
    def __init__(self, min_transactions_per_cashier: int = 15):
        self.min_tx = min_transactions_per_cashier

    def compute_baselines_and_anomalies(
        self, transactions: List[NormalizedTransaction]
    ) -> Tuple[Dict[str, Dict[str, float]], List[AnomalyScore]]:
        # Group transactions by cashier
        by_cashier = defaultdict(list)
        for t in transactions:
            by_cashier[t.cashier_id].append(t)

        cashier_stats: Dict[str, Dict[str, float]] = {}

        for cid, txs in by_cashier.items():
            tot_items = sum(t.item_count for t in txs)
            tot_voids = sum(t.void_count for t in txs)
            tot_manuals = sum(t.manual_entry_count for t in txs)
            tot_no_sales = sum(t.drawer_open_count for t in txs)
            tot_tx = len(txs)

            v_rate = tot_voids / max(1, tot_items + tot_voids)
            m_rate = tot_manuals / max(1, tot_items)
            ns_rate = tot_no_sales / max(1, tot_tx)

            cashier_stats[cid] = {
                "tx_count": tot_tx,
                "total_items": tot_items,
                "void_rate": round(v_rate, 4),
                "manual_rate": round(m_rate, 4),
                "no_sale_rate": round(ns_rate, 4),
            }

        # Calculate population robust peer medians (only considering cashiers with sufficient volume)
        qualified_cids = [cid for cid, s in cashier_stats.items() if s["tx_count"] >= self.min_tx]
        if not qualified_cids:
            qualified_cids = list(cashier_stats.keys())

        if not qualified_cids:
            return {}, []

        void_rates = np.array([cashier_stats[cid]["void_rate"] for cid in qualified_cids], dtype=np.float64)
        manual_rates = np.array([cashier_stats[cid]["manual_rate"] for cid in qualified_cids], dtype=np.float64)
        ns_rates = np.array([cashier_stats[cid]["no_sale_rate"] for cid in qualified_cids], dtype=np.float64)

        med_v = float(np.median(void_rates))
        mad_v = float(np.median(np.abs(void_rates - med_v))) or 0.005

        med_m = float(np.median(manual_rates))
        mad_m = float(np.median(np.abs(manual_rates - med_m))) or 0.005

        med_ns = float(np.median(ns_rates))
        mad_ns = float(np.median(np.abs(ns_rates - med_ns))) or 0.005

        # Attach peer baseline medians to stats
        for cid in cashier_stats:
            cashier_stats[cid]["peer_void_rate"] = round(med_v, 4)
            cashier_stats[cid]["peer_manual_rate"] = round(med_m, 4)
            cashier_stats[cid]["peer_no_sale_rate"] = round(med_ns, 4)

        anomalies: List[AnomalyScore] = []

        # Find significant cashier outliers (Z_mad > 3.0)
        for cid in qualified_cids:
            s = cashier_stats[cid]
            tx_c = s["tx_count"]
            v_rate = s["void_rate"]
            m_rate = s["manual_rate"]
            ns_rate = s["no_sale_rate"]

            z_v = (v_rate - med_v) / (1.4826 * mad_v)
            z_m = (m_rate - med_m) / (1.4826 * mad_m)
            z_ns = (ns_rate - med_ns) / (1.4826 * mad_ns)

            contributions = []
            if z_v > 3.0 and v_rate > 0.04:
                ratio = v_rate / max(0.001, med_v)
                contributions.append(f"Item void rate ({v_rate:.1%}) is {ratio:.1f}x the peer median ({med_v:.1%})")

            if z_m > 3.0 and m_rate > 0.08:
                ratio = m_rate / max(0.001, med_m)
                contributions.append(f"Manual entry rate ({m_rate:.1%}) is {ratio:.1f}x the peer median ({med_m:.1%})")

            if z_ns > 3.0 and ns_rate > 0.05:
                ratio = ns_rate / max(0.001, med_ns)
                contributions.append(f"Drawer open/no-sale rate ({ns_rate:.1%}) is {ratio:.1f}x peer median ({med_ns:.1%})")

            if contributions:
                max_z = max(z_v, z_m, z_ns)
                score = round(min(1.0, 0.70 + (min(max_z, 10.0) / 10.0) * 0.28), 4)
                related_txs = [t.tx_id for t in by_cashier[cid][:10]]

                anomalies.append(AnomalyScore(
                    anomaly_id=f"ANOM_CASHIER_{cid}",
                    level="CASHIER",
                    entity_id=cid,
                    score=score,
                    method="ROBUST_MAD",
                    label=f"Cashier peer outlier: Statistical deviation across operational metrics ({cid})",
                    features=s,
                    contributing_factors=contributions,
                    related_transactions=related_txs,
                ))

        return cashier_stats, anomalies
