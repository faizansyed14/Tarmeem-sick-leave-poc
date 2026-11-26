"""Sign in.

Step 1: email and password.
Step 2: the second step an administrator assigned to the user (User.mfa_method):
    captcha        type the characters shown in an image
    email_otp      6 digit code sent by email
    authenticator  6 digit code from Microsoft Authenticator (TOTP). Users who
                   have not connected the app yet scan a QR code during sign in.
"""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import captcha, mailer
from ..config import settings
from ..database import get_db
from ..deps import audit, get_current_user
from ..models import LoginCode, User, utcnow
from ..security import (
    COOKIE_NAME,
    code_matches,
    create_token,
    decode_token,
    generate_code,
    hash_code,
    hash_password,
    mask_email,
    new_totp_secret,
    password_problems,
    totp_uri,
    verify_password,
    verify_totp,
)
from ..serializers import user_out

log = logging.getLogger("tarmeem.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

MFA_METHODS = ("captcha", "email_otp", "authenticator")
MFA_LABELS = {"captcha": "captcha", "email_otp": "email code", "authenticator": "authenticator app"}
MAX_FAILED = 5
LOCK_MINUTES = 15
LOGIN_CODE_MINUTES = 5


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=256)


class PreauthIn(BaseModel):
    preauth_token: str


class MfaVerifyIn(PreauthIn):
    code: str | None = Field(default=None, max_length=8)
    captcha_id: str | None = None
    captcha_answer: str | None = Field(default=None, max_length=12)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


def _register_failure(db: Session, user: User, request: Request, reason: str) -> None:
    user.failed_attempts += 1
    if user.failed_attempts >= MAX_FAILED:
        user.locked_until = utcnow() + timedelta(minutes=LOCK_MINUTES)
        user.failed_attempts = 0
        audit(db, user, "account_locked", "user", user.id, reason, request)
    audit(db, user, "login_failed", "user", user.id, reason, request)
    db.commit()


def _check_lock(user: User) -> None:
    if user.locked_until and user.locked_until > utcnow():
        minutes = max(1, int((user.locked_until - utcnow()).total_seconds() // 60) + 1)
        raise HTTPException(423, f"This account is temporarily locked after several failed attempts. Try again in {minutes} minutes.")


def _preauth_user(token: str, db: Session) -> User:
    payload = decode_token(token, "preauth")
    user = db.get(User, int(payload["sub"])) if payload else None
    if not user or not user.is_active or payload.get("sv") != user.session_version:
        raise HTTPException(401, "Your sign in attempt expired. Please start again.")
    _check_lock(user)
    return user


def _set_session(response: Response, user: User) -> None:
    token = create_token(user.id, "access", settings.access_token_minutes, user.session_version)
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.access_token_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )


@router.get("/captcha")
def get_captcha():
    cid, svg = captcha.create()
    return {"captcha_id": cid, "svg": svg}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.strip().lower()))
    if user:
        _check_lock(user)
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        if user:
            _register_failure(db, user, request, "password")
        raise HTTPException(401, "The email or password is incorrect.")

    user.failed_attempts = 0
    db.commit()
    method = user.mfa_method if user.mfa_method in MFA_METHODS else "captcha"
    return {
        "preauth_token": create_token(user.id, "preauth", 10, user.session_version),
        "method": method,
        "needs_enrollment": method == "authenticator" and not user.totp_enabled,
        "email_hint": mask_email(user.email),
        "first_name": user.full_name.split()[0] if user.full_name else "",
    }


@router.post("/mfa/email")
def send_login_code(body: PreauthIn, db: Session = Depends(get_db)):
    user = _preauth_user(body.preauth_token, db)
    if user.mfa_method != "email_otp":
        raise HTTPException(400, "Email codes are not enabled for this account.")
    now = utcnow()
    last = db.scalar(select(LoginCode).where(LoginCode.user_id == user.id).order_by(LoginCode.id.desc()).limit(1))
    if last and (now - last.created_at).total_seconds() < settings.otp_resend_cooldown_seconds:
        wait = settings.otp_resend_cooldown_seconds - int((now - last.created_at).total_seconds())
        raise HTTPException(429, f"Please wait {wait} seconds before requesting another code.")

    db.execute(update(LoginCode).where(LoginCode.user_id == user.id, LoginCode.consumed_at.is_(None)).values(consumed_at=now))
    code = generate_code()
    db.add(LoginCode(user_id=user.id, code_hash=hash_code("login", user.id, code), expires_at=now + timedelta(minutes=LOGIN_CODE_MINUTES), created_at=now))
    try:
        mailer.send_login_code(user.email, user.full_name, code, LOGIN_CODE_MINUTES)
    except mailer.MailError as exc:
        db.rollback()
        raise HTTPException(502, str(exc))
    db.commit()

    result = {"sent_to": mask_email(user.email), "expires_in": LOGIN_CODE_MINUTES * 60}
    if settings.expose_dev_codes:
        log.warning("DEV MODE sign in code for %s: %s", user.email, code)
        result["dev_code"] = code
    return result


