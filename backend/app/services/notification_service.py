"""
Success-only sender SMS notification service.

This is intentionally SEPARATE from app/notifications.py, which handles
the generic per-status email (and a currently-disabled generic SMS leg,
see SEND_SMS_ON_TRANSACTIONS) fired for every transaction outcome
(COMPLETED / HELD / CANCELLED / PENDING_VERIFICATION / REFUNDED).

This module has exactly one job: send the sender a "your transfer was
successful" SMS, and it is invoked from exactly one call site --
app/routers/transfers.py, immediately after a transaction has been
durably marked status == "COMPLETED" and committed.

Security: this function is never handed a phone number from a request
payload. Callers must pass `user`, the already-authenticated
`models.User` loaded server-side (via app.security.get_current_user's
JWT verification). The number used is always `user.phone_number` as
currently stored in SQLite -- the frontend cannot influence it.

The actual provider call (Twilio) and the Notification audit-log row are
delegated to app.notifications.send_sms(), which already implements:
  - a real Twilio REST call when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
    TWILIO_FROM_NUMBER are configured (app/config.py),
  - a SIMULATED fallback (logged + recorded, not actually delivered)
    when Twilio isn't configured,
  - a Notification row (SENT / SIMULATED / FAILED) for every attempt,
  - and it NEVER raises -- a notification failure must never block or
    roll back a completed financial transaction.
This keeps a single Twilio integration point in the codebase rather than
duplicating the HTTP call here.
"""
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.notifications import send_sms

logger = logging.getLogger("recipient_shield.services.notification_service")


def send_transaction_success_sms(
    db: Session,
    user: models.User,
    amount: float,
    recipient_name: str,
    transaction_id: str,
) -> Optional[models.Notification]:
    """
    Sends: "Recipient Shield: Your transfer of Rs.{amount} to {recipient}
    was successful. Ref: {transaction_id}." to `user.phone_number`.

    Args:
        db: request-scoped SQLAlchemy session.
        user: the AUTHENTICATED sender (models.User loaded from the DB via
            the JWT-verified session -- never construct this from
            frontend-supplied data).
        amount: the actual transaction amount (from the transaction
            record, not re-parsed from client input).
        recipient_name: the recipient's name (from the recipient account
            record).
        transaction_id: the completed transaction's id, included as a
            reference number in the SMS.

    Returns:
        The created Notification row (status SENT / SIMULATED / FAILED),
        or None if the user has no phone number on file -- that's a valid
        state (e.g. contact setup was skipped), not an error.
    """
    if not user.phone_number:
        logger.info(
            "No phone number on file for user %s -- skipping success SMS for txn %s",
            user.id, transaction_id,
        )
        return None

    message = (
        f"Recipient Shield: Your transfer of ₹{amount:,.0f} to {recipient_name} "
        f"was successful. Ref: {transaction_id}."
    )
    return send_sms(db, user, message, transaction_id=transaction_id)
