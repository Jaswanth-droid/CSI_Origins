"""
Post-transfer compromise monitoring & sender-authorized auto-refund.

Recipient Shield's core check happens BEFORE a transfer completes -- but an
account that was genuinely LOW/MEDIUM risk at that moment can still be
compromised by an attacker afterwards. This module re-assesses the
recipients of a sender's already-COMPLETED transfers on demand and surfaces
any that have since become HIGH risk, so the sender can be alerted and --
with their explicit permission -- have an automatic refund request sent to
the (simulated) bank.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.risk import engine as risk_engine

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


def _assess(account: models.Account) -> dict:
    events = [e.to_dict() for e in account.events]
    return risk_engine.assess(events, reference_time=None)


def _latest_refund_request(db: Session, transaction_id: str):
    return (
        db.query(models.RefundRequest)
        .filter(models.RefundRequest.transaction_id == transaction_id)
        .order_by(models.RefundRequest.created_at.desc())
        .first()
    )


def refund_to_out(r: models.RefundRequest):
    """Manual ORM -> schema conversion (rather than relying on
    from_attributes) so datetime fields get explicitly ISO-formatted,
    matching the pattern used for TransactionOut elsewhere in the API."""
    if r is None:
        return None
    return schemas.RefundRequestOut(
        id=r.id,
        transaction_id=r.transaction_id,
        reason=r.reason,
        refunded_amount=r.refunded_amount,
        status=r.status,
        created_at=r.created_at.isoformat(),
        resolved_at=r.resolved_at.isoformat() if r.resolved_at else None,
    )


def find_post_transfer_alerts(db: Session, sender_account_id: str) -> list[schemas.PostTransferAlertOut]:
    """Every COMPLETED transfer from this sender whose recipient is now
    HIGH risk, regardless of what the risk looked like at transfer time."""
    txns = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.sender_account_id == sender_account_id,
            models.Transaction.status == "COMPLETED",
        )
        .order_by(models.Transaction.created_at.desc())
        .all()
    )

    alerts = []
    for txn in txns:
        recipient = txn.recipient_account
        if recipient is None:
            continue
        current = _assess(recipient)
        if current["risk_level"] != "HIGH":
            continue

        refund = _latest_refund_request(db, txn.id)
        original_level = txn.risk_assessment.risk_level if txn.risk_assessment else None

        alerts.append(schemas.PostTransferAlertOut(
            transaction=schemas.TransactionOut(
                id=txn.id, sender_account_id=txn.sender_account_id, recipient_account_id=txn.recipient_account_id,
                amount=txn.amount, note=txn.note, status=txn.status, created_at=txn.created_at.isoformat(),
                completed_at=txn.completed_at.isoformat() if txn.completed_at else None,
                risk_level=original_level, risk_score=txn.risk_assessment.risk_score if txn.risk_assessment else None,
            ),
            recipient=recipient,
            original_risk_level=original_level,
            current_risk=schemas.RiskAssessmentOut(**current, recipient=recipient),
            refund_request=refund_to_out(refund),
            message=(
                f"{recipient.holder_name}'s account showed no significant risk when you sent this transfer, "
                f"but now shows strong signs of compromise ({current['top_reason']})."
            ),
        ))
    return alerts


@router.get("", response_model=list[schemas.PostTransferAlertOut])
def list_alerts(account_id: str, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return find_post_transfer_alerts(db, account_id)
