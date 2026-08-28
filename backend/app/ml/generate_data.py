"""
Synthetic behavioral-sequence dataset generator (hackathon brief section 5).

We do not have real bank data, so we generate several thousand synthetic
recipient-account event sequences spanning normal, medium-risk and
compromised archetypes (using the SAME scenario builders that seed the demo
accounts and power the live simulation endpoints -- see app/risk/scenarios.py
for why that matters), extract behavioral features for each, and label them:

    0 = normal account
    1 = compromised account

Medium-risk archetypes are intentionally labeled 0 (not compromised) but
carry partially-elevated features. This is what teaches the classifier a
smooth probability gradient instead of a hard 0/100 cliff, so predict_proba
naturally spreads into the MEDIUM risk band for ambiguous cases rather than
only ever outputting near-0 or near-100.

Run directly:  python -m app.ml.generate_data
"""
import argparse
import random
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from app.risk.scenarios import (
    build_normal_sequence, build_medium_sequence, build_compromised_sequence,
    build_innocent_security_change_sequence,
)
from app.risk.features import extract_features, FEATURE_NAMES
from app.risk.teacher import teacher_severity
from app.config import DATA_DIR

SYNTHETIC_CSV_PATH = DATA_DIR / "synthetic_training_data.csv"


def generate_dataset(n_samples: int = 6000, seed: int = 42) -> pd.DataFrame:
    rng = random.Random(seed)
    np.random.seed(seed)

    rows = []
    # class mix: 54% normal, 20% medium-risk, 18% compromised, 8% "innocent
    # security change" (normal accounts that legitimately triggered one
    # security event -- these are the hard negatives that keep the
    # false-positive-rate measurement meaningful instead of trivially zero).
    n_normal = int(n_samples * 0.54)
    n_medium = int(n_samples * 0.20)
    n_innocent = int(n_samples * 0.08)
    n_compromised = n_samples - n_normal - n_medium - n_innocent

    base_time = datetime(2026, 8, 15, 12, 0, 0)

    plan = (
        [("normal", build_normal_sequence) for _ in range(n_normal)]
        + [("medium", build_medium_sequence) for _ in range(n_medium)]
        + [("innocent_security_change", build_innocent_security_change_sequence) for _ in range(n_innocent)]
        + [("compromised", build_compromised_sequence) for _ in range(n_compromised)]
    )
    rng.shuffle(plan)

    for i, (archetype, builder) in enumerate(plan):
        sample_seed = rng.randint(0, 2**31 - 1)
        # jitter "now" per sample so the model doesn't overfit to a single clock
        now = base_time - timedelta(days=rng.randint(0, 20), hours=rng.randint(0, 23))
        events = builder(now, seed=sample_seed)

        # inject light label noise / real-world messiness: occasionally drop
        # an event or add a harmless extra login, so the model can't just
        # pattern-match on exact sequence length.
        if rng.random() < 0.15 and len(events) > 3:
            events.pop(rng.randrange(len(events)))
        if rng.random() < 0.15:
            events.append({
                "event_type": "LOGIN_SUCCESS", "timestamp": now - timedelta(minutes=rng.randint(1, 30)),
                "device_id": "DEV-EXTRA", "ip_address": "10.0.0.1", "location": "Chennai, IN",
                "amount": None, "metadata": {}, "risk_signal": False,
            })

        feats = extract_features(events, reference_time=now)
        label = 1 if archetype == "compromised" else 0

        # Continuous regression target: a transparent, weighted-sum
        # "teacher" severity score (see app/risk/teacher.py) plus noise, so
        # the model learns a smooth risk gradient (needed for a believable
        # MEDIUM risk band) instead of a binary near-0/near-1 cliff. The
        # teacher itself is never called at inference time -- only the
        # trained regressor is (see app/risk/engine.py).
        severity = teacher_severity(feats)
        severity = max(0.0, min(100.0, severity + np.random.normal(0, 2.5)))

        row = dict(feats)
        row["archetype"] = archetype
        row["label"] = label
        row["target_severity"] = severity
        rows.append(row)

    df = pd.DataFrame(rows)
    # keep canonical column order + metadata columns at the end
    df = df[FEATURE_NAMES + ["archetype", "label", "target_severity"]]
    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=6000, help="number of synthetic sequences to generate")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    df = generate_dataset(n_samples=args.n, seed=args.seed)
    df.to_csv(SYNTHETIC_CSV_PATH, index=False)
    print(f"Generated {len(df)} synthetic samples -> {SYNTHETIC_CSV_PATH}")
    print(df["archetype"].value_counts())
    print(df["label"].value_counts())


if __name__ == "__main__":
    main()
