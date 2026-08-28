"""
Transfer + risk-check endpoints (hackathon brief section 12 -- the
critical POST /api/transfers/check-risk endpoint lives here).
"""
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.risk import engine as risk_engine
from app.risk import sender_signals
from app.risk import recipient_aging
from app.routers.alerts import refund_to_out
from app.notifications import notify_transaction, send_email
from app.services.notification_service import send_transaction_success_sms

router = APIRouter(prefix="/api/transfers", tags=["transfers"])

# In-memory registry for transfer step-up OTP codes (user_id -> (otp_code, expiry_time))
transfer_otps = {}

# Ranks the three possible decisions so independent escalation signals
# (sender-behavior flags, recipient aging) can only ever escalate
# (ALLOW -> VERIFY), never downgrade an existing recipient-risk decision,
# and never escalate all the way to WARN_AND_HOLD on their own -- that
# outcome stays reserved for confirmed recipient compromise.
_DECISION_RANK = {"ALLOW": 0, "VERIFY": 1, "WARN_AND_HOLD": 2}


def _escalate_decision(result: dict, min_decision: str) -> dict:
    """Bumps result['decision']/'action_label' UP to at least `min_decision`
    if it isn't already there or higher; otherwise leaves it untouched.
    Shared by every independent escalation signal layered on top of the
    recipient's own risk_level-derived decision -- sender-behavior flags
    (velocity, amount spike -- app/risk/sender_signals.py) and Trusted
    Recipient Aging (app/risk/recipient_aging.py). Callers here only ever
    pass "VERIFY": escalating all the way to WARN_AND_HOLD is reserved for
    the recipient's own confirmed-compromise risk_level."""
    if _DECISION_RANK[min_decision] > _DECISION_RANK[result["decision"]]:
        result = {**result, "decision": min_decision, "action_label": min_decision}
    return result


def _get_account(db: Session, account_id: str) -> models.Account:
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _get_recipient_link(db: Session, sender_user_id: str, recipient_account_id: str):
    """The models.Recipient row (if any) linking the sender's owning user to
    this recipient account -- the row Trusted Recipient Aging tracks trust
    against. Returns None if this recipient account isn't saved in the
    sender's trusted-recipients list at all (evaluated as maximally
    new/untrusted by recipient_aging.status_for, same as a freshly-added
    one)."""
    if not sender_user_id:
        return None
    return (
        db.query(models.Recipient)
        .filter(
            models.Recipient.owner_user_id == sender_user_id,
            models.Recipient.account_id == recipient_account_id,
        )
        .first()
    )


def _assess_account(db: Session, account: models.Account) -> dict:
    events = [e.to_dict() for e in account.events]
    result = risk_engine.assess(events, reference_time=None)  # defaults to latest event time
    return result


