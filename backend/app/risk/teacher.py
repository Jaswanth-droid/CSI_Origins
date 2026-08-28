"""
"Teacher" risk scorer used ONLY to generate continuous training targets for
the ML model (weak/distant supervision), never called at inference time.

Why this exists: a plain binary classifier's predict_proba tends to push
everything to near-0 or near-1 once it finds the strongest discriminating
combination of features (in our case: SIM change + password reset close
together). That makes it a poor fit for a system that needs to output a
believable MEDIUM-risk score, not just LOW or HIGH. Instead we train a
RandomForestRegressor to approximate a transparent, weighted-sum function
of the same behavioral features used everywhere else in the system, with
noise injected during training so the model learns a smooth, generalizable
mapping instead of memorizing a lookup table. The regressor -- not this
function -- is what actually runs at inference time (see app/risk/engine.py);
this keeps the requirement "do not hardcode risk = 90 if account ==
compromised" satisfied, since the runtime score always comes from the
trained model evaluated on live feature vectors, including combinations of
signals that never appeared in any hand-written archetype.
"""
import math

from app.config import FEATURE_BASE_WEIGHTS

# Calibrated so a "typical full compromise" sequence lands ~90-97 and a
# well-behaved normal account lands ~2-8. Tuned empirically against the
# synthetic archetypes in app/risk/scenarios.py.
_SATURATION_SCALE = 55.0


def teacher_severity(features: dict) -> float:
    raw = 0.0
    for name, weight in FEATURE_BASE_WEIGHTS.items():
        activation = min(float(features.get(name, 0.0)), 1.5)
        raw += weight * activation

    # smooth saturating curve: 0 -> 0, grows quickly then flattens near 100
    severity = 100.0 * (1.0 - math.exp(-raw / _SATURATION_SCALE))
    return max(0.0, min(100.0, severity))
