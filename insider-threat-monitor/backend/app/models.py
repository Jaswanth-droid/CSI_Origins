import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, JSON

from app.database import Base


def _uid():
    return uuid.uuid4().hex[:12]


class SimulatedPrivilegedAction(Base):
    """Stores simulated privileged activities and override statuses."""
    __tablename__ = "simulated_privileged_actions"

    id = Column(String, primary_key=True, default=_uid)
    username = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # SYS_ADMIN | SERVICE_ACCOUNT | FINANCIAL_OFFICER | SUPPORT_STAFF
    action_type = Column(String, nullable=False)  # BULK_RECORD_ACCESS | SYSTEM_LIMIT_CHANGE | ROLE_ELEVATION | FUND_TRANSFER
    timestamp = Column(DateTime, default=datetime.utcnow)
    resource_target = Column(String, nullable=True)
    business_context = Column(String, default="None")
    shift_status = Column(String, default="In Shift")
    risk_score = Column(Float, default=0.0)
    risk_level = Column(String, default="LOW")
    mitigation_action = Column(String, default="MONITOR")
    reasons = Column(JSON, default=list)
    status = Column(String, default="ACTIVE")  # ACTIVE | BLOCKED | OVERRIDDEN
