"""
Log of transaction notifications sent to the current user -- email via
SMTP, real when configured, simulated otherwise (see app/notifications.py)
-- plus a /test endpoint to fire one on demand so delivery/configuration
problems are visible immediately in the product instead of requiring a
full transfer + a dig through server logs.

SMS (Twilio) support still exists in app/notifications.py but is not
invoked here or per-transaction -- email-only, by request.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.notifications import send_email

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _out(n: models.Notification) -> schemas.NotificationOut:
    return schemas.NotificationOut(
        id=n.id,
        transaction_id=n.transaction_id,
        channel=n.channel,
        recipient_contact=n.recipient_contact,
        subject=n.subject,
        message=n.message,
        status=n.status,
        error=n.error,
        created_at=n.created_at.isoformat(),
    )


@router.get("", response_model=list[schemas.NotificationOut])
def list_notifications(
    transaction_id: str = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Notification).filter(models.Notification.user_id == current_user.id)
    if transaction_id:
        q = q.filter(models.Notification.transaction_id == transaction_id)
    rows = q.order_by(models.Notification.created_at.desc()).limit(min(limit, 100)).all()
    return [_out(r) for r in rows]


@router.post("/test", response_model=schemas.NotificationTestResult)
def send_test_notification(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Sends one test email to the current user's saved address and reports
    exactly what happened (SENT / SIMULATED / FAILED, with the underlying
    error if it failed) -- use this to check SMTP configuration without
    needing to run a full transfer."""
    if not current_user.email:
        raise HTTPException(status_code=400, detail="Add an email address to your profile first")

    email = send_email(
        db, current_user,
        "Recipient Shield -- test notification",
        "This is a test email from Recipient Shield.\n\n"
        "If you received this in your inbox, real email delivery is configured correctly.",
    )
    db.commit()

    return schemas.NotificationTestResult(email=_out(email) if email else None)
