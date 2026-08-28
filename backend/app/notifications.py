"""
Sender-facing transaction notifications: SMS + email.

- SMS is sent FOR REAL via Twilio's REST API if backend/.env (or the real
  process environment) provides TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
  TWILIO_FROM_NUMBER (see app/config.py and backend/.env.example). The
  Twilio call is made directly with the stdlib `urllib` rather than the
  `twilio` package, to avoid adding a dependency. If not configured, SMS
  falls back to a SIMULATED send: the message is still generated for real,
  logged, and stored as a Notification row.

- Email is sent FOR REAL over SMTP if SMTP_HOST / SMTP_USERNAME /
  SMTP_PASSWORD are configured the same way. Falls back to simulated
  otherwise.

Every notification attempt is recorded in the `notifications` table
regardless of outcome (SENT / SIMULATED / FAILED), with the error message
kept on FAILED rows so misconfiguration (wrong password, unverified Twilio
trial number, etc.) is visible in the product instead of only in server
logs. A failure here is always swallowed -- notifications must never block
or roll back an actual transfer.
"""
import base64
import json
import logging
import re
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from email.mime.text import MIMEText
from typing import Optional

from sqlalchemy.orm import Session

from app import config, models

logger = logging.getLogger("recipient_shield.notifications")


def _to_e164_in(number: str) -> str:
    """Normalize a stored phone number to E.164 ('+<countrycode><digits>',
    no spaces/dashes) before it's ever handed to Twilio.

    Twilio's API rejects a "To" number that isn't E.164 with a 400 error
    (this is what was happening: numbers were saved as a bare 10-digit
    Indian mobile number like "7010205970", with no "+91", because the
    profile-save validator in app/schemas.py deliberately accepts numbers
    without a country code -- it's a UX choice, not a bug -- so this
    normalization has to happen here instead, right before the Twilio call.

    Assumes India (+91) for a bare 10-digit number, matching this
    project's target market. A number that already starts with "+" is
    trusted as-is and only has its formatting characters (spaces/dashes)
    stripped.
    """
    cleaned = re.sub(r"[^\d+]", "", number or "")
    if cleaned.startswith("+"):
        return cleaned
    if len(cleaned) == 10:
        return f"+91{cleaned}"
    if len(cleaned) == 12 and cleaned.startswith("91"):
        return f"+{cleaned}"
    # Fallback: not a recognized shape -- pass through with a leading "+"
    # rather than silently guessing a country code that might be wrong.
    return f"+{cleaned}" if cleaned else cleaned

# Set to True to re-enable the SMS leg of notify_transaction() (the
# send_sms() function itself is untouched -- Twilio wiring still works, it's
# just not invoked automatically per-transaction while this is False).
SEND_SMS_ON_TRANSACTIONS = False

_STATUS_COPY = {
    "COMPLETED": "completed successfully",
    "HELD": "paused for security review -- our system detected possible recipient account compromise",
    "PENDING_VERIFICATION": "awaiting your additional verification",
    "CANCELLED": "cancelled",
    "REFUNDED": "refunded back to your account",
}


def _record(
    db: Session,
    user_id: str,
    channel: str,
    contact: str,
    subject: Optional[str],
    message: str,
    status: str,
    error: Optional[str] = None,
    transaction_id: Optional[str] = None,
) -> models.Notification:
    n = models.Notification(
        user_id=user_id,
        transaction_id=transaction_id,
        channel=channel,
        recipient_contact=contact,
        subject=subject,
        message=message,
        status=status,
        error=error,
    )
    db.add(n)
    db.flush()
    return n


def _send_twilio_sms(to_number: str, body: str) -> None:
    """Calls Twilio's REST API directly over HTTPS (stdlib urllib only, no
    `twilio` package dependency). Raises on any failure -- the caller turns
    that into a FAILED Notification row with the error message attached."""
    url = f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Messages.json"
    data = urllib.parse.urlencode({
        "To": to_number,
        "From": config.TWILIO_FROM_NUMBER,
        "Body": body,
    }).encode("utf-8")
    auth = base64.b64encode(f"{config.TWILIO_ACCOUNT_SID}:{config.TWILIO_AUTH_TOKEN}".encode("utf-8")).decode("ascii")

    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Basic {auth}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw).get("message", raw)
        except (json.JSONDecodeError, AttributeError):
            detail = raw
        raise RuntimeError(f"Twilio error {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Twilio: {exc.reason}") from exc


def send_sms(db: Session, user: models.User, message: str, transaction_id: str = None) -> Optional[models.Notification]:
    """Real SMS via Twilio when configured; simulated fallback otherwise."""
    if not user.phone_number:
        return None

    to_number = _to_e164_in(user.phone_number)

    if not config.SMS_DELIVERY_ENABLED:
        logger.info("[SIMULATED SMS -- Twilio not configured] to %s: %s", to_number, message)
        return _record(db, user.id, "SMS", to_number, None, message, "SIMULATED", transaction_id=transaction_id)

    try:
        _send_twilio_sms(to_number, message)
        logger.info("[SMS SENT] to %s", to_number)
        return _record(db, user.id, "SMS", to_number, None, message, "SENT", transaction_id=transaction_id)
    except Exception as exc:  # noqa: BLE001 -- a notification failure must never break a transfer
        logger.exception("Failed to send SMS to %s", to_number)
        return _record(db, user.id, "SMS", to_number, None, message, "FAILED", error=str(exc), transaction_id=transaction_id)


