"""
Email OTP module — generates, stores, sends, and verifies one-time passwords via Gmail SMTP.
"""
import os
import random
import smtplib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "")

# In-memory OTP store: { email: { "otp": "123456", "expires": timestamp } }
_otp_store: dict = {}

OTP_EXPIRY_SECONDS = 300  # 5 minutes


def generate_otp() -> str:
    """Generate a random 6-digit OTP."""
    return str(random.randint(100000, 999999))


def send_otp_email(to_email: str) -> str:
    """
    Generate an OTP, store it, and send it to the given email via Gmail SMTP.
    Returns the OTP (for logging/debugging only).
    """
    otp = generate_otp()
    _otp_store[to_email.lower()] = {
        "otp": otp,
        "expires": time.time() + OTP_EXPIRY_SECONDS,
    }

    subject = "Recipient Shield — Your Verification Code"
    html_body = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 28px; font-weight: 800; color: #1a1a2e;">Recipient Shield</span>
        </div>
        <div style="background: #f8f9ff; border-radius: 12px; padding: 32px; text-align: center;">
            <p style="color: #555; font-size: 15px; margin-bottom: 8px;">Your one-time verification code is:</p>
            <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #4361ee; margin: 16px 0;">
                {otp}
            </div>
            <p style="color: #888; font-size: 13px; margin-top: 16px;">
                This code expires in 5 minutes. Do not share it with anyone.
            </p>
        </div>
        <p style="color: #aaa; font-size: 11px; text-align: center; margin-top: 24px;">
            If you didn't request this code, please ignore this email.
        </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Recipient Shield <{SMTP_EMAIL}>"
    msg["To"] = to_email
    msg.attach(MIMEText(f"Your Recipient Shield verification code is: {otp}", "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        print(f"[OTP] Sent OTP to {to_email}")
    except Exception as e:
        print(f"[OTP] Failed to send email to {to_email}: {e}")
        raise RuntimeError(f"Could not send OTP email: {e}")

    return otp


def verify_otp(email: str, otp: str) -> bool:
    """
    Verify the OTP for a given email. Returns True if valid and not expired.
    Deletes the OTP after successful verification (single use).
    """
    email = email.lower()
    entry = _otp_store.get(email)
    if not entry:
        return False
    if time.time() > entry["expires"]:
        del _otp_store[email]
        return False
    if entry["otp"] != otp:
        return False
    # Valid — delete so it can't be reused
    del _otp_store[email]
    return True
