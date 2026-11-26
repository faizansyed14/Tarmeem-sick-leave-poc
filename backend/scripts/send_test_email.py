"""Sends one test email with the settings in .env.

Run from the backend folder, giving the address to send to:
    python scripts/send_test_email.py <recipient>   (use the .venv interpreter)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import mailer  # noqa: E402
from app.config import settings  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/send_test_email.py <recipient>")
        return 2
    to = sys.argv[1]
    if not settings.mail_enabled:
        print("Email is not configured. Fill in SMTP_EMAIL and SMTP_PASSWORD in backend/.env.")
        return 1
    print(f"Sending through {settings.mail_description} to {to} ...")
    try:
        mailer.send_login_code(to, "Test", "123456", 5)
    except mailer.MailError as exc:
        print(f"FAILED: {exc}")
        print("See the log line above for the server's exact response.")
        return 1
    print("Sent. Check the inbox and junk folder for 'Tarmeem sign in code' with code 123456.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