def send_email(db: Session, user: models.User, subject: str, body: str, transaction_id: str = None) -> Optional[models.Notification]:
    """Real SMTP email when configured; simulated fallback otherwise."""
    if not user.email:
        return None

    import os
    smtp_email = os.getenv("SMTP_EMAIL", "")
    smtp_password = os.getenv("SMTP_APP_PASSWORD", "")

    # If SMTP_EMAIL and SMTP_APP_PASSWORD are provided in .env, use them (Gmail SMTP SSL)
    if smtp_email and smtp_password:
        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = f"Recipient Shield <{smtp_email}>"
            msg["To"] = user.email

            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
                server.login(smtp_email, smtp_password)
                server.sendmail(smtp_email, [user.email], msg.as_string())

            logger.info("[EMAIL SENT] to %s: %s", user.email, subject)
            return _record(db, user.id, "EMAIL", user.email, subject, body, "SENT", transaction_id=transaction_id)
        except Exception as exc:
            logger.exception("Failed to send email to %s", user.email)
            return _record(db, user.id, "EMAIL", user.email, subject, body, "FAILED", error=str(exc), transaction_id=transaction_id)

    if not config.EMAIL_DELIVERY_ENABLED:
        logger.info("[SIMULATED EMAIL -- SMTP not configured] to %s: %s", user.email, subject)
        return _record(db, user.id, "EMAIL", user.email, subject, body, "SIMULATED", transaction_id=transaction_id)

    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = f"{config.SMTP_FROM_NAME} <{config.SMTP_FROM_EMAIL}>"
        msg["To"] = user.email

        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
            if config.SMTP_USE_TLS:
                server.starttls()
            server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            server.sendmail(config.SMTP_FROM_EMAIL, [user.email], msg.as_string())

        logger.info("[EMAIL SENT] to %s: %s", user.email, subject)
        return _record(db, user.id, "EMAIL", user.email, subject, body, "SENT", transaction_id=transaction_id)
    except Exception as exc:  # noqa: BLE001 -- a notification failure must never break a transfer
        logger.exception("Failed to send email to %s", user.email)
        return _record(db, user.id, "EMAIL", user.email, subject, body, "FAILED", error=str(exc), transaction_id=transaction_id)


def notify_transaction(db: Session, sender_account: models.Account, txn: models.Transaction, recipient_account: models.Account) -> None:
    """Best-effort: build the email (and, if re-enabled, SMS) content for
    this transaction's status and send it to the sender. Never raises."""
    try:
        user = sender_account.owner
        if user is None:
            return

        status_copy = _STATUS_COPY.get(txn.status, txn.status.replace("_", " ").lower())

        if SEND_SMS_ON_TRANSACTIONS:
            sms_text = (
                f"Recipient Shield: Your transfer of Rs.{txn.amount:,.0f} to {recipient_account.holder_name} "
                f"is {status_copy}. Ref: {txn.id}."
            )
            send_sms(db, user, sms_text, transaction_id=txn.id)

        subject = f"Recipient Shield -- Transfer {txn.status.replace('_', ' ').title()}"
        body_lines = [
            f"Hello {user.full_name},",
            "",
            f"Your transfer has {status_copy}.",
            "",
            f"Amount: Rs.{txn.amount:,.2f}",
            f"Recipient: {recipient_account.holder_name} ({recipient_account.account_number})",
            f"Status: {txn.status}",
            f"Reference: {txn.id}",
            f"Date: {txn.created_at.isoformat() if txn.created_at else ''}",
        ]
        if txn.note:
            body_lines.append(f"Note: {txn.note}")
        body_lines += [
            "",
            "This is an automated notification from your Recipient Shield prototype account. "
            "No real money has moved -- this is a simulated banking demo.",
        ]
        send_email(db, user, subject, "\n".join(body_lines), transaction_id=txn.id)

        # Notify the recipient if the transaction is completed and recipient has a valid user email
        if txn.status == "COMPLETED" and recipient_account.owner and recipient_account.owner.email:
            recip_user = recipient_account.owner
            recip_subject = "Recipient Shield -- Account Credited"
            recip_body_lines = [
                f"Hello {recip_user.full_name},",
                "",
                f"Your account has been credited.",
                "",
                f"Amount: Rs.{txn.amount:,.2f}",
                f"Sender: {sender_account.holder_name} ({sender_account.account_number})",
                f"Reference: {txn.id}",
                f"Date: {txn.created_at.isoformat() if txn.created_at else ''}",
            ]
            if txn.note:
                recip_body_lines.append(f"Note: {txn.note}")
            recip_body_lines += [
                "",
                "This is an automated notification from your Recipient Shield prototype account. "
                "No real money has moved -- this is a simulated banking demo.",
            ]
            send_email(db, recip_user, recip_subject, "\n".join(recip_body_lines), transaction_id=txn.id)
    except Exception:  # noqa: BLE001
        logger.exception("notify_transaction failed for txn %s", getattr(txn, "id", "?"))
