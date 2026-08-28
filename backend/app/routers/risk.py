from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.risk import engine as risk_engine
from app.events import event_label

router = APIRouter(prefix="/api/risk", tags=["risk"])


def _get_account(db: Session, account_id: str) -> models.Account:
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}", response_model=schemas.RiskAssessmentOut)
def get_current_risk(account_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Standalone risk lookup for an account (used by the Risk Analysis
    screen and admin drill-downs), independent of any specific transfer."""
    account = _get_account(db, account_id)
    events = [e.to_dict() for e in account.events]
    result = risk_engine.assess(events, reference_time=None)
    return schemas.RiskAssessmentOut(**result, recipient=account)


@router.get("/{account_id}/timeline", response_model=list)
def get_risk_timeline(account_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """Chronological behavioral timeline with suspicious events flagged --
    powers the frontend's 'behavioral timeline' component."""
    account = _get_account(db, account_id)
    events = sorted(account.events, key=lambda e: e.timestamp)
    return [
        {
            "event_type": e.event_type,
            "label": event_label(e.event_type),
            "timestamp": e.timestamp.isoformat(),
            "device_id": e.device_id,
            "ip_address": e.ip_address,
            "location": e.location,
            "amount": e.amount,
            "metadata": e.event_metadata or {},
            "risk_signal": bool(e.risk_signal),
        }
        for e in events
    ]
