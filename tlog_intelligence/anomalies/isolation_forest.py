"""
Unsupervised Multivariate Anomaly Detection using Isolation Forest.
Discovers anomalous transactions without predetermined rule signatures.
Evaluates multivariate combinations of basket size, duration, void ratios,
manual entries, overrides, discounts, and tender patterns.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest
from typing import Any, Dict, List, Tuple

from ..core.models import AnomalyScore, NormalizedTransaction


class TransactionIsolationForest:
    def __init__(self, contamination: float = 0.02, random_state: int = 42):
        self.contamination = contamination
        self.random_state = random_state
        self.model = IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_estimators=100,
            n_jobs=-1,
        )

    def extract_features(self, tx: NormalizedTransaction) -> List[float]:
        """Extracts numerical vector for multivariate modeling."""
        item_c = float(tx.item_count)
        duration = float(tx.duration_seconds)
        total = float(tx.total)
        voids = float(tx.void_count)
        manuals = float(tx.manual_entry_count)
        overrides = float(tx.override_count)
        drawers = float(tx.drawer_open_count)
        tender_tot = float(tx.tender_total)

        void_rate = voids / max(1.0, item_c + voids)
        manual_rate = manuals / max(1.0, item_c)
        tender_diff = abs(tender_tot - total)
        avg_item_price = total / max(1.0, item_c)

        return [
            total,
            item_c,
            duration,
            voids,
            void_rate,
            manuals,
            manual_rate,
            overrides,
            drawers,
            tender_diff,
            avg_item_price,
        ]

    def fit_predict(
        self, transactions: List[NormalizedTransaction]
    ) -> List[AnomalyScore]:
        if len(transactions) < 20:
            return []

        X = np.array([self.extract_features(t) for t in transactions], dtype=np.float32)

        # Handle any NaN/Inf
        X = np.nan_to_num(X, nan=0.0, posinf=1e6, neginf=0.0)

        # Fit model
        self.model.fit(X)
        raw_scores = self.model.decision_function(X)  # Lower is more anomalous
        preds = self.model.predict(X)  # -1 = anomaly

        # Normalize score to 0.0 - 1.0 where 1.0 is most anomalous
        min_s = float(np.min(raw_scores))
        max_s = float(np.max(raw_scores))
        range_s = max(1e-6, max_s - min_s)
        norm_scores = 1.0 - ((raw_scores - min_s) / range_s)

        feature_names = [
            "total", "item_count", "duration", "void_count", "void_rate",
            "manual_entry_count", "manual_rate", "override_count", "drawer_open_count",
            "tender_discrepancy", "avg_item_price"
        ]

        # Calculate medians across dataset for neutral explanations
        medians = np.median(X, axis=0)

        anomalies: List[AnomalyScore] = []
        for idx, (is_anom, score) in enumerate(zip(preds, norm_scores)):
            if is_anom == -1 and score >= 0.75:
                tx = transactions[idx]
                feat_vals = X[idx]

                # Identify top contributing unusual dimensions
                contributions = []
                for f_i, f_name in enumerate(feature_names):
                    ratio = feat_vals[f_i] / max(1e-3, medians[f_i])
                    if ratio > 3.0:
                        contributions.append(f"{f_name.replace('_', ' ').title()} is {ratio:.1f}x higher than median")

                label = self._generate_neutral_label(tx, contributions)

                anomalies.append(AnomalyScore(
                    anomaly_id=f"ANOM_IF_{tx.tx_id}",
                    level="TRANSACTION",
                    entity_id=tx.tx_id,
                    score=round(float(score), 4),
                    method="ISOLATION_FOREST",
                    label=label,
                    features={feature_names[i]: float(feat_vals[i]) for i in range(len(feature_names))},
                    contributing_factors=contributions[:3],
                    related_transactions=[tx.tx_id],
                ))

        return anomalies

    def _generate_neutral_label(self, tx: NormalizedTransaction, contributions: List[str]) -> str:
        if tx.void_count > 0 and tx.manual_entry_count > 0:
            return "Unusual transaction profile: Co-occurrence of item voids and manual price entries"
        elif tx.drawer_open_count > 0:
            return "Unusual transaction profile: Drawer event in atypical basket context"
        elif tx.duration_seconds > 600:
            return "Unusual transaction profile: Extended checkout duration with irregular item flow"
        return "Unusual multivariate transaction pattern identified by isolation forest"