def _persist_assessment(db: Session, account_id: str, result: dict, transaction_id: str = None) -> models.RiskAssessment:
    ra = models.RiskAssessment(
        account_id=account_id,
        transaction_id=transaction_id,
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
    db.flush()
    return ra


@router.post("/check-risk", response_model=schemas.RiskAssessmentOut)
def check_risk(payload: schemas.CheckRiskRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    """THE critical endpoint: before a transfer completes, analyze the
    RECIPIENT's recent behavioral activity and return a risk score /
    level / decision, exactly per the hackathon brief's core innovation."""
    sender = _get_account(db, payload.sender_id)
    recipient = _get_account(db, payload.recipient_id)

    if sender.id == recipient.id:
        raise HTTPException(status_code=400, detail="Sender and recipient cannot be the same account")

    result = _assess_account(db, recipient)
    flags = sender_signals.evaluate(db, sender.id, recipient.id, payload.amount, now=datetime.utcnow())
    if flags:
        result = _escalate_decision(result, "VERIFY")

    recipient_link = _get_recipient_link(db, sender.user_id, recipient.id)
    aging = recipient_aging.evaluate(recipient_link)
    if aging["requires_extra_verification"]:
        result = _escalate_decision(result, "VERIFY")

    _persist_assessment(db, recipient.id, result)
    db.commit()

    # Generate and send OTP if the decision is VERIFY
    if result["decision"] == "VERIFY" and sender.owner and sender.owner.email:
        import random
        otp_code = f"{random.randint(100000, 999999)}"
        expiry = datetime.utcnow() + timedelta(minutes=5)
        transfer_otps[sender.user_id] = (otp_code, expiry)
        
        # Send OTP email
        subject = "Recipient Shield -- Step-up Verification Code"
        body = (
            f"Hello {sender.owner.full_name},\n\n"
            f"Your transfer of Rs.{payload.amount:,.2f} to {recipient.holder_name} requires additional step-up verification.\n\n"
            f"Your 6-digit verification code is: {otp_code}\n\n"
            f"This code will expire in 5 minutes.\n\n"
            f"If you did not initiate this transaction, please change your credentials immediately.\n\n"
            f"Best regards,\n"
            f"Recipient Shield Security Team"
        )
        send_email(db, sender.owner, subject, body)

    return schemas.RiskAssessmentOut(
        **result, recipient=recipient, sender_behavior_flags=flags, recipient_aging=aging
    )


@router.post("", response_model=schemas.TransactionOut)
def initiate_transfer(payload: schemas.InitiateTransferRequest, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    sender = _get_account(db, payload.sender_id)
    recipient = _get_account(db, payload.recipient_id)

    if payload.action == "cancel":
        txn = models.Transaction(
            sender_account_id=sender.id,
            recipient_account_id=recipient.id,
            amount=payload.amount,
            note=payload.note,
            status="CANCELLED",
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)
        notify_transaction(db, sender, txn, recipient)
        db.commit()
        return _txn_out(db, txn)

    if sender.balance < payload.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    # Always re-assess server-side at the moment of confirmation -- never
    # trust a stale client-held risk result for the actual money-movement
    # decision.
    result = _assess_account(db, recipient)
    flags = sender_signals.evaluate(db, sender.id, recipient.id, payload.amount, now=datetime.utcnow())
    if flags:
        result = _escalate_decision(result, "VERIFY")

    recipient_link = _get_recipient_link(db, sender.user_id, recipient.id)
    aging = recipient_aging.evaluate(recipient_link)
    if aging["requires_extra_verification"]:
        result = _escalate_decision(result, "VERIFY")

    txn = models.Transaction(
        sender_account_id=sender.id,
        recipient_account_id=recipient.id,
        amount=payload.amount,
        note=payload.note,
        status="PENDING_RISK_CHECK",
    )
    db.add(txn)
    db.flush()

    ra = _persist_assessment(db, recipient.id, result, transaction_id=txn.id)
    txn.risk_assessment_id = ra.id

    decision = result["decision"]
    if decision == "ALLOW":
        txn.status = "COMPLETED"
        txn.completed_at = datetime.utcnow()
        sender.balance -= payload.amount
        recipient.balance += payload.amount
    elif decision == "VERIFY":
        if payload.verified:
            # Check the OTP entered by the user
            stored = transfer_otps.get(sender.user_id)
            if not stored:
                raise HTTPException(status_code=400, detail="No verification code was sent. Please try again.")
            
            stored_otp, expiry = stored
            if datetime.utcnow() > expiry:
                raise HTTPException(status_code=400, detail="Verification code has expired. Please check your email and try again.")
            
            if payload.otp != stored_otp:
                raise HTTPException(status_code=400, detail="Incorrect verification code. Please check your email and try again.")
            
            # OTP is correct! Clear it so it cannot be reused
            transfer_otps.pop(sender.user_id, None)
            
            txn.status = "COMPLETED"
            txn.completed_at = datetime.utcnow()
            sender.balance -= payload.amount
            recipient.balance += payload.amount
        else:
            txn.status = "PENDING_VERIFICATION"
    else:  # WARN_AND_HOLD
        txn.status = "HELD"

    # Trusted Recipient Aging: every transfer that actually COMPLETES to a
    # saved recipient counts as one more legitimate transaction toward that
    # recipient graduating from NEW to TRUSTED (see
    # app/risk/recipient_aging.py). Only COMPLETED counts -- a HELD,
    # cancelled, or still-pending transfer never happened, so it shouldn't
    # build trust.
    if txn.status == "COMPLETED" and recipient_link is not None:
        recipient_link.legitimate_transfer_count = (recipient_link.legitimate_transfer_count or 0) + 1

    db.commit()
    db.refresh(txn)

    # Best-effort sender notification -- generic per-status email (real via
    # SMTP if configured) about this transfer's outcome. Never blocks or
    # rolls back the transfer itself; see app/notifications.py.
    notify_transaction(db, sender, txn, recipient)
    db.commit()

    # Dedicated "transfer successful" SMS -- ONLY once the backend has
    # confirmed txn.status == "COMPLETED" (i.e. ALLOW, or VERIFY + the
    # sender actually passed step-up verification). HELD and
    # PENDING_VERIFICATION never reach this branch. `notification_sent`
    # guards against a second SMS if the frontend retries/double-submits
    # this same transaction id.
    if txn.status == "COMPLETED" and not txn.notification_sent:
        sender_user = sender.owner
        if sender_user is not None:
            send_transaction_success_sms(
                db,
                sender_user,
                amount=txn.amount,
                recipient_name=recipient.holder_name,
                transaction_id=txn.id,
            )
        # Marked True regardless of provider outcome (SENT/SIMULATED/FAILED
        # are all recorded on the Notification row) -- this flag's job is
        # only to stop a duplicate SEND ATTEMPT, not to track delivery
        # success. A failed SMS never rolls back the transaction.
        txn.notification_sent = True
        db.commit()
        db.refresh(txn)

    return _txn_out(db, txn)


@router.get("", response_model=list[schemas.TransactionOut])
def list_transfers(account_id: str = None, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    q = db.query(models.Transaction)
    if account_id:
        q = q.filter(
            (models.Transaction.sender_account_id == account_id)
            | (models.Transaction.recipient_account_id == account_id)
        )
    txns = q.order_by(models.Transaction.created_at.desc()).all()
    return [_txn_out(db, t) for t in txns]


@router.get("/summary/daily", response_model=schemas.TransactionSummaryOut)
def daily_transaction_summary(
    account_id: str,
    days: int = 30,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Transaction Management: money sent vs. money received per day, for
    the requesting user's account, over the trailing `days` days. Powers
    the sent-vs-received graph (line or bar, selectable by the frontend).

    Only COMPLETED transfers move real (simulated) money, so only those are
    counted -- a HELD/CANCELLED/PENDING transfer never moved money and would
    be misleading in a "money sent/received" chart. Every day in the window
    is included (with zeros) so the frontend gets a continuous, gap-free
    series to plot rather than only the days something happened.
    """
    account = _get_account(db, account_id)
    days = max(1, min(days, 365))

    today = datetime.utcnow().date()
    since = datetime.utcnow() - timedelta(days=days - 1)

    txns = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.status == "COMPLETED",
            models.Transaction.completed_at >= since,
            (models.Transaction.sender_account_id == account.id)
            | (models.Transaction.recipient_account_id == account.id),
        )
        .all()
    )

    by_day = defaultdict(lambda: {"sent": 0.0, "received": 0.0})
    for t in txns:
        moment = t.completed_at or t.created_at
        day = moment.strftime("%Y-%m-%d")
        if t.sender_account_id == account.id:
            by_day[day]["sent"] += t.amount
        if t.recipient_account_id == account.id:
            by_day[day]["received"] += t.amount

    daily = []
    total_sent = 0.0
    total_received = 0.0
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).strftime("%Y-%m-%d")
        v = by_day.get(day, {"sent": 0.0, "received": 0.0})
        sent = round(v["sent"], 2)
        received = round(v["received"], 2)
        total_sent += sent
        total_received += received
        daily.append(schemas.DailyTransactionSummary(date=day, sent=sent, received=received))

    return schemas.TransactionSummaryOut(
        daily=daily,
        total_sent=round(total_sent, 2),
        total_received=round(total_received, 2),
        days=days,
    )


@router.post("/{transaction_id}/request-refund", response_model=schemas.RefundRequestOut)
def request_refund(
    transaction_id: str,
    payload: schemas.RequestRefundBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Sender-authorized auto-refund request for a transfer whose recipient
    was found to be compromised AFTER the money already moved (see
    app/routers/alerts.py for the detection side). Requires the sender's
    explicit consent (payload.consent) -- this is never triggered
    automatically without the sender clicking through the alert.

    The bank submission and approval are simulated: since the request is
    corroborated by the same risk engine that would have blocked the
    transfer had the compromise been caught in time, it is auto-approved
    and the amount is credited back to the sender immediately. A real
    integration would submit this to the bank's dispute/chargeback
    workflow and await a response.
    """
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Refund request requires explicit sender consent")

    txn = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.sender_account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only request a refund for your own transfers")
    if txn.status != "COMPLETED":
        raise HTTPException(status_code=400, detail=f"Only completed transfers can be refunded (current status: {txn.status})")

    existing = (
        db.query(models.RefundRequest)
        .filter(models.RefundRequest.transaction_id == txn.id, models.RefundRequest.status == "APPROVED")
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="This transfer has already been refunded")

    recipient = txn.recipient_account
    current = _assess_account(db, recipient)
    if current["risk_level"] != "HIGH":
        raise HTTPException(
            status_code=400,
            detail="This recipient account is not currently showing high-risk signs -- refund request not applicable",
        )

    now = datetime.utcnow()
    refund = models.RefundRequest(
        transaction_id=txn.id,
        requested_by_user_id=current_user.id,
        reason=f"Recipient account flagged HIGH risk after transfer completed: {current['top_reason']}",
        refunded_amount=txn.amount,
        status="APPROVED",  # simulated instant bank approval, see docstring
        resolved_at=now,
    )
    db.add(refund)

    # reverse the ledger: sender gets their money back, recipient's
    # (compromised) account loses it
    sender = txn.sender_account
    sender.balance += txn.amount
    recipient.balance = max(0.0, recipient.balance - txn.amount)
    txn.status = "REFUNDED"

    # Trusted Recipient Aging: this transfer was credited as one legitimate
    # transaction toward this recipient's trust-building, but a refund means
    # it turned out not to be legitimate after all (the recipient's account
    # was actually compromised). Reset trust progress for this
    # sender/recipient relationship back to 0 -- rebuilt from scratch.
    recipient_link = _get_recipient_link(db, sender.user_id, recipient.id)
    if recipient_link is not None:
        recipient_link.legitimate_transfer_count = 0

    db.commit()
    db.refresh(refund)

    notify_transaction(db, sender, txn, recipient)
    db.commit()

    return refund_to_out(refund)


def _mask_phone(number: str) -> str:
    """'+919876543210' -> '******3210'. Never returns the full number."""
    digits = "".join(ch for ch in (number or "") if ch.isdigit())
    if len(digits) < 4:
        return "******"
    return f"******{digits[-4:]}"


def _sms_status_for(db: Session, t: models.Transaction):
    """Looks up the most recent SMS Notification row for this transaction
    (written by app/services/notification_service.py) so the API response
    can tell the frontend whether the success SMS went out -- WITHOUT ever
    exposing the sender's actual phone number."""
    if t.status != "COMPLETED":
        return None, None
    note = (
        db.query(models.Notification)
        .filter(models.Notification.transaction_id == t.id, models.Notification.channel == "SMS")
        .order_by(models.Notification.created_at.desc())
        .first()
    )
    if note is None:
        return None, None
    return note.status, _mask_phone(note.recipient_contact)


def _txn_out(db: Session, t: models.Transaction) -> schemas.TransactionOut:
    ra = t.risk_assessment
    sms_status, sms_masked_number = _sms_status_for(db, t)
    return schemas.TransactionOut(
        id=t.id,
        sender_account_id=t.sender_account_id,
        recipient_account_id=t.recipient_account_id,
        amount=t.amount,
        note=t.note,
        status=t.status,
        created_at=t.created_at.isoformat(),
        completed_at=t.completed_at.isoformat() if t.completed_at else None,
        risk_level=ra.risk_level if ra else None,
        risk_score=ra.risk_score if ra else None,
        sms_status=sms_status,
        sms_masked_number=sms_masked_number,
    )
