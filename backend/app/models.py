"""
SQLAlchemy ORM models (hackathon brief section 13).

Tables: users, accounts, account_events, recipients, transactions,
risk_assessments.

NOTE: the risk-scoring core (app/risk/features.py, app/risk/engine.py)
never imports this module -- it operates on plain event dicts so it can be
unit-tested without a database. These models are purely the persistence
layer used by the FastAPI routers.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _uid():
    return uuid.uuid4().hex[:12]


class User(Base):
    """A simulated banking customer who can log in and send money."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uid)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    role = Column(String, default="sender")  # simulated banking users -- demo auth only
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("Account", back_populates="owner", foreign_keys="Account.user_id")
    recipients = relationship("Recipient", back_populates="owner")


class Account(Base):
    """A bank account -- either the logged-in sender's own account, or a
    recipient's account being risk-monitored. `archetype` marks the demo
    recipients so the /api/simulation/* endpoints know how to reset them."""
    __tablename__ = "accounts"

    id = Column(String, primary_key=True, default=_uid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    account_number = Column(String, unique=True, index=True, nullable=False)
    holder_name = Column(String, nullable=False)
    account_type = Column(String, default="savings")
    bank_name = Column(String, default="Unity National Bank (simulated)")
    balance = Column(Float, default=0.0)
    is_demo_recipient = Column(Boolean, default=False)
    archetype = Column(String, nullable=True)  # "normal" | "medium" | "compromised" | None
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="accounts", foreign_keys=[user_id])
    events = relationship("AccountEvent", back_populates="account", cascade="all, delete-orphan",
                           order_by="AccountEvent.timestamp")


class AccountEvent(Base):
    """One behavioral event in an account's activity timeline
    (hackathon brief section 3)."""
    __tablename__ = "account_events"

    id = Column(String, primary_key=True, default=_uid)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False, index=True)
    device_id = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    location = Column(String, nullable=True)
    amount = Column(Float, nullable=True)
    event_metadata = Column(JSON, default=dict)
    risk_signal = Column(Boolean, default=False)

    account = relationship("Account", back_populates="events")

    def to_dict(self):
        return {
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "device_id": self.device_id,
            "ip_address": self.ip_address,
            "location": self.location,
            "amount": self.amount,
            "metadata": self.event_metadata or {},
            "risk_signal": bool(self.risk_signal),
        }


class Recipient(Base):
    """A saved/trusted beneficiary relationship: sender -> recipient account.

    `legitimate_transfer_count` powers Trusted Recipient Aging (see
    app/risk/recipient_aging.py): it starts at 0 for every newly-added
    recipient, increments once per COMPLETED transfer to them (see
    app/routers/transfers.py::initiate_transfer), and resets to 0 if a
    refund is later issued against one of those transfers (see
    request_refund) -- a refund means that "legitimate" transfer wasn't.
    """
    __tablename__ = "recipients"

    id = Column(String, primary_key=True, default=_uid)
    owner_user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    nickname = Column(String, nullable=True)
    trusted = Column(Boolean, default=True)
    added_at = Column(DateTime, default=datetime.utcnow)
    legitimate_transfer_count = Column(Integer, default=0, nullable=False)

    owner = relationship("User", back_populates="recipients")
    account = relationship("Account")

    @property
    def trust_status(self) -> str:
        """NEW | TRUSTED -- see app/risk/recipient_aging.py::status_for().
        A plain Python property is readable by Pydantic's
        RecipientOut(from_attributes=True) with no extra router glue."""
        from app.risk import recipient_aging
        return recipient_aging.status_for(self)


class Transaction(Base):
    """A transfer attempt (hackathon brief section 2 & 12). Only marked
    COMPLETED if the risk decision allowed it or verification succeeded."""
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=_uid)
    sender_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    recipient_account_id = Column(String, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Float, nullable=False)
    note = Column(String, nullable=True)
    status = Column(String, default="PENDING_RISK_CHECK")
    # PENDING_RISK_CHECK -> COMPLETED | HELD | CANCELLED | PENDING_VERIFICATION
    risk_assessment_id = Column(String, ForeignKey("risk_assessments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    # Duplicate-SMS guard: flips to True the moment a success SMS has been
    # attempted for this transaction (see app/services/notification_service.py
    # and app/routers/transfers.py). Prevents a frontend refresh/retry/
    # double-click from firing a second "transfer successful" SMS for the
    # same transaction id.
    notification_sent = Column(Boolean, default=False)

    sender_account = relationship("Account", foreign_keys=[sender_account_id])
    recipient_account = relationship("Account", foreign_keys=[recipient_account_id])
    risk_assessment = relationship("RiskAssessment", foreign_keys=[risk_assessment_id])


class RiskAssessment(Base):
    """A stored snapshot of a Recipient Shield risk check
    (hackathon brief sections 4, 8 & 12)."""
    __tablename__ = "risk_assessments"

    id = Column(String, primary_key=True, default=_uid)
    account_id = Column(String, ForeignKey("accounts.id"), nullable=False, index=True)
    transaction_id = Column(String, nullable=True)
    risk_score = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)   # LOW | MEDIUM | HIGH
    decision = Column(String, nullable=False)      # ALLOW | VERIFY | WARN_AND_HOLD
    confidence = Column(Float, nullable=False)
    top_reason = Column(Text, nullable=True)
    reasons = Column(JSON, default=list)
    feature_contributions = Column(JSON, default=list)
    features = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class RefundRequest(Base):
    """A sender-authorized auto-refund request, raised when a recipient's
    account is found to have become compromised AFTER a transfer already
    completed to it (post-transfer monitoring).

    In this prototype, "sending the request to the bank" and the bank's
    response are both simulated: the request is auto-approved immediately
    (since it's corroborated by the same risk engine that would have
    blocked the transfer had the compromise been detected earlier) and the
    transferred amount is credited back to the sender. A real system would
    submit this to a bank's dispute/chargeback workflow and wait for a
    human/automated decision.
    """
    __tablename__ = "refund_requests"

    id = Column(String, primary_key=True, default=_uid)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False, index=True)
    requested_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=True)
    refunded_amount = Column(Float, nullable=False)
    # REQUESTED -> SUBMITTED_TO_BANK -> APPROVED | REJECTED
    status = Column(String, default="REQUESTED")
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    transaction = relationship("Transaction", foreign_keys=[transaction_id])
    requested_by = relationship("User", foreign_keys=[requested_by_user_id])


class Notification(Base):
    """A record of a sender-facing transaction notification (SMS and/or
    email). SMS is simulated (no SMS provider is wired up in this
    prototype -- see app/notifications.py); email is sent for real over
    SMTP when credentials are configured, and simulated otherwise. Every
    attempt -- sent, simulated, or failed -- is logged here so it's visible
    in the product and auditable, mirroring how a real bank would keep a
    notification trail.
    """
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=_uid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=True, index=True)
    channel = Column(String, nullable=False)  # "SMS" | "EMAIL"
    recipient_contact = Column(String, nullable=False)  # phone number or email address
    subject = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    status = Column(String, nullable=False)  # "SENT" | "SIMULATED" | "FAILED"
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    transaction = relationship("Transaction", foreign_keys=[transaction_id])
