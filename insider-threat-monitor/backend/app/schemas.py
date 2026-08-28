from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Union
from datetime import datetime

class PrivilegedActionOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    username: str
    full_name: str
    role: str
    action_type: str
    timestamp: Union[str, datetime]
    resource_target: Optional[str] = None
    business_context: str
    shift_status: str
    risk_score: float
    risk_level: str
    mitigation_action: str
    reasons: List[str]
    status: str

    model_config = ConfigDict(from_attributes=True)


class SimulateActionRequest(BaseModel):
    scenario: str
