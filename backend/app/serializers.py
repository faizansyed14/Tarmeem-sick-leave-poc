from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import Customer, OtpChallenge, SickLeave, User, utcnow
from .normalize import format_eid, format_phone
from .security import mask_email


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds") + "Z"
    return value.isoformat()


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "mfa_method": u.mfa_method,
        "totp_enabled": u.totp_enabled,
        "must_change_password": u.must_change_password,
        "last_login_at": iso(u.last_login_at),
        "created_at": iso(u.created_at),
    }


def customer_out(c: Customer) -> dict:
    return {
        "id": c.id,
        "emirates_id": format_eid(c.emirates_id),
        "full_name": c.full_name,
        "email": c.email,
        "phone": format_phone(c.phone),
        "created_at": iso(c.created_at),
        "updated_at": iso(c.updated_at),
    }


def latest_challenge(db: Session, leave_id: int) -> OtpChallenge | None:
    return db.scalar(
        select(OtpChallenge).where(OtpChallenge.sick_leave_id == leave_id).order_by(OtpChallenge.id.desc()).limit(1)
    )


def otp_state(ch: OtpChallenge | None) -> dict | None:
    if not ch:
        return None
    now = utcnow()
    expired = ch.expires_at <= now
    locked = ch.attempts >= settings.otp_max_attempts
    active = not ch.consumed_at and not expired and not locked
    resend_at = ch.created_at.timestamp() + settings.otp_resend_cooldown_seconds
    return {
        "sent_to": mask_email(ch.sent_to),
        "sent_at": iso(ch.created_at),
        "expires_at": iso(ch.expires_at),
        "active": active,
        "expired": expired and not ch.consumed_at,
        "locked": locked and not ch.consumed_at,
        "verified": ch.verified,
        "attempts_remaining": max(settings.otp_max_attempts - ch.attempts, 0),
        "resend_available_in": max(int(resend_at - now.timestamp()), 0),
    }


def display_status(leave: SickLeave, otp: dict | None) -> str:
    if leave.status == "verified":
        return "verified"
    if otp and otp["active"]:
        return "awaiting_otp"
    return "not_verified"


def leave_summary(db: Session, leave: SickLeave) -> dict:
    otp = otp_state(latest_challenge(db, leave.id))
    return {
        "id": leave.id,
        "reference": leave.reference,
        "original_filename": leave.original_filename,
        "file_type": leave.file_type,
        "patient_name": leave.ext_patient_name,
        "emirates_id": format_eid(leave.ext_emirates_id),
        "start_date": iso(leave.ext_start_date),
        "end_date": iso(leave.ext_end_date),
        "days": leave.ext_days,
        "customer": customer_out(leave.customer) if leave.customer else None,
        "status": display_status(leave, otp),
        "uploaded_by": leave.uploaded_by.full_name if leave.uploaded_by else None,
        "created_at": iso(leave.created_at),
        "verified_at": iso(leave.verified_at),
    }


def leave_detail(db: Session, leave: SickLeave, candidates: list[dict] | None = None) -> dict:
    otp = otp_state(latest_challenge(db, leave.id))
    data = leave_summary(db, leave)
    data.update(
        {
            "file_size": leave.file_size,
            "extracted": {
                "patient_name": leave.ext_patient_name,
                "emirates_id": format_eid(leave.ext_emirates_id),
                "start_date": iso(leave.ext_start_date),
                "end_date": iso(leave.ext_end_date),
                "days": leave.ext_days,
                "facility": leave.ext_facility,
                "doctor": leave.ext_doctor,
                "certificate_no": leave.ext_certificate_no,
                "issue_date": iso(leave.ext_issue_date),
            },
            "text_preview": (leave.extracted_text or "")[:4000],
            "extraction_method": leave.extraction_method,
            "match_method": leave.match_method,
            "match_score": leave.match_score,
            "verified_by": leave.verified_by.full_name if leave.verified_by else None,
            "otp": otp,
            "candidates": [
                {
                    "customer": customer_out(c["customer"]),
                    "score": c["score"],
                    "method": c["method"],
                    "note": c["note"],
                }
                for c in (candidates or [])
            ],
        }
    )
    return data
