"""
Store and Cross-Store Level Anomaly Detection.
Analyzes store-level exception distributions, shift variations,
and cross-store comparative outliers.
"""

from __future__ import annotations

import numpy as np
from collections import defaultdict
from typing import Any, Dict, List

from ..core.models import AnomalyScore, NormalizedTransaction


class StoreBaselineAnalyzer:
    def analyze_stores(
        self, transactions: List[NormalizedTransaction]
    ) -> List[AnomalyScore]:
        by_store = defaultdict(list)
        for t in transactions:
            by_store[t.store_id].append(t)

        if len(by_store) < 2:
            return []

        store_stats = {}
        for sid, txs in by_store.items():
            tot_tx = len(txs)
            tot_items = sum(t.item_count for t in txs)
            tot_voids = sum(t.void_count for t in txs)
            tot_manuals = sum(t.manual_entry_count for t in txs)
            tot_overrides = sum(t.override_count for t in txs)

            store_stats[sid] = {
                "tx_count": tot_tx,
                "void_rate": tot_voids / max(1, tot_items),
                "manual_rate": tot_manuals / max(1, tot_items),
                "override_rate": tot_overrides / max(1, tot_tx),
            }

        void_rates = [s["void_rate"] for s in store_stats.values()]
        med_v = float(np.median(void_rates))
        std_v = float(np.std(void_rates)) or 0.005

        anomalies: List[AnomalyScore] = []
        for sid, s in store_stats.items():
            if s["tx_count"] >= 50:
                z = (s["void_rate"] - med_v) / std_v
                if z >= 2.0:
                    score = round(min(1.0, 0.70 + (z / 5.0) * 0.28), 4)
                    related_txs = [t.tx_id for t in by_store[sid][:10]]
                    anomalies.append(AnomalyScore(
                        anomaly_id=f"ANOM_STORE_{sid}",
                        level="STORE",
                        entity_id=sid,
                        score=score,
                        method="CROSS_STORE_STATISTICAL",
                        label=f"Cross-store outlier: Store {sid} exhibits elevated exception frequency",
                        features=s,
                        contributing_factors=[
                            f"Store void rate ({s['void_rate']:.1%}) is significantly elevated compared to peer stores ({med_v:.1%})."
                        ],
                        related_transactions=related_txs,
                    ))

        return anomalies
