"""
Explainable AI layer (hackathon brief section 8).

SHAP was evaluated but dropped to keep the dependency footprint small and
100% reliable to install (per section 19's explicit fallback instruction).
Instead we implement a transparent feature-contribution explanation that
combines two signals so the "why" is never just a black box:

  1. The trained RandomForest's own `feature_importances_` (how much the
     MODEL actually relies on each feature globally)
  2. Each feature's activation strength for THIS specific account (a
     feature the model cares about that is also strongly active right now
     contributes more than one that barely fired)

Contributions are then rescaled so they sum to (approximately) the final
risk_score, and converted into the point-based "+25 New device" style
breakdown the brief's worked example shows, plus a single synthesized
top-line reason.
"""
from app.config import FEATURE_LABELS, FEATURE_BASE_WEIGHTS


def compute_contributions(features: dict, feature_importances: dict, risk_score: float, top_n: int = 6):
    """Return a sorted list of {feature, label, points, value} dicts whose
    `points` roughly sum to risk_score, ranked by importance * activation."""
    raw = {}
    for name, value in features.items():
        importance = feature_importances.get(name, 0.0)
        base_weight = FEATURE_BASE_WEIGHTS.get(name, 5)
        # blend the model's learned importance with the hand-tuned base
        # weight so a feature the model has learned to rely on heavily still
        # shows up even if its brief-example weight is small, and vice versa.
        raw[name] = (0.6 * importance * 100 + 0.4 * base_weight) * min(value, 2.0)

    total = sum(v for v in raw.values() if v > 0) or 1.0
    scaled = {name: (v / total) * risk_score for name, v in raw.items() if v > 0}

    ranked = sorted(scaled.items(), key=lambda kv: -kv[1])[:top_n]
    contributions = []
    for name, points in ranked:
        if points < 1:
            continue
        contributions.append({
            "feature": name,
            "label": FEATURE_LABELS.get(name, name.replace("_", " ").title()),
            "points": round(points),
            "activation": round(min(features.get(name, 0.0), 2.0), 2),
        })
    return contributions


def top_level_reason(features: dict, contributions: list, risk_score: float = None) -> str:
    """A single synthesized sentence explaining the dominant driver."""
    if risk_score is not None and risk_score < 15:
        return "No significant behavioral risk signals were detected on this account."
    sec_changes = features.get("multiple_security_changes", 0)
    clustering = features.get("time_between_security_events", 0)
    if sec_changes >= 0.66 and clustering >= 0.5:
        return "Multiple security-sensitive changes occurred within a short time window."
    if features.get("recent_sim_change", 0) and features.get("recent_password_reset", 0):
        return "A SIM change and a password reset were both detected in quick succession -- a strong takeover indicator."
    if features.get("transaction_velocity", 0) >= 1.0 and features.get("large_outgoing_transfer", 0):
        return "A burst of large, rapid outgoing transfers followed recent account changes."
    if contributions:
        return f"{contributions[0]['label']} is the leading contributor to this account's risk score."
    return "No significant behavioral risk signals were detected."


def build_reasons_list(contributions: list, events_lookup: dict = None) -> list:
    """Human-readable reason strings for the UI, e.g. 'New device detected'."""
    return [c["label"] for c in contributions]
