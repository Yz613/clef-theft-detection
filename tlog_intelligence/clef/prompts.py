"""
Clef Question Schemas and System One Prompt Formulations.
Adheres strictly to the Cloudflare Clef System One typed question specification:
'choice', 'score', and 'noul' types executed in a single forward pass over the joint decision head.
"""

from typing import Any, Dict


def get_loss_prevention_questions() -> Dict[str, Any]:
    """Returns the standardized LP decision schema for Cloudflare Clef."""
    return {
        "review_priority": {
            "type": "choice",
            "instructions": "Based only on the available evidence, what is the appropriate investigation priority?",
            "criteria": {
                "none": "No meaningful exception supported by the evidence",
                "low": "Minor anomaly or likely ordinary variation",
                "medium": "Material anomaly requiring review",
                "high": "Strong and repeated anomalous pattern warranting prompt investigation",
            },
        },
        "pattern_type": {
            "type": "choice",
            "instructions": "Which description best fits the observed sequence?",
            "criteria": {
                "price_substitution": "Higher-priced item removed and lower-priced item entered",
                "sweethearting_suspicion": "Excessive voids, bypasses, or collusion indicators",
                "unusual_refund": "High-value, rapid, or unverified refund pattern",
                "tender_manipulation": "Drawer openings near voids or tender amount discrepancies",
                "ordinary_correction": "Likely routine checkout correction or legitimate suspended transaction",
                "unknown": "Evidence insufficient or pattern does not fit listed categories",
            },
        },
        "manual_review_needed": {
            "type": "noul",
            "instructions": "Does the available evidence warrant human review?",
        },
        "video_review_value": {
            "type": "score",
            "instructions": "How useful would corresponding checkout video be for resolving this case?",
            "criteria": [
                "Unlikely to add useful evidence",
                "Possibly useful",
                "Highly useful",
                "Important for determining what physically occurred",
            ],
        },
    }
