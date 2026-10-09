"""
Unsupervised Event Sequence Mining and Rarity Discovery.
Discovers rare and anomalous chronological event transitions (n-grams)
without predefined heuristics.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Tuple

from ..core.models import AnomalyScore, NormalizedTransaction


class SequenceAnomalyDetector:
    def __init__(self, n_gram_size: int = 3, rarity_threshold: float = 0.005):
        self.n_gram_size = n_gram_size
        self.rarity_threshold = rarity_threshold

    def discover_rare_sequences(
        self, transactions: List[NormalizedTransaction]
    ) -> List[AnomalyScore]:
        if len(transactions) < 10:
            return []

        # Count all n-grams across all transactions
        ngram_counts: Counter[Tuple[str, ...]] = Counter()
        tx_ngrams: Dict[str, List[Tuple[str, ...]]] = {}

        for tx in transactions:
            ev_types = tx.event_types
            ngrams = []
            if len(ev_types) >= self.n_gram_size:
                for i in range(len(ev_types) - self.n_gram_size + 1):
                    gram = tuple(ev_types[i : i + self.n_gram_size])
                    ngrams.append(gram)
                    ngram_counts[gram] += 1
            tx_ngrams[tx.tx_id] = ngrams

        total_ngrams = sum(ngram_counts.values()) or 1
        anomalies: List[AnomalyScore] = []

        # Find transactions containing rare sequences
        for tx in transactions:
            ngrams = tx_ngrams.get(tx.tx_id, [])
            rarest_gram = None
            lowest_prob = 1.0

            for g in ngrams:
                p = ngram_counts[g] / total_ngrams
                if p < lowest_prob:
                    lowest_prob = p
                    rarest_gram = g

            # If the transaction contains a sequence appearing in < 0.1% of transitions
            if rarest_gram and lowest_prob < self.rarity_threshold and ngram_counts[rarest_gram] <= 5:
                # Disregard single scan repetitions (e.g. (SCAN, SCAN, SCAN))
                if all(item == "ITEM_SCAN" for item in rarest_gram):
                    continue

                gram_str = " ➔ ".join(item.replace("ITEM_", "").replace("TX_", "") for item in rarest_gram)
                label = f"Unusual event sequence: {gram_str}"

                # Calculate anomaly score
                score = round(min(1.0, 0.70 + (1.0 - (lowest_prob / self.rarity_threshold)) * 0.28), 4)

                anomalies.append(AnomalyScore(
                    anomaly_id=f"ANOM_SEQ_{tx.tx_id}",
                    level="TRANSACTION",
                    entity_id=tx.tx_id,
                    score=score,
                    method="SEQUENCE_MINING",
                    label=label,
                    features={
                        "sequence": list(rarest_gram),
                        "frequency": ngram_counts[rarest_gram],
                        "empirical_probability": round(lowest_prob, 6),
                    },
                    contributing_factors=[
                        f"Event sequence '{gram_str}' occurred only {ngram_counts[rarest_gram]} time(s) across entire dataset."
                    ],
                    related_transactions=[tx.tx_id],
                ))

        return anomalies
