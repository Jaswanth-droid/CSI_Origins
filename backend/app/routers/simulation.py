"""
One-click attack simulation endpoints (hackathon brief sections 10 & 11 --
the primary hackathon demonstration).

Each endpoint resets the canonical demo recipient account for that
archetype to a FRESH, freshly-timestamped event sequence (built from the
exact same functions used to seed the initial demo data and to generate
the ML training set -- see app/risk/scenarios.py) and returns the
resulting risk assessment plus a step-by-step breakdown the frontend can
animate through.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.risk import engine as risk_engine
from app.risk.scenarios import build_normal_sequence, build_medium_sequence, build_compromised_sequence
from app.events import event_label

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

SCENARIO_BUILDERS = {
    "normal": lambda now, seed: build_normal_sequence(now, seed=seed),
    "medium": lambda now, seed: build_medium_sequence(now, seed=seed, demo_mode=True),
    "compromised": lambda now, seed: build_compromised_sequence(now, seed=seed, demo_mode=True),
}

SCENARIO_STEP_LABELS = {
    "normal": ["Recipient logs in from their usual device", "Recipient makes an ordinary transaction"],
    "medium": [
        "Recipient has normal behavior",
        "A failed login attempt occurs from an unrecognized device",
        "A successful login follows from a new IP / location",
        "A large outgoing transfer is made from the new device",
    ],
    "compromised": [
        "Recipient has normal behavior (Day 1)",
        "Attacker logs in from a new device",
        "New device is registered on the account",
        "Password reset occurs",
        "SIM change occurs",
        "New beneficiary is added",
        "A large incoming transaction is received",
        "Rapid outgoing transfer(s) follow immediately",
    ],
}


def _get_or_create_demo_account(db: Session, archetype: str) -> models.Account:
    account = db.query(models.Account).filter(models.Account.archetype == archetype, models.Account.is_demo_recipient == True).first()  # noqa: E712
    if account is None:
        raise HTTPException(status_code=404, detail=f"No demo account found for archetype '{archetype}'. Run the seed script first.")
    return account


def _run_scenario(db: Session, archetype: str, account_id: Optional[str] = None) -> schemas.SimulationResultOut:
    if account_id:
        # Target a SPECIFIC account (e.g. a recipient the sender has already
        # completed a transfer to) rather than the fixed canonical demo
        # account -- this is what lets "compromised after a completed
        # transfer" actually be demonstrated end-to-end via /api/alerts,
        # instead of only ever being reachable on the one demo account that
        # is already HIGH risk from the moment the DB is seeded (and so can
        # never have a COMPLETED transfer to begin with).
        account = db.query(models.Account).filter(models.Account.id == account_id).first()
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
    else:
        account = _get_or_create_demo_account(db, archetype)

    # wipe existing events and generate a fresh, now-anchored sequence
    db.query(models.AccountEvent).filter(models.AccountEvent.account_id == account.id).delete()
    db.flush()

    now = datetime.utcnow()
    seed_map = {"normal": 101, "medium": 303, "compromised": 202}
    events = SCENARIO_BUILDERS[archetype](now, seed_map[archetype])

    for e in events:
        db.add(models.AccountEvent(
            account_id=account.id,
            event_type=e["event_type"],
            timestamp=e["timestamp"],
            device_id=e.get("device_id"),
            ip_address=e.get("ip_address"),
            location=e.get("location"),
            amount=e.get("amount"),
            event_metadata=e.get("metadata") or {},
            risk_signal=bool(e.get("risk_signal")),
        ))
    db.flush()

    result = risk_engine.assess(events, reference_time=None)
    ra = models.RiskAssessment(
        account_id=account.id,
        risk_score=result["risk_score"],
        risk_level=result["risk_level"],
        decision=result["decision"],
        confidence=result["confidence"],
        top_reason=result["top_reason"],
        reasons=result["reasons"],
        feature_contributions=result["feature_contributions"],
        features=result["features"],
    )
    db.add(ra)
    db.commit()
    db.refresh(account)

    steps = [
        schemas.SimulationStepOut(step=i + 1, label=label)
        for i, label in enumerate(SCENARIO_STEP_LABELS[archetype])
    ]

    return schemas.SimulationResultOut(
        scenario=archetype,
        account=account,
        steps=steps,
        risk_assessment=schemas.RiskAssessmentOut(**result, recipient=account),
    )


@router.post("/normal", response_model=schemas.SimulationResultOut)
def simulate_normal(payload: Optional[schemas.SimulationRequest] = None, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return _run_scenario(db, "normal", account_id=payload.account_id if payload else None)


@router.post("/medium-risk", response_model=schemas.SimulationResultOut)
def simulate_medium(payload: Optional[schemas.SimulationRequest] = None, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return _run_scenario(db, "medium", account_id=payload.account_id if payload else None)


@router.post("/compromised", response_model=schemas.SimulationResultOut)
def simulate_compromised(payload: Optional[schemas.SimulationRequest] = None, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return _run_scenario(db, "compromised", account_id=payload.account_id if payload else None)
