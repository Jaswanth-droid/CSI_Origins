"""
Standalone verification: proves the risk engine + trained ML model
correctly classify the 3 canonical demo account patterns from the
hackathon brief (section 3) WITHOUT needing a database or a running
FastAPI server -- useful for sanity-checking after any change to
scenarios.py, features.py, or the trained model.

Run:  python verify_demo_accounts.py
"""
import sys
from datetime import datetime

from app.risk.scenarios import build_normal_sequence, build_medium_sequence, build_compromised_sequence
from app.risk import engine

NOW = datetime(2026, 8, 15, 15, 0, 0)

CASES = [
    ("ACCOUNT 1 - Normal Recipient", build_normal_sequence(NOW, seed=101), "LOW"),
    ("ACCOUNT 3 - Medium Risk Recipient", build_medium_sequence(NOW, seed=303, demo_mode=True), "MEDIUM"),
    ("ACCOUNT 2 - Compromised Recipient", build_compromised_sequence(NOW, seed=202, demo_mode=True), "HIGH"),
]


def main():
    all_pass = True
    for name, events, expected_level in CASES:
        result = engine.assess(events, reference_time=NOW)
        ok = result["risk_level"] == expected_level
        all_pass = all_pass and ok
        status = "PASS" if ok else "FAIL"
        print(f"\n[{status}] {name}")
        print(f"  expected={expected_level}  got={result['risk_level']}  score={result['risk_score']}  "
              f"decision={result['decision']}  confidence={result['confidence']}")
        print(f"  top_reason: {result['top_reason']}")
        print(f"  reasons: {result['reasons']}")
        print(f"  events_in_sequence: {len(events)}")

    print("\n" + ("ALL CHECKS PASSED" if all_pass else "SOME CHECKS FAILED"))
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
