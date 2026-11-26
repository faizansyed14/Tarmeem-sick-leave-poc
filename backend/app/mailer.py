"""Email delivery.

SMTP (for example Gmail) is used when SMTP_EMAIL and SMTP_PASSWORD are set,
otherwise Microsoft Graph when the GRAPH_* values are set.
"""

import logging
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape

import httpx

from .config import settings

log = logging.getLogger("tarmeem.mail")

_token: dict = {"value": None, "exp": 0.0}
_lock = threading.Lock()


class MailError(Exception):
    pass


def _graph_token() -> str:
    with _lock:
        if _token["value"] and _token["exp"] - 60 > time.time():
            return _token["value"]
        try:
            resp = httpx.post(
                f"https://login.microsoftonline.com/{settings.graph_tenant_id}/oauth2/v2.0/token",
                data={
                    "client_id": settings.graph_client_id,
                    "client_secret": settings.graph_client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                    "grant_type": "client_credentials",
                },
                timeout=15,
            )
        except httpx.HTTPError as exc:
            raise MailError("Could not reach Microsoft 365. Check the server's internet access.") from exc
        if resp.status_code != 200:
            log.error("Graph token request failed: %s %s", resp.status_code, resp.text[:300])
            raise MailError("Could not authenticate with Microsoft 365. Check the Graph tenant ID, client ID and secret.")
        data = resp.json()
        _token["value"] = data["access_token"]
        _token["exp"] = time.time() + int(data.get("expires_in", 3600))
        return _token["value"]


def _send_smtp(to: str, subject: str, html: str, text: str) -> None:
    host, port, sender = settings.smtp_host, settings.smtp_port, settings.smtp_email.strip()
    # Google shows app passwords as four groups with spaces
    password = settings.smtp_password.replace(" ", "")

    msg = EmailMessage()
    msg["From"] = formataddr(("Tarmeem Hospital", sender))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=sender.split("@")[-1])
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    try:
        if port == 465:
            connection = smtplib.SMTP_SSL(host, port, timeout=10, context=context)
        else:
            connection = smtplib.SMTP(host, port, timeout=10)
    except (OSError, smtplib.SMTPException) as exc:
        log.error("Cannot connect to %s:%s: %s", host, port, exc)
        raise MailError(
            f"Cannot connect to {host} on port {port}. This network may be blocking outgoing email. Try another network."
        ) from exc

    try:
        with connection as smtp:
            if port != 465:
                smtp.starttls(context=context)
            smtp.login(sender, password)
            smtp.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        log.error("SMTP sign in failed for %s: %s", sender, exc)
        raise MailError(
            "The email server rejected the sign in. For Gmail, use a 16 character app password, not the account password."
        ) from exc
    except smtplib.SMTPRecipientsRefused as exc:
        log.error("SMTP recipient refused %s: %s", to, exc)
        raise MailError("The email server rejected the recipient address.") from exc
    except (OSError, smtplib.SMTPException) as exc:
        log.error("SMTP send to %s failed: %s", to, exc)
        raise MailError("The email could not be sent. Check the SMTP settings and try again.") from exc
    log.info("Email sent to %s via SMTP", to)


def send_mail(to: str, subject: str, html: str, text: str = "") -> None:
    if not settings.mail_enabled:
        if settings.otp_dev_mode:
            log.warning("Email delivery not configured. Email to %s not sent (dev mode). Subject: %s", to, subject)
            return
        raise MailError("Email delivery is not configured. Add the SMTP settings to .env.")
    if settings.smtp_enabled:
        _send_smtp(to, subject, html, text or subject)
        return

    token = _graph_token()
    try:
        resp = httpx.post(
            f"https://graph.microsoft.com/v1.0/users/{settings.graph_sender}/sendMail",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "message": {
                    "subject": subject,
                    "body": {"contentType": "HTML", "content": html},
                    "toRecipients": [{"emailAddress": {"address": to}}],
                },
                "saveToSentItems": False,
            },
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise MailError("Could not reach Microsoft 365. Check the server's internet access.") from exc
    if resp.status_code not in (200, 202):
        log.error("Graph sendMail failed: %s %s", resp.status_code, resp.text[:300])
        raise MailError("Microsoft 365 rejected the email. Check the sender mailbox and Mail.Send permission.")
    log.info("Email sent to %s via Microsoft Graph", to)


def _layout(heading: str, intro: str, code: str, footer: str) -> str:
    digits = "".join(
        f'<td style="padding:0 4px"><div style="width:40px;height:48px;line-height:48px;border:1px solid #D6D3CD;'
        f'border-radius:8px;font-size:22px;font-weight:600;color:#14201F;text-align:center;background:#FFFFFF">{d}</div></td>'
        for d in code
    )
    return f"""<!doctype html><html><body style="margin:0;background:#F5F4F0;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E6E3DC;border-radius:14px">
<tr><td style="padding:28px 32px 8px">
<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0F5C55;font-weight:600">Tarmeem Hospital</div>
<h1 style="margin:14px 0 8px;font-size:20px;color:#14201F;font-weight:600">{escape(heading)}</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#57534E">{intro}</p>
<table cellpadding="0" cellspacing="0"><tr>{digits}</tr></table>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#78716C">{footer}</p>
</td></tr>
<tr><td style="padding:20px 32px 26px;border-top:1px solid #EFEDE8;margin-top:20px;font-size:12px;color:#A8A29E">
Tarmeem Hospital, Abu Dhabi, United Arab Emirates. This is an automated message, please do not reply.
</td></tr></table></td></tr></table></body></html>"""


def send_customer_otp(to: str, name: str, code: str, minutes: int, reference: str) -> None:
    html = _layout(
        "Confirm your sick leave certificate",
        f"Dear {escape(name)}, a member of the Tarmeem Hospital team is verifying the sick leave certificate "
        f"<strong>{escape(reference)}</strong> issued in your name. When they call you, please read out the code below.",
        code,
        f"This code expires in {minutes} minutes. Tarmeem staff will never ask for your password. "
        "If you did not expect this message, you can ignore it.",
    )
    text = (
        f"Dear {name}, Tarmeem Hospital is verifying sick leave certificate {reference} issued in your name. "
        f"Your verification code is {code}. It expires in {minutes} minutes."
    )
    send_mail(to, f"Your Tarmeem verification code is {code}", html, text)


def send_login_code(to: str, name: str, code: str, minutes: int) -> None:
    html = _layout(
        "Your sign in code",
        f"Hello {escape(name)}, use the code below to finish signing in to Tarmeem Leave Verification.",
        code,
        f"This code expires in {minutes} minutes. If you did not try to sign in, contact your administrator.",
    )
    text = f"Hello {name}, your Tarmeem sign in code is {code}. It expires in {minutes} minutes."
    send_mail(to, "Tarmeem sign in code", html, text)
