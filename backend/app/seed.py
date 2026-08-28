"""
Seed script for realistic demo data (hackathon brief sections 3 & 13).

Creates:
  - 1 sender user (a logged-in bank customer) with their own account
  - 3 demo recipient accounts, one per archetype from the brief:
      ACCOUNT 1 -- NORMAL RECIPIENT      (Rahul Verma)
      ACCOUNT 2 -- COMPROMISED RECIPIENT (Amit Singh)
      ACCOUNT 3 -- MEDIUM RISK RECIPIENT (Sneha Iyer)
  - the sender's trusted-recipient relationships to all three
  - each recipient account's chronological event history, built from the
    SAME scenario functions used by the ML training data generator and the
    live simulation endpoints (app/risk/scenarios.py) -- so what you see
    seeded here is provably the same "shape" of data the model was trained
    on and the same data the "Run Simulation" buttons produce.

Event timestamps are anchored to the moment this script runs, but the risk
engine evaluates recency relative to EACH ACCOUNT'S OWN latest event (not
wall-clock "now") -- see app/risk/engine.assess()'s reference_time default
in app/risk/features.py -- so the seeded demo stays correctly classified
(LOW / MEDIUM / HIGH) no matter how long after seeding you actually run the
live demo.

Run:  python -m app.seed
"""
from datetime import datetime

from app.database import SessionLocal, init_db, engine, Base
from app import models
from app.security import hash_password
from app.risk.scenarios import build_normal_sequence, build_medium_sequence, build_compromised_sequence

DEMO_PASSWORD = "demo1234"


def _create_events(db, account_id, event_dicts):
    for e in event_dicts:
        db.add(models.AccountEvent(
            account_id=account_id,
            event_type=e["event_type"],
            timestamp=e["timestamp"],
            device_id=e.get("device_id"),
            ip_address=e.get("ip_address"),
            location=e.get("location"),
            amount=e.get("amount"),
            event_metadata=e.get("metadata") or {},
            risk_signal=bool(e.get("risk_signal")),
        ))


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed(reset: bool = True):
    if reset:
        reset_database()
    else:
        init_db()

    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0 and not reset:
            print("Database already seeded -- skipping (pass reset=True to force).")
            return

        now = datetime.utcnow()

        # ---- Sender (the logged-in demo user) ----------------------------
        sender_user = models.User(
            username="priya.sharma",
            password_hash=hash_password(DEMO_PASSWORD),
            full_name="Priya Sharma",
            email="priya.sharma@example-bank.demo",
            role="sender",
        )
        db.add(sender_user)
        db.flush()

        sender_account = models.Account(
            user_id=sender_user.id,
            account_number="UNB-SEND-100234",
            holder_name="Priya Sharma",
            account_type="savings",
            balance=250_000.0,
        )
        db.add(sender_account)
        db.flush()

        # a bit of the sender's OWN ordinary activity (not risk-scored --
        # Recipient Shield only ever evaluates the RECIPIENT, per the
        # brief's core innovation -- but it makes the dashboard feel real)
        _create_events(db, sender_account.id, build_normal_sequence(now, seed=1))

        # ---- ACCOUNT 1: Normal recipient ---------------------------------
        acc_normal = models.Account(
            account_number="UNB-RCPT-200101",
            holder_name="Rahul Verma",
            account_type="savings",
            balance=84_500.0,
            is_demo_recipient=True,
            archetype="normal",
        )
        db.add(acc_normal)
        db.flush()
        _create_events(db, acc_normal.id, build_normal_sequence(now, seed=101))

        # ---- ACCOUNT 2: Compromised recipient ----------------------------
        acc_compromised = models.Account(
            account_number="UNB-RCPT-200202",
            holder_name="Amit Singh",
            account_type="savings",
            balance=12_300.0,
            is_demo_recipient=True,
            archetype="compromised",
        )
        db.add(acc_compromised)
        db.flush()
        _create_events(db, acc_compromised.id, build_compromised_sequence(now, seed=202, demo_mode=True))

        # ---- ACCOUNT 3: Medium-risk recipient ----------------------------
        acc_medium = models.Account(
            account_number="UNB-RCPT-200303",
            holder_name="Sneha Iyer",
            account_type="savings",
            balance=41_750.0,
            is_demo_recipient=True,
            archetype="medium",
        )
        db.add(acc_medium)
        db.flush()
        _create_events(db, acc_medium.id, build_medium_sequence(now, seed=303, demo_mode=True))

        db.flush()

        # ---- Trusted recipient relationships for the sender --------------
        for account, nickname in (
            (acc_normal, "Rahul (Roommate)"),
            (acc_compromised, "Amit (College friend)"),
            (acc_medium, "Sneha (Sister)"),
        ):
            db.add(models.Recipient(
                owner_user_id=sender_user.id,
                account_id=account.id,
                nickname=nickname,
                trusted=True,
            ))

        db.commit()

        print("Seed complete.")
        print(f"  Sender login: username='priya.sharma' password='{DEMO_PASSWORD}'")
        print(f"  Sender account: {sender_account.account_number} (balance Rs.{sender_account.balance:,.2f})")
        print(f"  Recipient 1 (normal):      {acc_normal.holder_name} / {acc_normal.account_number}")
        print(f"  Recipient 2 (compromised): {acc_compromised.holder_name} / {acc_compromised.account_number}")
        print(f"  Recipient 3 (medium):      {acc_medium.holder_name} / {acc_medium.account_number}")
    finally:
        db.close()


if __name__ == "__main__":
    seed(reset=True)
