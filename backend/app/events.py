"""
Catalog of simulated account-event types used to build recipient activity
sequences (hackathon brief section 3).

Every event stored in `account_events` has an `event_type` drawn from this
catalog. `category` groups events for feature engineering; `base_risk`
is a 0-1 severity used only for lightweight display coloring in the UI
timeline (the actual risk SCORE always comes from the trained model + the
rule-based feature contribution layer, never from this constant alone).
"""

EVENT_TYPES = {
    "LOGIN_SUCCESS":            {"category": "auth",         "base_risk": 0.05, "label": "Successful login"},
    "LOGIN_FAILED":             {"category": "auth",         "base_risk": 0.35, "label": "Failed login attempt"},
    "DEVICE_CHANGE":            {"category": "security",     "base_risk": 0.55, "label": "Device change"},
    "NEW_DEVICE_REGISTERED":    {"category": "security",     "base_risk": 0.45, "label": "New device registered"},
    "PASSWORD_CHANGE":          {"category": "security",     "base_risk": 0.40, "label": "Password change"},
    "PASSWORD_RESET":           {"category": "security",     "base_risk": 0.70, "label": "Password reset"},
    "SIM_CHANGE":               {"category": "security",     "base_risk": 0.85, "label": "SIM change"},
    "EMAIL_CHANGE":             {"category": "security",     "base_risk": 0.55, "label": "Email address change"},
    "BENEFICIARY_ADDED":        {"category": "beneficiary",  "base_risk": 0.60, "label": "New beneficiary added"},
    "BENEFICIARY_MODIFIED":     {"category": "beneficiary",  "base_risk": 0.40, "label": "Beneficiary modified"},
    "NEW_IP_LOCATION":          {"category": "auth",         "base_risk": 0.35, "label": "New IP / location"},
    "UNUSUAL_LOGIN_TIME":       {"category": "auth",         "base_risk": 0.25, "label": "Unusual login time"},
    "LARGE_INCOMING_TRANSFER":  {"category": "transaction",  "base_risk": 0.45, "label": "Large incoming transfer"},
    "LARGE_OUTGOING_TRANSFER":  {"category": "transaction",  "base_risk": 0.65, "label": "Large outgoing transfer"},
    "RAPID_TRANSACTIONS":       {"category": "transaction",  "base_risk": 0.60, "label": "Multiple rapid transactions"},
    "PROFILE_CHANGE":           {"category": "profile",      "base_risk": 0.30, "label": "Profile information change"},
}

SECURITY_SENSITIVE_TYPES = {
    "DEVICE_CHANGE", "NEW_DEVICE_REGISTERED", "PASSWORD_CHANGE", "PASSWORD_RESET",
    "SIM_CHANGE", "EMAIL_CHANGE", "BENEFICIARY_ADDED", "BENEFICIARY_MODIFIED",
}


def event_label(event_type: str) -> str:
    return EVENT_TYPES.get(event_type, {}).get("label", event_type.replace("_", " ").title())


def event_base_risk(event_type: str) -> float:
    return EVENT_TYPES.get(event_type, {}).get("base_risk", 0.2)
