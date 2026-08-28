"""
Behavioral feature engineering for Recipient Shield's sequence-based
detection (hackathon brief sections 4 & 6).

`extract_features` turns a chronological list of raw account events into a
fixed-size numeric feature vector. It is deliberately dependency-free
(plain dicts + stdlib datetime only) so it can run identically:

  - inside the FastAPI request path (on events pulled from the DB)
  - inside the offline synthetic-data generator (on events built in memory)
  - inside a unit test (on hand-written event lists)

The KEY DIFFERENTIATOR (brief section 6) is that this function does not just
look at isolated events -- it looks at how close together security-sensitive
events happened (`time_between_security_events`), and how many distinct
security-sensitive event types occurred (`multiple_security_changes`). A
lone password reset looks very different from a password-reset-then-SIM-
change-then-new-beneficiary five minutes later.
"""
from datetime import datetime, timedelta
from statistics import mean, pstdev

from app.config import (
    EVENT_LOOKBACK_HOURS, LARGE_TRANSFER_AMOUNT,
    RAPID_TRANSACTION_WINDOW_MINUTES, RAPID_TRANSACTION_COUNT_THRESHOLD,
)
from app.events import SECURITY_SENSITIVE_TYPES

# The canonical, ordered list of features the ML model is trained on.
# ORDER MATTERS: this list defines the vector layout used by both
# generate_data.py (training) and engine.py (inference).
FEATURE_NAMES = [
    "recent_device_change",
    "recent_new_device",
    "recent_password_reset",
    "recent_password_change",
    "recent_sim_change",
    "recent_email_change",
    "recent_beneficiary_added",
    "recent_beneficiary_modified",
    "failed_login_count",
    "new_location",
    "unusual_login_time",
    "transaction_velocity",
    "large_incoming_transfer",
    "large_outgoing_transfer",
    "rapid_transactions",
    "unusual_transaction_amount",
    "multiple_security_changes",
    "time_between_security_events",
    "profile_change",
    "total_recent_events",
]

NIGHT_HOURS = set(list(range(0, 6)) + [23])


def _in_window(ts: datetime, reference_time: datetime, hours=EVENT_LOOKBACK_HOURS) -> bool:
    return timedelta(0) <= (reference_time - ts) <= timedelta(hours=hours)


