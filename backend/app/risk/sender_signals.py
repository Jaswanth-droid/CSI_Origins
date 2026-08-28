"""
Sender-side transfer-pattern anomaly detection.

Complementary to the recipient-focused risk engine (app/risk/engine.py),
which asks "does the RECIPIENT's account look compromised?". These checks
instead ask "does the SENDER's own transfer behavior look unusual right
now?" -- two independent fraud signals that both feed into the final
transfer decision (see app/routers/transfers.py).

Deliberately simple, transparent rule-based heuristics (not the ML model) --
each compares a new transfer against the sender's OWN recent history,
computed directly from the `transactions` table, so they need no training
data and stay easy to explain in the UI (mirrors the philosophy in
app/risk/explain.py: prefer a transparent, explainable rule over a
black-box score wherever one will do).
"""
from datetime import datetime, timedelta
from statistics import mean

from sqlalchemy.orm import Session

from app import models
from app.config import (
    TRANSFER_VELOCITY_WINDOW_MINUTES, TRANSFER_VELOCITY_MIN_BURST_COUNT,
    TRANSFER_VELOCITY_BASELINE_DAYS, TRANSFER_VELOCITY_RATIO_THRESHOLD,
    TRANSFER_AMOUNT_HISTORY_DAYS, TRANSFER_AMOUNT_MIN_HISTORY_COUNT,
    TRANSFER_AMOUNT_SPIKE_RATIO, LARGE_TRANSFER_AMOUNT,
)


def check_transfer_velocity(db: Session, sender_account_id: str, recipient_account_id: str, now: datetime = None) -> dict:
    """Flags a burst of transfers from this sender to this SAME recipient
    within a short window, scaled against how often this sender normally
    pays this recipient.

    Example: a sender who normally pays a recipient once a day suddenly
    sends them 5 transfers in 3 minutes.
    """
    now = now or datetime.utcnow()
    window_start = now - timedelta(minutes=TRANSFER_VELOCITY_WINDOW_MINUTES)
    baseline_start = now - timedelta(days=TRANSFER_VELOCITY_BASELINE_DAYS)

    pair_txns = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.sender_account_id == sender_account_id,
            models.Transaction.recipient_account_id == recipient_account_id,
            models.Transaction.created_at >= baseline_start,
            models.Transaction.created_at <= now,
        )
        .all()
    )

    recent_count = sum(1 for t in pair_txns if t.created_at >= window_start)
    # +1 for the transfer currently being evaluated -- it hasn't been
    # written to the DB yet at the moment this check runs (check-risk time).
    count_including_current = recent_count + 1

    historical_count = sum(1 for t in pair_txns if t.created_at < window_start)
    baseline_days = max(
        TRANSFER_VELOCITY_BASELINE_DAYS - (TRANSFER_VELOCITY_WINDOW_MINUTES / (60 * 24)), 1
    )
    historical_daily_avg = historical_count / baseline_days
    expected_in_window = historical_daily_avg * (TRANSFER_VELOCITY_WINDOW_MINUTES / (60 * 24))

    threshold = max(TRANSFER_VELOCITY_MIN_BURST_COUNT, expected_in_window * TRANSFER_VELOCITY_RATIO_THRESHOLD)
    triggered = count_including_current >= TRANSFER_VELOCITY_MIN_BURST_COUNT and count_including_current >= threshold

    return {
        "type": "VELOCITY",
        "triggered": triggered,
        "message": (
            f"{count_including_current} transfers to this recipient within {TRANSFER_VELOCITY_WINDOW_MINUTES} minutes "
            f"-- well above your usual pace to this recipient (~{historical_daily_avg:.1f}/day)."
        ) if triggered else "",
        "details": {
            "window_minutes": TRANSFER_VELOCITY_WINDOW_MINUTES,
            "count_in_window": count_including_current,
            "historical_daily_avg": round(historical_daily_avg, 2),
        },
    }


def check_amount_spike(db: Session, sender_account_id: str, amount: float, now: datetime = None) -> dict:
    """Flags a transfer whose amount is far above this sender's own recent
    historical average transfer amount.

    Example: a sender who normally sends Rs.2,000-5,000 suddenly sends
    Rs.50,000.
    """
    now = now or datetime.utcnow()
    since = now - timedelta(days=TRANSFER_AMOUNT_HISTORY_DAYS)

    history = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.sender_account_id == sender_account_id,
            models.Transaction.status == "COMPLETED",
            models.Transaction.created_at >= since,
            models.Transaction.created_at < now,
        )
        .all()
    )
    amounts = [t.amount for t in history]

    if len(amounts) >= TRANSFER_AMOUNT_MIN_HISTORY_COUNT:
        historical_avg = mean(amounts)
        threshold = historical_avg * TRANSFER_AMOUNT_SPIKE_RATIO
        triggered = amount >= threshold and amount > historical_avg
        basis = f"~{TRANSFER_AMOUNT_SPIKE_RATIO}x your average transfer of Rs.{historical_avg:,.0f} (last {TRANSFER_AMOUNT_HISTORY_DAYS} days)"
    else:
        # Not enough history yet to trust a personal baseline -- fall back
        # to the same absolute large-transfer heuristic used for recipients.
        historical_avg = mean(amounts) if amounts else 0.0
        triggered = amount >= LARGE_TRANSFER_AMOUNT
        basis = f"a large transfer (Rs.{LARGE_TRANSFER_AMOUNT:,.0f}+) with too little transfer history yet to compare against your own average"

    return {
        "type": "AMOUNT_SPIKE",
        "triggered": triggered,
        "message": f"This transfer of Rs.{amount:,.0f} is {basis}." if triggered else "",
        "details": {
            "amount": amount,
            "historical_avg": round(historical_avg, 2),
            "sample_size": len(amounts),
        },
    }


def check_balance_depletion(sender_balance: float, amount: float) -> dict:
    """Flags a single transaction that depletes greater than 45% of the sender's available balance.
    
    When a single transfer exceeds 45% of current available balance, it represents extreme
    capital drain and elevated risk of account takeover or coercion.
    """
    if sender_balance is None or sender_balance <= 0:
        ratio = 1.0
    else:
        ratio = amount / sender_balance

    triggered = ratio > 0.45
    return {
        "type": "BALANCE_DEPLETION",
        "triggered": triggered,
        "ratio": round(ratio, 4),
        "message": (
            f"High Balance Depletion Alert: This transfer of Rs.{amount:,.0f} drains {ratio * 100:.1f}% "
            f"of your available balance (Rs.{sender_balance:,.0f}), exceeding the 45% safe threshold."
        ) if triggered else "",
        "details": {
            "amount": amount,
            "sender_balance": sender_balance,
            "depletion_percent": round(ratio * 100, 1),
            "threshold_percent": 45.0,
        },
    }


def evaluate(db: Session, sender_account_id: str, recipient_account_id: str, amount: float, sender_balance: float = None, now: datetime = None) -> list:
    """Run all sender-behavior checks and return only the ones that triggered."""
    now = now or datetime.utcnow()
    checks = [
        check_transfer_velocity(db, sender_account_id, recipient_account_id, now),
        check_amount_spike(db, sender_account_id, amount, now),
    ]
    if sender_balance is not None:
        checks.append(check_balance_depletion(sender_balance, amount))
    return [c for c in checks if c["triggered"]]
