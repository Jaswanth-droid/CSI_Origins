"""
Single source of truth for what a "normal", "medium-risk" and "compromised"
recipient account activity sequence looks like.

This module is intentionally framework-free (no DB, no FastAPI) so it can be
reused in three places without drift:

  1. app/seed.py              -- seeds the 3 demo accounts for the UI
  2. app/ml/generate_data.py  -- generates thousands of synthetic training
                                  sequences for the ML model
  3. app/routers/simulation.py -- powers the live "Run Account Takeover
                                  Simulation" one-click demo endpoints

Every event is a plain dict: this keeps the risk-scoring core (features.py,
engine.py) completely independent of SQLAlchemy, so it can be unit tested
without a database or a running server.
"""
import random
from datetime import datetime, timedelta

DEVICE_POOL = ["DEV-A1F9", "DEV-B22C", "DEV-C77E", "DEV-D019", "DEV-E552"]
LOCATION_POOL = ["Chennai, IN", "Bengaluru, IN", "Mumbai, IN", "Coimbatore, IN", "Hyderabad, IN"]
FOREIGN_LOCATION_POOL = ["Lagos, NG", "Bucharest, RO", "Hanoi, VN", "Manila, PH", "Karachi, PK"]
IP_POOL = ["49.204.{}.{}", "103.21.{}.{}", "117.198.{}.{}"]


def _rand_ip(rng: random.Random, pool=IP_POOL):
    tmpl = rng.choice(pool)
    return tmpl.format(rng.randint(1, 254), rng.randint(1, 254))


def _mk_event(event_type, ts, device_id=None, ip=None, location=None, amount=None, metadata=None, risk_signal=False):
    return {
        "event_type": event_type,
        "timestamp": ts,
        "device_id": device_id,
        "ip_address": ip,
        "location": location,
        "amount": amount,
        "metadata": metadata or {},
        "risk_signal": bool(risk_signal),
    }


