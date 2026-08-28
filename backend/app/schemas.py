"""
Pydantic request/response schemas (hackathon brief sections 1 & 12).
"""
import re
from datetime import datetime
from typing import Optional, List, Any

from pydantic import BaseModel, Field, ConfigDict, field_validator

# Deliberately a hand-rolled regex rather than pydantic's EmailStr, which
# requires the optional `email-validator` package -- this project keeps its
# dependency footprint minimal so `pip install -r requirements.txt` stays
# reliable on any machine (see requirements.txt notes).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+?[0-9][0-9\-\s]{6,17}[0-9]$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9._@-]{3,50}$")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=100)

    @field_validator("full_name")
    @classmethod
    def _valid_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Enter your full name")
        return v

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError(
                "Username must be 3-50 characters and can only contain letters, numbers, dots, "
                "underscores and hyphens"
            )
        return v


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    full_name: str
    account_id: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    # the frontend uses this to show the one-time contact-details setup
    # step right after login.
    needs_contact_setup: bool = False
    needs_account_setup: bool = False


class VerifyOTPRequest(BaseModel):
    otp: str


class ContactDetailsRequest(BaseModel):
    phone_number: str = Field(min_length=7, max_length=20)
    email: str

    @field_validator("phone_number")
    @classmethod
    def _valid_phone(cls, v: str) -> str:
        v = v.strip()
        if not _PHONE_RE.match(v):
            raise ValueError("Enter a valid phone number, e.g. +919876543210")
        return v

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("Enter a valid email address")
        return v


class ContactDetailsOut(BaseModel):
    phone_number: Optional[str] = None
    email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationOut(BaseModel):
    id: str
    transaction_id: Optional[str] = None
    channel: str
    recipient_contact: str
    subject: Optional[str] = None
    message: str
    status: str
    error: Optional[str] = None
    created_at: str

    model_config = ConfigDict(from_attributes=True)


class NotificationTestResult(BaseModel):
    sms: Optional[NotificationOut] = None
    email: Optional[NotificationOut] = None


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
class AccountOut(BaseModel):
    id: str
    account_number: str
    holder_name: str
    account_type: str
    bank_name: str
    balance: float
    is_demo_recipient: bool
    archetype: Optional[str] = None
    cibil_score: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class EventOut(BaseModel):
    event_type: str
    label: str
    timestamp: str
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[str] = None
    amount: Optional[float] = None
    metadata: dict = Field(default_factory=dict)
    risk_signal: bool = False


# ---------------------------------------------------------------------------
# Recipients
# ---------------------------------------------------------------------------
class RecipientOut(BaseModel):
    id: str
    nickname: Optional[str]
    trusted: bool
    account: AccountOut
    # Trusted Recipient Aging (app/risk/recipient_aging.py) -- trust_status
    # is a plain @property on models.Recipient, read automatically here via
    # from_attributes (Pydantic v2 reads properties off ORM objects with no
    # extra router-side glue).
    trust_status: str = "TRUSTED"
    legitimate_transfer_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CreateRecipientRequest(BaseModel):
    holder_name: str = Field(min_length=2)
    account_number: Optional[str] = None  # auto-generated if omitted
    nickname: Optional[str] = None
    bank_name: Optional[str] = "Unity National Bank (simulated)"


# ---------------------------------------------------------------------------
# Risk / Transfers (hackathon brief section 12 -- the critical contract)
# ---------------------------------------------------------------------------
class CheckRiskRequest(BaseModel):
    sender_id: str
    recipient_id: str
    amount: float = Field(gt=0)


class FeatureContribution(BaseModel):
    feature: str
    label: str
    points: int
    activation: float


class SenderBehaviorFlag(BaseModel):
    """A sender-side transfer-pattern anomaly (see app/risk/sender_signals.py)
    -- distinct from the recipient's own risk score above: this is about
    whether the SENDER's own behavior (velocity, amount) looks unusual right
    now, e.g. a burst of transfers to the same recipient or a transfer far
    above the sender's own historical average."""
    type: str  # "VELOCITY" | "AMOUNT_SPIKE"
    message: str
    details: dict = Field(default_factory=dict)


