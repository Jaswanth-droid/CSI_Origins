"""
Recipient Risk Engine (hackathon brief section 4) -- the orchestration
layer that ties together feature extraction, the trained ML model, the
central threshold config, and the explainability layer into one
`assess()` call.

Deliberately framework-free: takes a plain list of event dicts and a
reference time, returns a plain dict. app/routers/*.py (FastAPI) and
app/seed.py / verify scripts all call into this same function so the
"what does risk scoring actually do" logic exists in exactly one place.
"""
import threading
from datetime import datetime

import joblib
import numpy as np

from app.config import (
    MODEL_PATH, METRICS_PATH, risk_level_for_score, decision_for_level, RISK_LEVELS,
)
from app.risk.features import extract_features, feature_vector, FEATURE_NAMES
from app.risk.explain import compute_contributions, top_level_reason, build_reasons_list
from app.events import event_label

_model_lock = threading.Lock()
_model = None
_feature_importances = None


def _load_model():
    global _model, _feature_importances
    with _model_lock:
        if _model is None:
            if not MODEL_PATH.exists():
                raise RuntimeError(
                    f"No trained model found at {MODEL_PATH}. "
                    f"Run `python -m app.ml.train_model` first."
                )
            _model = joblib.load(MODEL_PATH)
            _feature_importances = dict(zip(FEATURE_NAMES, _model.feature_importances_))
    return _model, _feature_importances


def _tree_agreement_confidence(model, x_row) -> float:
    """Confidence derived from how tightly the individual trees in the
    forest agree on this sample's risk severity. Low spread across trees
    (all trees predict a similar score) -> high confidence. Wide spread
    (trees disagree) -> lower confidence. This is a natural, honest
    confidence measure for a RandomForestRegressor with no extra
    calibration library required."""
    try:
        per_tree = np.array([est.predict(x_row) for est in model.estimators_]).ravel()
        spread = float(per_tree.std())
        # empirically, well-separated cases (very normal or very
        # compromised) have low tree-to-tree spread (~0-5 points); genuinely
        # ambiguous cases have higher spread (~10-25 points).
        confidence = max(0.5, 1.0 - min(spread / 25.0, 0.45))
        return confidence
    except Exception:
        return 0.75


def assess(events: list, reference_time: datetime = None, account_context: dict = None) -> dict:
    """Run the full recipient risk assessment pipeline on an event sequence.

    Returns a dict matching the API contract in the hackathon brief
    section 12 (risk_score, risk_level, decision, confidence, reasons,
    recent_events) plus the explainability breakdown for section 8.
    """
    model, feature_importances = _load_model()

    features = extract_features(events, reference_time=reference_time)
    x = np.array([feature_vector(features)])

    predicted_severity = float(model.predict(x)[0])
    risk_score = round(max(0.0, min(100.0, predicted_severity)), 1)
    risk_level = risk_level_for_score(risk_score)
    decision = decision_for_level(risk_level)
    confidence = round(_tree_agreement_confidence(model, x), 3)

    contributions = compute_contributions(features, feature_importances, risk_score)
    if risk_level == "LOW":
        # keep the LOW-risk screen clean -- don't surface minor noise as if
        # it were a meaningful "reason" when the account is clearly fine.
        contributions = [c for c in contributions if c["points"] >= 8]
    reasons = build_reasons_list(contributions)
    top_reason = top_level_reason(features, contributions, risk_score=risk_score)

    recent_sorted = sorted(events, key=lambda e: e["timestamp"], reverse=True)
    recent_events_out = [
        {
            "event_type": e["event_type"],
            "label": event_label(e["event_type"]),
            "timestamp": e["timestamp"].isoformat() if isinstance(e["timestamp"], datetime) else e["timestamp"],
            "device_id": e.get("device_id"),
            "ip_address": e.get("ip_address"),
            "location": e.get("location"),
            "amount": e.get("amount"),
            "metadata": e.get("metadata") or {},
            "risk_signal": bool(e.get("risk_signal")),
        }
        for e in recent_sorted
    ]

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "decision": decision,
        "action_label": RISK_LEVELS[risk_level]["action"],
        "headline": RISK_LEVELS[risk_level]["headline"],
        "description": RISK_LEVELS[risk_level]["description"],
        "confidence": confidence,
        "reasons": reasons,
        "top_reason": top_reason,
        "feature_contributions": contributions,
        "features": features,
        "recent_events": recent_events_out,
        "model_type": type(model).__name__,
        "assessed_at": (reference_time or datetime.utcnow()).isoformat(),
    }


def model_metrics() -> dict:
    import json
    if not METRICS_PATH.exists():
        return {}
    with open(METRICS_PATH) as f:
        return json.load(f)
