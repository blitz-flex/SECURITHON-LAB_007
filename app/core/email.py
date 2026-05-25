"""
Email OTP Service
Uses centralized settings from app.core.config — no manual .env parsing here.
"""
import secrets
import smtplib
from email.mime.text import MIMEText
from email.header import Header

from app.core.config import settings


def generate_otp(length: int = 6) -> str:
    """Generate a cryptographically secure 6-digit numeric OTP code."""
    return "".join([str(secrets.randbelow(10)) for _ in range(length)])


def send_email_otp(email_address: str, otp: str) -> bool:
    """
    Send OTP code via SMTP.
    Falls back to console logging (sandbox mode) if SMTP credentials are not configured.
    """
    # Sandbox mode: credentials not configured
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(
            f"[EMAIL OTP - SANDBOX] To: {email_address} "
            f"| Code: {otp} "
            f"| Subject: Securithon Lab Verification Code"
        )
        return True

    try:
        subject = "Securithon Lab Verification Code"
        body = f"Your verification code is: {otp}\nThis code is valid for 5 minutes."

        message = MIMEText(body, "plain", "utf-8")
        message["Subject"] = Header(subject, "utf-8")
        message["From"]    = Header(f"{settings.SMTP_SENDER_NAME} <{settings.SMTP_USER}>", "utf-8")
        message["To"]      = Header(email_address, "utf-8")

        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, [email_address], message.as_string())
        server.quit()
        print(f"[EMAIL OTP - SENT] Real email sent to {email_address}")
        return True

    except Exception as e:
        print(f"[EMAIL OTP - ERROR] Failed to send real email: {e}")
        return False