def extract_features(events: list, reference_time: datetime = None) -> dict:
    """Compute the behavioral feature vector for one account.

    `events` is a list of dicts with keys: event_type, timestamp, device_id,
    ip_address, location, amount, metadata, risk_signal.
    `reference_time` defaults to the timestamp of the most recent event
    (falls back to utcnow if the event list is empty) -- i.e. "how does this
    account look right now, at the moment someone is about to send it money".
    """
    if not events:
        reference_time = reference_time or datetime.utcnow()
        return {name: 0.0 for name in FEATURE_NAMES}

    events = sorted(events, key=lambda e: e["timestamp"])
    reference_time = reference_time or events[-1]["timestamp"]

    recent = [e for e in events if _in_window(e["timestamp"], reference_time)]
    historical = [e for e in events if e not in recent]

    def count(event_type):
        return sum(1 for e in recent if e["event_type"] == event_type)

    def has(event_type):
        return 1.0 if count(event_type) > 0 else 0.0

    failed_logins = count("LOGIN_FAILED")
    new_location = has("NEW_IP_LOCATION")
    unusual_time = 0.0
    for e in recent:
        if e["event_type"] in ("LOGIN_SUCCESS", "LOGIN_FAILED") and e["timestamp"].hour in NIGHT_HOURS:
            unusual_time = 1.0
            break

    # transaction velocity: number of monetary transactions inside the rapid window
    tx_events = [e for e in recent if e.get("amount")]
    velocity = 0.0
    if tx_events:
        tx_events_sorted = sorted(tx_events, key=lambda e: e["timestamp"])
        for i, e in enumerate(tx_events_sorted):
            window_count = sum(
                1 for o in tx_events_sorted
                if timedelta(0) <= (e["timestamp"] - o["timestamp"]) <= timedelta(minutes=RAPID_TRANSACTION_WINDOW_MINUTES)
            )
            velocity = max(velocity, window_count)
        velocity = min(velocity / max(RAPID_TRANSACTION_COUNT_THRESHOLD, 1), 3.0)

    large_incoming = has("LARGE_INCOMING_TRANSFER")
    large_outgoing = 1.0 if (has("LARGE_OUTGOING_TRANSFER") or any(
        e["event_type"] == "LARGE_OUTGOING_TRANSFER" and (e.get("amount") or 0) >= LARGE_TRANSFER_AMOUNT for e in recent
    )) else 0.0
    rapid_tx = has("RAPID_TRANSACTIONS") or (1.0 if velocity >= 1.0 else 0.0)

    # unusual transaction amount: compare recent tx amounts against the
    # account's own historical baseline (z-score style, capped).
    hist_amounts = [e["amount"] for e in historical if e.get("amount")]
    recent_amounts = [e["amount"] for e in tx_events]
    unusual_amount = 0.0
    if recent_amounts:
        if len(hist_amounts) >= 3:
            mu, sigma = mean(hist_amounts), (pstdev(hist_amounts) or 1.0)
            z = max((max(recent_amounts) - mu) / sigma, 0.0)
            unusual_amount = min(z / 3.0, 1.0)
        else:
            # no real baseline yet -- fall back to an absolute large-amount heuristic
            unusual_amount = 1.0 if max(recent_amounts) >= LARGE_TRANSFER_AMOUNT else min(max(recent_amounts) / LARGE_TRANSFER_AMOUNT, 1.0)

    sec_events = [e for e in recent if e["event_type"] in SECURITY_SENSITIVE_TYPES]
    distinct_sec_types = len(set(e["event_type"] for e in sec_events))
    multiple_sec_changes = min(distinct_sec_types / 3.0, 2.0)  # 3+ distinct types -> saturates

    if len(sec_events) >= 2:
        sec_sorted = sorted(sec_events, key=lambda e: e["timestamp"])
        span_minutes = (sec_sorted[-1]["timestamp"] - sec_sorted[0]["timestamp"]).total_seconds() / 60.0
        # tighter clustering = more suspicious -> invert & normalize (0 = spread out, 1 = very tight)
        time_between = max(0.0, 1.0 - min(span_minutes / 180.0, 1.0))
    else:
        time_between = 0.0

    features = {
        "recent_device_change": has("DEVICE_CHANGE"),
        "recent_new_device": has("NEW_DEVICE_REGISTERED"),
        "recent_password_reset": has("PASSWORD_RESET"),
        "recent_password_change": has("PASSWORD_CHANGE"),
        "recent_sim_change": has("SIM_CHANGE"),
        "recent_email_change": has("EMAIL_CHANGE"),
        "recent_beneficiary_added": has("BENEFICIARY_ADDED"),
        "recent_beneficiary_modified": has("BENEFICIARY_MODIFIED"),
        "failed_login_count": min(failed_logins / 3.0, 2.0),
        "new_location": new_location,
        "unusual_login_time": unusual_time,
        "transaction_velocity": velocity,
        "large_incoming_transfer": large_incoming,
        "large_outgoing_transfer": large_outgoing,
        "rapid_transactions": 1.0 if rapid_tx else 0.0,
        "unusual_transaction_amount": unusual_amount,
        "multiple_security_changes": multiple_sec_changes,
        "time_between_security_events": time_between,
        "profile_change": has("PROFILE_CHANGE"),
        "total_recent_events": min(len(recent) / 10.0, 2.0),
    }
    return features


def feature_vector(features: dict) -> list:
    """Order a feature dict into the canonical vector used by the model."""
    return [float(features.get(name, 0.0)) for name in FEATURE_NAMES]
