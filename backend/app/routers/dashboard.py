from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_admin
from ..models import AuditLog, Customer, OtpChallenge, SickLeave, User, utcnow
from ..serializers import iso, leave_summary

router = APIRouter(prefix="/api", tags=["overview"])


def _activity(entries) -> list[dict]:
    return [
        {
            "id": a.id,
            "action": a.action,
            "entity": a.entity,
            "entity_id": a.entity_id,
            "detail": a.detail,
            "user": a.user.full_name if a.user else None,
            "ip_address": a.ip_address,
            "created_at": iso(a.created_at),
        }
        for a in entries
    ]


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    now = utcnow()
    count = lambda stmt: db.scalar(select(func.count()).select_from(stmt.subquery())) or 0  # noqa: E731

    total = count(select(SickLeave.id))
    verified = count(select(SickLeave.id).where(SickLeave.status == "verified"))
    awaiting = count(
        select(OtpChallenge.sick_leave_id)
        .where(OtpChallenge.consumed_at.is_(None), OtpChallenge.expires_at > now, OtpChallenge.attempts < settings.otp_max_attempts)
        .distinct()
    )
    unmatched = count(select(SickLeave.id).where(SickLeave.customer_id.is_(None), SickLeave.status != "verified"))
    week_ago = now - timedelta(days=7)
    this_week = count(select(SickLeave.id).where(SickLeave.created_at >= week_ago))
    verified_week = count(select(SickLeave.id).where(SickLeave.verified_at >= week_ago))
    customers = count(select(Customer.id))

    recent = db.scalars(select(SickLeave).order_by(SickLeave.id.desc()).limit(6)).all()
    activity_stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(8)
    if user.role != "admin":
        activity_stmt = activity_stmt.where(AuditLog.user_id == user.id)

    return {
        "stats": {
            "total": total,
            "verified": verified,
            "not_verified": total - verified,
            "awaiting_otp": awaiting,
            "unmatched": unmatched,
            "uploaded_this_week": this_week,
            "verified_this_week": verified_week,
            "customers": customers,
        },
        "recent": [leave_summary(db, r) for r in recent],
        "activity": _activity(db.scalars(activity_stmt).all()),
    }


@router.get("/audit")
def audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": _activity(rows), "total": total, "page": page, "page_size": page_size}
