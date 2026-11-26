from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp, portable across SQLite and server databases."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # Second sign in step chosen by an administrator: captcha | email_otp | authenticator
    mfa_method: Mapped[str] = mapped_column(String(20), default="captcha", server_default="captcha")
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_last_step: Mapped[int] = mapped_column(Integer, default=0)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    session_version: Mapped[int] = mapped_column(Integer, default=1)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class LoginCode(Base):
    __tablename__ = "login_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    invalid: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    uploaded_by: Mapped["User | None"] = relationship()


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    emirates_id: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batches.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class SickLeave(Base):
    __tablename__ = "sick_leaves"

    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(10))
    file_size: Mapped[int] = mapped_column(Integer)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    extracted_text: Mapped[str] = mapped_column(Text, default="")
    extraction_method: Mapped[str] = mapped_column(String(10), default="text", server_default="text")
    ext_patient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ext_emirates_id: Mapped[str | None] = mapped_column(String(15), nullable=True)
    ext_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ext_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ext_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ext_facility: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ext_doctor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ext_certificate_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ext_issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True, index=True)
    match_method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="not_verified", index=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    customer: Mapped["Customer | None"] = relationship()
    uploaded_by: Mapped["User | None"] = relationship(foreign_keys=[uploaded_by_id])
    verified_by: Mapped["User | None"] = relationship(foreign_keys=[verified_by_id])


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    sick_leave_id: Mapped[int] = mapped_column(ForeignKey("sick_leaves.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    code_hash: Mapped[str] = mapped_column(String(128))
    sent_to: Mapped[str] = mapped_column(String(255))
    channel: Mapped[str] = mapped_column(String(16), default="email")
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    user: Mapped["User | None"] = relationship()
