from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import audit, require_admin
from ..models import User
from ..normalize import EMAIL_RE
from ..security import generate_password, hash_password, password_problems
from ..serializers import user_out

router = APIRouter(prefix="/api/users", tags=["users"])

ROLES = ("user", "admin")
METHOD_LABELS = {"captcha": "captcha", "email_otp": "email OTP", "authenticator": "authenticator app"}


class UserCreate(BaseModel):
    email: str = Field(max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    role: str = Field(default="user", pattern="^(user|admin)$")
    mfa_method: str = Field(default="captcha", pattern="^(captcha|email_otp|authenticator)$")
    password: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: str | None = Field(default=None, pattern="^(user|admin)$")
    is_active: bool | None = None
    mfa_method: str | None = Field(default=None, pattern="^(captcha|email_otp|authenticator)$")


class ResetPassword(BaseModel):
    password: str | None = None


def _get(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found.")
    return user


def _is_bootstrap(user: User) -> bool:
    return user.email.lower() == settings.admin_email.lower()


@router.get("")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return {"items": [user_out(u) for u in users]}


@router.post("", status_code=201)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "A user with this email already exists.")
    generated = not body.password
    password = body.password or generate_password()
    if not generated:
        problems = password_problems(password)
        if problems:
            raise HTTPException(422, "The password needs " + ", ".join(problems) + ".")
    user = User(
        email=email,
        full_name=body.full_name.strip(),
        role=body.role,
        mfa_method=body.mfa_method,
        password_hash=hash_password(password),
        must_change_password=True,
        created_by_id=admin.id,
    )
    db.add(user)
    db.flush()
    audit(db, admin, "user_created", "user", user.id, f"{user.full_name} ({user.role}, {METHOD_LABELS[user.mfa_method]})", request)
    db.commit()
    return {"user": user_out(user), "temporary_password": password}


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdate, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = _get(db, user_id)
    if (body.role and body.role != user.role) or body.is_active is False:
        if user.id == admin.id:
            raise HTTPException(409, "You cannot change your own role or deactivate your own account.")
        if _is_bootstrap(user):
            raise HTTPException(409, "The bootstrap administrator is managed in the server .env file.")
    changes = []
    if body.full_name and body.full_name.strip() != user.full_name:
        user.full_name = body.full_name.strip()
        changes.append("name")
    if body.role and body.role != user.role:
        user.role = body.role
        user.session_version += 1
        changes.append(f"role to {body.role}")
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        user.session_version += 1
        changes.append("activated" if body.is_active else "deactivated")
    if body.mfa_method and body.mfa_method != user.mfa_method:
        user.mfa_method = body.mfa_method
        changes.append(f"sign in step to {METHOD_LABELS[body.mfa_method]}")
    if changes:
        audit(db, admin, "user_updated", "user", user.id, f"{user.full_name}: {', '.join(changes)}", request)
    db.commit()
    return {"user": user_out(user)}


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetPassword, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = _get(db, user_id)
    if _is_bootstrap(user):
        raise HTTPException(409, "The bootstrap administrator password is managed in the server .env file.")
    password = body.password or generate_password()
    if body.password:
        problems = password_problems(password)
        if problems:
            raise HTTPException(422, "The password needs " + ", ".join(problems) + ".")
    user.password_hash = hash_password(password)
    user.must_change_password = True
    user.session_version += 1
    user.failed_attempts = 0
    user.locked_until = None
    audit(db, admin, "password_reset", "user", user.id, user.full_name, request)
    db.commit()
    return {"user": user_out(user), "temporary_password": password}


@router.post("/{user_id}/reset-mfa")
def reset_mfa(user_id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = _get(db, user_id)
    user.totp_enabled = False
    user.totp_secret = None
    user.locked_until = None
    user.failed_attempts = 0
    audit(db, admin, "mfa_reset", "user", user.id, user.full_name, request)
    db.commit()
    return {"user": user_out(user)}