class RecipientAgingOut(BaseModel):
    """Trusted Recipient Aging (see app/risk/recipient_aging.py) -- how far
    along this sender/recipient relationship is toward being TRUSTED, and
    whether the current transfer needs extra verification purely because
    the recipient is still new to this sender (independent of the
    recipient's own behavioral risk_level, and of sender_behavior_flags
    above)."""
    status: str  # "NEW" | "TRUSTED"
    legitimate_transfer_count: int
    verification_threshold: int
    transfers_until_trusted: int
    requires_extra_verification: bool


class RiskAssessmentOut(BaseModel):
    risk_score: float
    risk_level: str
    decision: str
    action_label: str
    headline: str
    description: str
    confidence: float
    reasons: List[str]
    top_reason: str
    feature_contributions: List[FeatureContribution]
    features: dict
    recent_events: List[EventOut]
    model_type: str
    assessed_at: str
    recipient: AccountOut
    sender_behavior_flags: List[SenderBehaviorFlag] = Field(default_factory=list)
    recipient_aging: Optional[RecipientAgingOut] = None
    disclaimer: str = (
        "AI-generated risk assessment based on simulated account activity. "
        "This is a hackathon prototype -- not a real fraud determination."
    )


class InitiateTransferRequest(BaseModel):
    sender_id: str
    recipient_id: str
    amount: float = Field(gt=0)
    note: Optional[str] = None
    # set by the frontend once the sender has passed step-up verification
    # for a MEDIUM risk decision
    verified: bool = False
    otp: Optional[str] = None
    risk_assessment_id: Optional[str] = None
    action: str = Field(default="confirm", pattern="^(confirm|cancel)$")


class TransactionOut(BaseModel):
    id: str
    sender_account_id: str
    recipient_account_id: str
    amount: float
    note: Optional[str] = None
    status: str
    created_at: str
    completed_at: Optional[str] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    # NOTE: previously set by routers/transfers.py::_txn_out but not declared
    # here -- Pydantic v2 silently drops unknown constructor kwargs by
    # default, so these were always missing from the API response even
    # though the frontend's DoneScreen reads them. Declared now so the SMS
    # delivery status actually reaches the UI.
    sms_status: Optional[str] = None
    sms_masked_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Transaction management -- daily sent/received summary (for the sent vs.
# received graph on the Transaction Management page)
# ---------------------------------------------------------------------------
class DailyTransactionSummary(BaseModel):
    date: str  # "YYYY-MM-DD"
    sent: float
    received: float


class TransactionSummaryOut(BaseModel):
    daily: List[DailyTransactionSummary]
    total_sent: float
    total_received: float
    days: int


# ---------------------------------------------------------------------------
# Post-transfer monitoring & auto-refund (compromise detected AFTER a
# transfer already completed)
# ---------------------------------------------------------------------------
class RefundRequestOut(BaseModel):
    id: str
    transaction_id: str
    reason: Optional[str] = None
    refunded_amount: float
    status: str
    created_at: str
    resolved_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PostTransferAlertOut(BaseModel):
    transaction: TransactionOut
    recipient: AccountOut
    original_risk_level: Optional[str] = None
    current_risk: RiskAssessmentOut
    refund_request: Optional[RefundRequestOut] = None
    message: str


class RequestRefundBody(BaseModel):
    # explicit sender consent -- the frontend only sends this once the
    # sender has clicked "Yes, request refund" on the alert
    consent: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------
class SimulationRequest(BaseModel):
    account_id: Optional[str] = None  # defaults to the canonical demo account for the scenario


class SimulationStepOut(BaseModel):
    step: int
    label: str
    event_type: Optional[str] = None
    timestamp: Optional[str] = None
    risk_signal: bool = False


class SimulationResultOut(BaseModel):
    scenario: str
    account: AccountOut
    steps: List[SimulationStepOut]
    risk_assessment: RiskAssessmentOut


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
class AnalyticsOut(BaseModel):
    total_monitored_recipients: int
    low_risk_count: int
    medium_risk_count: int
    high_risk_count: int
    potential_takeovers_detected: int
    transfers_prevented: int
    post_transfer_compromises_detected: int
    refunds_issued: int
    average_risk_score: float
    risk_distribution: dict
    cibil_distribution: Optional[dict] = None
    suspicious_event_frequency: dict
    risk_over_time: List[dict]
    model_metrics: dict
    disclaimer: str
