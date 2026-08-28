from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.events import event_label

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def compute_cibil_score(db: Session, account: models.Account) -> int:
    # Starting base score is stable based on the account ID hash (so different accounts start at different base values)
    base_hash = abs(hash(account.id)) % 101  # 0 to 100
    base_score = 700 + base_hash # Base between 700 and 800
    
    # Query transactions associated with this account
    txns = db.query(models.Transaction).filter(
        (models.Transaction.sender_account_id == account.id) |
        (models.Transaction.recipient_account_id == account.id)
    ).all()
    
    modifiers = 0
    depletion_penalty = 0
    
    for t in txns:
        if t.status == "COMPLETED":
            if t.sender_account_id == account.id:
                # Check if this outgoing transaction drained > 45% of the account balance at transfer time
                pre_balance = (account.balance + t.amount) if (account.balance + t.amount) > 0 else t.amount
                ratio = t.amount / pre_balance if pre_balance > 0 else 0.0
                
                if ratio > 0.45:
                    # Heavy CIBIL penalty for aggressive capital depletion (>45%)
                    depletion_penalty += int(85 + (ratio - 0.45) * 120)
                else:
                    # Outgoing completed transfer increases credit activity score
                    modifiers += 8
            else:
                # Incoming completed transfer increases account health
                modifiers += 3
        elif t.status in ("HELD", "CANCELLED"):
            # Security incidents or failed checks decrease score
            modifiers -= 30
            
    # Balance modifier: +2 for every 10,000 INR in balance (capped at +40)
    balance_mod = min(40, int(account.balance // 10000) * 2)
    
    final_score = base_score + modifiers + balance_mod - depletion_penalty
    # Clamp between 300 and 900 (CIBIL limits)
    return max(300, min(900, final_score))


def _get_account_or_404(db: Session, account_id: str) -> models.Account:
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}", response_model=schemas.AccountOut)
def get_account(account_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    account = _get_account_or_404(db, account_id)
    account.cibil_score = compute_cibil_score(db, account)
    return account


@router.get("/{account_id}/activity", response_model=list)
def get_account_activity(account_id: str, limit: int = 100, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    account = _get_account_or_404(db, account_id)
    events = (
        db.query(models.AccountEvent)
        .filter(models.AccountEvent.account_id == account.id)
        .order_by(models.AccountEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
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


@router.get("/{account_id}/transactions", response_model=list)
def get_account_transactions(account_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    account = _get_account_or_404(db, account_id)
    txns = (
        db.query(models.Transaction)
        .filter(
            (models.Transaction.sender_account_id == account.id)
            | (models.Transaction.recipient_account_id == account.id)
        )
        .order_by(models.Transaction.created_at.desc())
        .all()
    )
    out = []
    for t in txns:
        ra = t.risk_assessment
        out.append({
            "id": t.id,
            "sender_account_id": t.sender_account_id,
            "recipient_account_id": t.recipient_account_id,
            "sender_name": t.sender_account.holder_name if t.sender_account else "Unknown",
            "recipient_name": t.recipient_account.holder_name if t.recipient_account else "Unknown",
            "amount": t.amount,
            "note": t.note,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "risk_level": ra.risk_level if ra else None,
            "risk_score": ra.risk_score if ra else None,
        })
    return out
