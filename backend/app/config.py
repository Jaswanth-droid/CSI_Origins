"""
Central configuration for Recipient Shield.

Everything that would otherwise be hardcoded throughout the app -- risk
thresholds, decision actions, explainability weights, JWT settings, event
catalog windows -- lives here so the whole system can be tuned from one
place (per hackathon-brief section 7: "Do not hardcode these thresholds
throughout the application. Create a central configuration.").
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


def _load_dotenv():
    """Load backend/.env (if present) into the process environment, without
    overriding a variable that's already set for real. Used so SMTP
    credentials for real email delivery (see the notifications section
    below) can be configured without hardcoding secrets in source. Uses
    python-dotenv, which was already listed in requirements.txt."""
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path, override=False)
    except ImportError:
        # python-dotenv not installed for some reason -- fall back to a
        # tiny manual parser so a missing .env file never breaks startup.
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


_load_dotenv()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'recipient_shield.db'}")

# ---------------------------------------------------------------------------
# Auth (simulated banking users -- NOT a production auth system)
# ---------------------------------------------------------------------------
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "recipient-shield-hackathon-demo-secret-change-me")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 8  # 8 hour demo session

# ---------------------------------------------------------------------------
# Risk decision thresholds (0-100 risk_score scale)
# ---------------------------------------------------------------------------
RISK_THRESHOLDS = {
    "LOW_MAX": 29,      # 0-29   -> LOW RISK
    "MEDIUM_MAX": 69,   # 30-69  -> MEDIUM RISK
    # 70-100 -> HIGH RISK
}

RISK_LEVELS = {
    "LOW": {
        "label": "LOW RISK",
        "action": "ALLOW",
        "headline": "Recipient appears safe",
        "description": "No significant suspicious activity was detected on the recipient's account.",
    },
    "MEDIUM": {
        "label": "MEDIUM RISK",
        "action": "VERIFY",
        "headline": "Additional verification required",
        "description": "Some unusual activity was detected on the recipient's account. Please verify before continuing.",
    },
    "HIGH": {
        "label": "HIGH RISK",
        "action": "WARN_AND_HOLD",
        "headline": "Transfer Paused",
        "description": "Recipient account shows signs of possible compromise.",
    },
}


def risk_level_for_score(score: float) -> str:
    """Map a 0-100 risk score to LOW / MEDIUM / HIGH using central config."""
    if score <= RISK_THRESHOLDS["LOW_MAX"]:
        return "LOW"
    if score <= RISK_THRESHOLDS["MEDIUM_MAX"]:
        return "MEDIUM"
    return "HIGH"


def decision_for_level(level: str) -> str:
    return RISK_LEVELS[level]["action"]


# ---------------------------------------------------------------------------
# Behavioral analysis window
# ---------------------------------------------------------------------------
# "Recent" activity is anything within this many hours of the reference time
# (usually "now", i.e. the moment a transfer is being checked).
EVENT_LOOKBACK_HOURS = 72

# Large-transaction heuristics (simulated INR banking figures)
LARGE_TRANSFER_AMOUNT = 75_000
RAPID_TRANSACTION_WINDOW_MINUTES = 30
RAPID_TRANSACTION_COUNT_THRESHOLD = 3

# ---------------------------------------------------------------------------
# Sender-side transfer-pattern anomaly detection (app/risk/sender_signals.py)
# -- complementary to the recipient-focused risk engine above. These ask
# "does the SENDER's own transfer behavior look unusual right now?" rather
# than "does the recipient's account look compromised?", using simple,
# transparent rules against the sender's OWN transaction history (no ML
# model / training data needed for these).
# ---------------------------------------------------------------------------
# Multiple transfers to the SAME recipient in a short window (velocity).
TRANSFER_VELOCITY_WINDOW_MINUTES = 10
TRANSFER_VELOCITY_MIN_BURST_COUNT = 3    # never flag below this many transfers in the window
TRANSFER_VELOCITY_BASELINE_DAYS = 30     # history used to learn this sender->recipient's normal daily rate
TRANSFER_VELOCITY_RATIO_THRESHOLD = 3    # burst must be >= this many times the expected count for the window

# Sudden spike in transfer amount vs. the sender's own historical average.
TRANSFER_AMOUNT_HISTORY_DAYS = 90
TRANSFER_AMOUNT_MIN_HISTORY_COUNT = 3    # need at least this many past transfers to trust a personal average
TRANSFER_AMOUNT_SPIKE_RATIO = 3          # current amount must be >= this many times the historical average

# ---------------------------------------------------------------------------
# Trusted Recipient Aging (app/risk/recipient_aging.py)
# -- a brand-new recipient is inherently riskier than one the sender has a
# real track record with: there's no history yet to confirm this is a
# genuine, ongoing relationship rather than a one-off scam beneficiary. Each
# NEW recipient (models.Recipient.legitimate_transfer_count == 0 at
# creation) requires extra verification for its first few transfers; once
# that many COMPLETE without the transfer being flagged as suspicious, the
# recipient graduates from NEW to TRUSTED and reverts to normal handling.
# ---------------------------------------------------------------------------
NEW_RECIPIENT_VERIFICATION_COUNT = 3   # transfers 1..N require extra verification; N+1 onward is normal

# ---------------------------------------------------------------------------
# Self-service sign-up (app/routers/auth.py POST /api/auth/signup)
# ---------------------------------------------------------------------------
# Simulated opening balance credited to a brand-new account created through
# the Sign Up flow (separate from the seeded demo sender, who starts with a
# larger balance to make the pre-built demo scenarios feel realistic).
NEW_USER_STARTING_BALANCE = 50_000.0

# ---------------------------------------------------------------------------
# Explainability -- transparent feature-contribution weights.
# Used as the human-readable "why" layer. If SHAP is unavailable (it is not
# used in this prototype to keep the dependency footprint small and
# reliable), we fall back to this transparent, rule-based contribution model
# combined with the trained model's own feature_importances_ (see
# app/risk/explain.py).
# ---------------------------------------------------------------------------
FEATURE_LABELS = {
    "recent_device_change":        "New device detected",
    "recent_new_device":           "New device registered",
    "recent_password_reset":       "Password reset detected",
    "recent_password_change":      "Password changed",
    "recent_sim_change":           "SIM change detected",
    "recent_email_change":         "Email address changed",
    "recent_beneficiary_added":    "New beneficiary added",
    "recent_beneficiary_modified": "Beneficiary details modified",
    "failed_login_count":          "Multiple failed login attempts",
    "new_location":                "Login from an unrecognized location",
    "unusual_login_time":          "Login at an unusual hour",
    "transaction_velocity":        "Unusually high transaction velocity",
    "large_incoming_transfer":     "Large incoming transfer detected",
    "large_outgoing_transfer":     "Large outgoing transfer detected",
    "rapid_transactions":          "Multiple rapid transactions detected",
    "unusual_transaction_amount":  "Unusual transaction amount",
    "multiple_security_changes":  "Multiple security-sensitive changes in a short window",
    "profile_change":              "Profile information changed",
    "time_between_security_events": "Security changes clustered tightly in time",
    "total_recent_events":          "Unusually high account activity in a short window",
}

# Base point weights used for the transparent rule-based explanation layer
# (mirrors the hackathon brief's worked example in section 8).
FEATURE_BASE_WEIGHTS = {
    "recent_device_change": 34,
    "recent_new_device": 15,
    "recent_password_reset": 26,
    "recent_password_change": 8,
    "recent_sim_change": 26,
    "recent_email_change": 8,
    "recent_beneficiary_added": 20,
    "recent_beneficiary_modified": 8,
    "failed_login_count": 8,
    "new_location": 10,
    "unusual_login_time": 6,
    "transaction_velocity": 10,
    "large_incoming_transfer": 8,
    "large_outgoing_transfer": 10,
    "rapid_transactions": 12,
    "unusual_transaction_amount": 8,
    "multiple_security_changes": 15,
    "profile_change": 5,
    "time_between_security_events": 16,
    "total_recent_events": 4,
}

# ---------------------------------------------------------------------------
# ML model artifacts
# ---------------------------------------------------------------------------
ML_DIR = BASE_DIR / "app" / "ml" / "artifacts"
ML_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = ML_DIR / "takeover_risk_model.joblib"
METRICS_PATH = ML_DIR / "metrics.json"
FEATURE_NAMES_PATH = ML_DIR / "feature_names.json"

# ---------------------------------------------------------------------------
# CORS (frontend dev servers)
# ---------------------------------------------------------------------------
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

# ---------------------------------------------------------------------------
# Sender notifications (transaction status alerts)
# ---------------------------------------------------------------------------
# SMS is SIMULATED in this prototype -- no SMS provider account is wired up,
# so no real text message is sent. The message content is generated for
# real and logged / stored (app/notifications.py, models.Notification) so
# it's visible in the product exactly as if it had gone out.
#
# Email is sent FOR REAL over SMTP when credentials are provided below (via
# backend/.env or real environment variables -- NEVER hardcode credentials
# here). If SMTP isn't configured, email falls back to the same simulated
# behavior as SMS rather than crashing a transfer -- a notification must
# never block or roll back money movement.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Recipient Shield")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() != "false"
EMAIL_DELIVERY_ENABLED = bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD)

# Real SMS delivery via Twilio's REST API (called directly with the stdlib
# `urllib`, not the `twilio` package, to avoid adding a dependency). If not
# configured, SMS falls back to the same simulated behavior as email would.
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
SMS_DELIVERY_ENABLED = bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)

APP_NAME = "Recipient Shield API"
APP_VERSION = "0.1.0-prototype"
DISCLAIMER = (
    "PROTOTYPE SYSTEM: All accounts, transactions, and behavioral events are "
    "simulated for demonstration purposes. This system is not connected to "
    "any real bank, does not move real money, and the ML model is trained "
    "and evaluated entirely on simulated data."
)