def build_normal_sequence(now: datetime, seed: int = None, home_device=None, home_location=None):
    """A well-behaved recipient: routine logins from the same device/location,
    occasional ordinary transactions. No security-sensitive events."""
    rng = random.Random(seed)
    home_device = home_device or rng.choice(DEVICE_POOL)
    home_location = home_location or rng.choice(LOCATION_POOL)
    ip = _rand_ip(rng)
    # a normal user has a fairly consistent "awake" login hour, mostly daytime/evening
    home_hour = rng.randint(7, 22)

    events = []
    days_back = rng.randint(5, 10)
    for d in range(days_back, 0, -1):
        day_anchor = (now - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        jitter_hour = max(0, min(23, home_hour + rng.randint(-2, 2)))
        ts = day_anchor + timedelta(hours=jitter_hour, minutes=rng.randint(0, 59))
        if ts > now:
            ts = now - timedelta(hours=rng.randint(1, 4))
        events.append(_mk_event("LOGIN_SUCCESS", ts, home_device, ip, home_location))
        if rng.random() < 0.35:
            amt = round(rng.uniform(500, 15000), 2)
            events.append(_mk_event(
                rng.choice(["LARGE_INCOMING_TRANSFER", "PROFILE_CHANGE"]) if amt > 12000 else "LOGIN_SUCCESS",
                ts + timedelta(minutes=rng.randint(2, 40)), home_device, ip, home_location, amount=amt,
            ))
    # a couple of very recent, still-normal logins (same home-hour habit)
    for d in (2, 1):
        day_anchor = (now - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        jitter_hour = max(0, min(23, home_hour + rng.randint(-2, 2)))
        ts = day_anchor + timedelta(hours=jitter_hour, minutes=rng.randint(0, 59))
        if ts > now:
            ts = now - timedelta(hours=rng.randint(1, 6))
        events.append(_mk_event("LOGIN_SUCCESS", ts, home_device, ip, home_location))
    events.sort(key=lambda e: e["timestamp"])
    return events


def build_medium_sequence(now: datetime, seed: int = None, demo_mode: bool = False):
    """Some unusual behaviour but not enough to confidently call it a
    takeover: e.g. one new device + a failed login + a slightly large
    transaction, but crucially NO password reset / SIM change combo.

    `demo_mode=True` fixes out the low-probability DEVICE_CHANGE addition so
    the canonical seeded/demo "Account 3" always lands cleanly in the MEDIUM
    band (the randomized version is used for ML training variety, where we
    WANT some medium samples to occasionally brush up against HIGH)."""
    rng = random.Random(seed)
    home_device = rng.choice(DEVICE_POOL)
    home_location = rng.choice(LOCATION_POOL)
    ip = _rand_ip(rng)
    events = build_normal_sequence(now - timedelta(days=2), seed=seed, home_device=home_device, home_location=home_location)

    new_device = rng.choice([d for d in DEVICE_POOL if d != home_device])
    new_ip = _rand_ip(rng)

    t0 = now - timedelta(hours=rng.randint(20, 40))
    events.append(_mk_event("LOGIN_FAILED", t0, new_device, new_ip, home_location, risk_signal=True))
    events.append(_mk_event("LOGIN_SUCCESS", t0 + timedelta(minutes=6), new_device, new_ip, home_location, risk_signal=True))
    if (not demo_mode) and rng.random() < 0.4:
        events.append(_mk_event("DEVICE_CHANGE", t0 + timedelta(minutes=6), new_device, new_ip, home_location, risk_signal=True))
    events.append(_mk_event("NEW_IP_LOCATION", t0 + timedelta(minutes=6), new_device, new_ip, home_location, risk_signal=True))

    if rng.random() < 0.6:
        t1 = t0 + timedelta(hours=rng.randint(2, 10))
        events.append(_mk_event("UNUSUAL_LOGIN_TIME", t1, new_device, new_ip, home_location, risk_signal=True))

    t2 = now - timedelta(hours=rng.randint(2, 10))
    amt = round(rng.uniform(30000, 60000), 2)
    events.append(_mk_event("LARGE_OUTGOING_TRANSFER", t2, new_device, new_ip, home_location, amount=amt, risk_signal=True))

    events.sort(key=lambda e: e["timestamp"])
    return events


def build_compromised_sequence(now: datetime, seed: int = None, demo_mode: bool = False):
    """The canonical takeover pattern from the hackathon brief section 3:

    Day 1: normal login
    Day 2: new device -> password reset -> SIM change -> new beneficiary
           -> large incoming transaction -> rapid outgoing transfer

    `demo_mode=True` forces the full, fast 6-step chain every time (no
    "slow attacker" / "interrupted attack" degradation) so the canonical
    seeded/demo "Account 2" and the one-click simulation always reliably
    trigger HIGH risk. The randomized degradation is intentionally used for
    ML training data (see app/ml/generate_data.py) to teach the model
    partial/slower attack patterns too, and to keep the evaluation metrics
    honest instead of trivially perfect.
    """
    rng = random.Random(seed)
    home_device = rng.choice(DEVICE_POOL)
    home_location = rng.choice(LOCATION_POOL)
    ip = _rand_ip(rng)

    events = []
    # Day 1: normal login
    day1 = now - timedelta(days=1, hours=rng.randint(2, 8))
    events.append(_mk_event("LOGIN_SUCCESS", day1, home_device, ip, home_location))

    # Day 2: attack sequence. Most attacks move fast (tight clustering is the
    # hallmark signal) but ~25% of the time we simulate a slower, more
    # cautious attacker who spaces steps out over hours -- these are the
    # genuinely harder-to-catch cases that keep the evaluation honest instead
    # of trivially perfect.
    attacker_device = rng.choice([d for d in DEVICE_POOL if d != home_device])
    attacker_ip = _rand_ip(rng)
    attacker_location = rng.choice(FOREIGN_LOCATION_POOL)
    slow_attacker = (not demo_mode) and rng.random() < 0.25
    step = lambda lo, hi: timedelta(minutes=rng.randint(lo, hi) * (6 if slow_attacker else 1))

    # ~15% of attacks are caught/interrupted partway through -- the account
    # IS compromised (label=1) but fewer signals have fired yet, which is
    # what makes recall meaningfully less than a trivial 100%.
    n_steps = 6 if demo_mode or rng.random() > 0.15 else rng.randint(3, 5)

    t = now - timedelta(minutes=rng.randint(45, 90))
    steps = []
    steps.append(("DEVICE_CHANGE", None, {}))
    steps.append(("NEW_DEVICE_REGISTERED", None, {}))
    steps.append(("PASSWORD_RESET", None, {}))
    steps.append(("SIM_CHANGE", None, {}))
    steps.append(("BENEFICIARY_ADDED", None, {"beneficiary_name": "Unknown Payee " + str(rng.randint(1000, 9999))}))
    incoming_amt = round(rng.uniform(80000, 250000), 2)
    steps.append(("LARGE_INCOMING_TRANSFER", incoming_amt, {}))

    events.append(_mk_event("LOGIN_SUCCESS", t, attacker_device, attacker_ip, attacker_location, risk_signal=True))
    for event_type, amt, meta in steps[:n_steps]:
        t += step(2, 9)
        events.append(_mk_event(event_type, t, attacker_device, attacker_ip, attacker_location, amount=amt, metadata=meta, risk_signal=True))

    if n_steps >= 6:
        t += step(1, 5)
        out_amt1 = round(incoming_amt * rng.uniform(0.3, 0.5), 2)
        events.append(_mk_event("LARGE_OUTGOING_TRANSFER", t, attacker_device, attacker_ip, attacker_location, amount=out_amt1, risk_signal=True))
        t += step(1, 4)
        out_amt2 = round(incoming_amt * rng.uniform(0.2, 0.4), 2)
        events.append(_mk_event("RAPID_TRANSACTIONS", t, attacker_device, attacker_ip, attacker_location, amount=out_amt2, risk_signal=True))

    events.sort(key=lambda e: e["timestamp"])
    return events


def build_innocent_security_change_sequence(now: datetime, seed: int = None):
    """A genuinely normal account holder who did ONE legitimate
    security-sensitive thing recently (e.g. changed their password, or
    registered a new phone they just bought) with no other suspicious
    activity around it. Label is still 0 (not compromised) -- this is the
    training signal that teaches the model a single benign security event
    should NOT, by itself, trigger a high-risk score. Used to keep the
    false-positive rate measurement honest."""
    rng = random.Random(seed)
    home_device = rng.choice(DEVICE_POOL)
    home_location = rng.choice(LOCATION_POOL)
    events = build_normal_sequence(now - timedelta(hours=rng.randint(6, 30)), seed=seed, home_device=home_device, home_location=home_location)

    ip = _rand_ip(rng)
    t = now - timedelta(hours=rng.randint(1, 20))
    lone_event = rng.choice(["PASSWORD_CHANGE", "NEW_DEVICE_REGISTERED", "PROFILE_CHANGE", "EMAIL_CHANGE"])
    events.append(_mk_event(lone_event, t, home_device, ip, home_location, risk_signal=False))

    # one ordinary transaction, nothing unusual about the amount
    if rng.random() < 0.5:
        t2 = now - timedelta(hours=rng.randint(1, 10))
        events.append(_mk_event("LOGIN_SUCCESS", t2, home_device, ip, home_location, amount=round(rng.uniform(500, 8000), 2)))

    events.sort(key=lambda e: e["timestamp"])
    return events


SCENARIOS = {
    "normal": build_normal_sequence,
    "medium": build_medium_sequence,
    "compromised": build_compromised_sequence,
    "innocent_security_change": build_innocent_security_change_sequence,
}