@router.post("/mfa/authenticator/setup")
def authenticator_setup(body: PreauthIn, db: Session = Depends(get_db)):
    """First sign in for a user assigned to the authenticator method: returns a new secret to scan."""
    user = _preauth_user(body.preauth_token, db)
    if user.mfa_method != "authenticator":
        raise HTTPException(400, "The authenticator app is not enabled for this account.")
    if user.totp_enabled:
        raise HTTPException(409, "An authenticator app is already connected. Ask an administrator to reset it.")
    user.totp_secret = new_totp_secret()
    db.commit()
    return {"secret": user.totp_secret, "otpauth_url": totp_uri(user.totp_secret, user.email)}


@router.post("/mfa/verify")
def verify_mfa(body: MfaVerifyIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = _preauth_user(body.preauth_token, db)
    method = user.mfa_method if user.mfa_method in MFA_METHODS else "captcha"
    code = (body.code or "").strip()
    ok = False
    enrolled_now = False

    if method == "captcha":
        if not body.captcha_id or not body.captcha_answer:
            raise HTTPException(400, "Type the characters shown in the image.")
        ok = captcha.verify(body.captcha_id, body.captcha_answer)
        if not ok:
            _register_failure(db, user, request, "mfa_captcha")
            raise HTTPException(400, "The characters did not match the image. A new image has been loaded.")

    elif method == "authenticator":
        if not user.totp_secret:
            raise HTTPException(400, "Set up the authenticator app first.")
        step = verify_totp(user.totp_secret, code, user.totp_last_step)
        if step:
            user.totp_last_step = step
            if not user.totp_enabled:
                user.totp_enabled = True
                enrolled_now = True
            ok = True

    else:  # email_otp
        lc = db.scalar(
            select(LoginCode)
            .where(LoginCode.user_id == user.id, LoginCode.consumed_at.is_(None))
            .order_by(LoginCode.id.desc())
            .limit(1)
        )
        if not lc:
            raise HTTPException(400, "Request a new email code to continue.")
        if lc.expires_at <= utcnow():
            raise HTTPException(410, "This code has expired. Request a new one.")
        lc.attempts += 1
        if code_matches("login", user.id, code, lc.code_hash):
            lc.consumed_at = utcnow()
            ok = True
        elif lc.attempts >= settings.otp_max_attempts:
            lc.consumed_at = utcnow()

    if not ok:
        _register_failure(db, user, request, f"mfa_{method}")
        raise HTTPException(400, "That code is not valid. Check it and try again.")

    user.failed_attempts = 0
    user.last_login_at = utcnow()
    if enrolled_now:
        audit(db, user, "mfa_enabled", "user", user.id, "Authenticator app connected at sign in", request)
    audit(db, user, "login", "user", user.id, f"Signed in with {MFA_LABELS[method]}", request)
    db.commit()
    _set_session(response, user)
    return {"user": user_out(user)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user_out(user), "otp_dev_mode": settings.expose_dev_codes, "mail_enabled": settings.mail_enabled}


@router.post("/password")
def change_password(
    body: ChangePasswordIn, request: Request, response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if user.email.lower() == settings.admin_email.lower():
        raise HTTPException(409, "The bootstrap administrator password is managed in the server .env file.")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "The current password is incorrect.")
    problems = password_problems(body.new_password)
    if problems:
        raise HTTPException(422, "The new password needs " + ", ".join(problems) + ".")
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(422, "Choose a password different from the current one.")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    user.session_version += 1
    audit(db, user, "password_changed", "user", user.id, None, request)
    db.commit()
    _set_session(response, user)
    return {"user": user_out(user)}
