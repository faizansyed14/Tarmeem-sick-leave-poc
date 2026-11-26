import logging
import uuid
from datetime import timedelta

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from .. import mailer
from ..config import settings
from ..database import get_db
from ..deps import audit, get_current_user
from ..extraction import ExtractionError, extract_document, parse_certificate
from ..matching import find_candidates, name_similarity, pick_auto_match
from ..models import Customer, OtpChallenge, SickLeave, User, utcnow
from ..normalize import format_eid, normalize_eid
from ..security import code_matches, generate_code, hash_code, mask_email
from ..serializers import latest_challenge, leave_detail, leave_summary, otp_state

log = logging.getLogger("tarmeem.leaves")
router = APIRouter(prefix="/api/leaves", tags=["sick leave"])

ALLOWED = {
    "pdf": (b"%PDF",),
    "docx": (b"PK\x03\x04",),
}

MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class LinkIn(BaseModel):
    customer_id: int
    confirm_mismatch: bool = False


class VerifyIn(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class SheetIn(BaseModel):
    confirm_mismatch: bool = False


class FieldsIn(BaseModel):
    patient_name: str | None = Field(default=None, max_length=255)
    emirates_id: str | None = Field(default=None, max_length=32)


def _get(db: Session, leave_id: int) -> SickLeave:
    leave = db.get(SickLeave, leave_id)
    if not leave:
        raise HTTPException(404, "Sick leave record not found.")
    return leave


def _candidates(db: Session, leave: SickLeave) -> list[dict]:
    return find_candidates(db, leave.ext_emirates_id, leave.ext_patient_name)


@router.post("/upload", status_code=201)
async def upload(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    name = file.filename or "certificate"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED:
        raise HTTPException(415, "Upload the certificate as a PDF or Word (.docx) file.")
    limit = settings.max_upload_mb * 1024 * 1024
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, f"The file is larger than {settings.max_upload_mb} MB.")
    if not content.startswith(ALLOWED[ext]):
        raise HTTPException(415, "The file content does not match its extension.")

    folder = settings.upload_dir / "leaves"
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}.{ext}"
    path = folder / stored
    path.write_bytes(content)

    try:
        text, method = await run_in_threadpool(extract_document, path, ext)
    except ExtractionError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(422, str(exc))

    fields = parse_certificate(text)
    leave = SickLeave(
        original_filename=name[:255],
        stored_filename=stored,
        file_type=ext,
        file_size=len(content),
        uploaded_by_id=user.id,
        extracted_text=text[:50000],
        extraction_method=method,
        ext_patient_name=fields["patient_name"],
        ext_emirates_id=fields["emirates_id"],
        ext_start_date=fields["start_date"],
        ext_end_date=fields["end_date"],
        ext_days=fields["days"],
        ext_facility=fields["facility"],
        ext_doctor=fields["doctor"],
        ext_certificate_no=fields["certificate_no"],
        ext_issue_date=fields["issue_date"],
    )
    db.add(leave)
    db.flush()
    leave.reference = f"SL-{utcnow():%y%m}-{leave.id:05d}"

    candidates = _candidates(db, leave)
    auto = pick_auto_match(candidates, leave.ext_emirates_id)
    if auto:
        leave.customer_id = auto["customer"].id
        leave.customer = auto["customer"]
        leave.match_method = auto["method"]
        leave.match_score = auto["score"]

    audit(db, user, "leave_uploaded", "sick_leave", leave.id, f"{leave.reference} {name}", request)
    db.commit()
    db.refresh(leave)
    return leave_detail(db, leave, candidates)


@router.get("")
def list_leaves(
    status: str = Query("open", pattern="^(open|all|verified|not_verified|awaiting_otp)$"),
    q: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = filtered_leaves(status, q)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(SickLeave.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [leave_summary(db, r) for r in rows], "total": total, "page": page, "page_size": page_size}


def filtered_leaves(status: str, q: str):
    """Sick leave query for a status filter and search term. Shared by the list and the export."""
    stmt = select(SickLeave).outerjoin(Customer, SickLeave.customer_id == Customer.id)
    if status == "open":
        stmt = stmt.where(SickLeave.status != "verified")
    elif status == "verified":
        stmt = stmt.where(SickLeave.status == "verified")
    elif status in ("not_verified", "awaiting_otp"):
        now = utcnow()
        active = (
            select(OtpChallenge.sick_leave_id)
            .where(
                OtpChallenge.consumed_at.is_(None),
                OtpChallenge.expires_at > now,
                OtpChallenge.attempts < settings.otp_max_attempts,
            )
        )
        stmt = stmt.where(SickLeave.status != "verified")
        stmt = stmt.where(SickLeave.id.in_(active) if status == "awaiting_otp" else SickLeave.id.not_in(active))
    term = q.strip()
    if term:
        like = f"%{term.lower()}%"
        digits = "".join(ch for ch in term if ch.isdigit())
        conds = [
            func.lower(SickLeave.reference).like(like),
            func.lower(SickLeave.ext_patient_name).like(like),
            func.lower(Customer.full_name).like(like),
            func.lower(SickLeave.original_filename).like(like),
        ]
        if len(digits) >= 3:
            conds += [SickLeave.ext_emirates_id.like(f"%{digits}%"), Customer.emirates_id.like(f"%{digits}%")]
        stmt = stmt.where(or_(*conds))
    return stmt


@router.get("/{leave_id}")
def get_leave(leave_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    leave = _get(db, leave_id)
    return leave_detail(db, leave, _candidates(db, leave))


@router.get("/{leave_id}/file")
def get_file(leave_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    leave = _get(db, leave_id)
    path = settings.upload_dir / "leaves" / leave.stored_filename
    if not path.exists():
        raise HTTPException(404, "The original file is no longer available.")
    disposition = "inline" if leave.file_type == "pdf" else "attachment"
    return FileResponse(path, media_type=MEDIA_TYPES[leave.file_type], filename=leave.original_filename, content_disposition_type=disposition)


@router.patch("/{leave_id}/fields")
def correct_fields(leave_id: int, body: FieldsIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Lets staff correct the extracted name or Emirates ID and rerun matching."""
    leave = _get(db, leave_id)
    if leave.status == "verified":
        raise HTTPException(409, "Verified records cannot be changed.")
    if body.emirates_id is not None:
        eid = normalize_eid(body.emirates_id) if body.emirates_id.strip() else None
        if body.emirates_id.strip() and not eid:
            raise HTTPException(422, "Emirates ID must be 15 digits starting with 784.")
        leave.ext_emirates_id = eid
    if body.patient_name is not None:
        leave.ext_patient_name = body.patient_name.strip() or None
    audit(db, user, "leave_fields_corrected", "sick_leave", leave.id, leave.reference, request)
    db.commit()
    return leave_detail(db, leave, _candidates(db, leave))


@router.post("/{leave_id}/link")
def link_customer(leave_id: int, body: LinkIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    leave = _get(db, leave_id)
    if leave.status == "verified":
        raise HTTPException(409, "This record is already verified and its customer cannot be changed.")
    customer = db.get(Customer, body.customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found.")
    mismatch = bool(leave.ext_emirates_id and leave.ext_emirates_id != customer.emirates_id)
    if mismatch and not body.confirm_mismatch:
        raise HTTPException(
            409,
            f"The certificate Emirates ID {format_eid(leave.ext_emirates_id)} does not match "
            f"{customer.full_name} ({format_eid(customer.emirates_id)}). Confirm to link anyway.",
        )
    if leave.customer_id != customer.id:
        # A new customer invalidates any outstanding code.
        db.execute(
            update(OtpChallenge)
            .where(OtpChallenge.sick_leave_id == leave.id, OtpChallenge.consumed_at.is_(None))
            .values(consumed_at=utcnow())
        )
    leave.customer_id = customer.id
    leave.customer = customer
    if leave.ext_emirates_id and leave.ext_emirates_id == customer.emirates_id:
        leave.match_method, leave.match_score = "emirates_id", 100.0
    else:
        leave.match_method = "manual"
        leave.match_score = round(name_similarity(leave.ext_patient_name, customer.full_name), 1) if leave.ext_patient_name else None
    detail = f"{leave.reference} linked to {customer.full_name} ({format_eid(customer.emirates_id)})"
    if mismatch:
        detail += f", overriding certificate Emirates ID {format_eid(leave.ext_emirates_id)}"
    audit(db, user, "leave_linked", "sick_leave", leave.id, detail, request)
    db.commit()
    return leave_detail(db, leave, _candidates(db, leave))


@router.post("/{leave_id}/unlink")
def unlink_customer(leave_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    leave = _get(db, leave_id)
    if leave.status == "verified":
        raise HTTPException(409, "This record is already verified.")
    db.execute(
        update(OtpChallenge).where(OtpChallenge.sick_leave_id == leave.id, OtpChallenge.consumed_at.is_(None)).values(consumed_at=utcnow())
    )
    leave.customer_id, leave.customer, leave.match_method, leave.match_score = None, None, None, None
    audit(db, user, "leave_unlinked", "sick_leave", leave.id, leave.reference, request)
    db.commit()
    return leave_detail(db, leave, _candidates(db, leave))


@router.post("/{leave_id}/otp/send")
def send_otp(leave_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    leave = _get(db, leave_id)
    if leave.status == "verified":
        raise HTTPException(409, "This certificate is already verified.")
    customer = leave.customer
    if not customer:
        raise HTTPException(400, "Link this certificate to a customer before sending a code.")
    if not customer.email:
        raise HTTPException(400, "This customer has no email address on file. Update the customer register and import again.")

    now = utcnow()
    last = latest_challenge(db, leave.id)
    if last and not last.verified:
        elapsed = (now - last.created_at).total_seconds()
        if elapsed < settings.otp_resend_cooldown_seconds:
            raise HTTPException(429, f"Please wait {int(settings.otp_resend_cooldown_seconds - elapsed)} seconds before sending another code.")

    db.execute(
        update(OtpChallenge).where(OtpChallenge.sick_leave_id == leave.id, OtpChallenge.consumed_at.is_(None)).values(consumed_at=now)
    )
    code = generate_code()
    ch = OtpChallenge(
        sick_leave_id=leave.id,
        customer_id=customer.id,
        code_hash="pending",
        sent_to=customer.email,
        expires_at=now + timedelta(seconds=settings.otp_ttl_seconds),
        sent_by_id=user.id,
        created_at=now,
    )
    db.add(ch)
    db.flush()
    ch.code_hash = hash_code("leave", ch.id, code)

    try:
        mailer.send_customer_otp(customer.email, customer.full_name, code, settings.otp_ttl_seconds // 60, leave.reference or "")
    except mailer.MailError as exc:
        db.rollback()
        raise HTTPException(502, str(exc))

    is_resend = last is not None
    audit(
        db, user, "otp_resent" if is_resend else "otp_sent", "sick_leave", leave.id,
        f"{leave.reference} code sent to {mask_email(customer.email)}", request,
    )
    db.commit()

    result = leave_detail(db, leave, _candidates(db, leave))
    if settings.expose_dev_codes:
        log.warning("DEV MODE customer OTP for %s (%s): %s", leave.reference, customer.email, code)
        result["dev_code"] = code
    return result


@router.post("/{leave_id}/otp/verify")
def verify_otp(leave_id: int, body: VerifyIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    leave = _get(db, leave_id)
    if leave.status == "verified":
        raise HTTPException(409, "This certificate is already verified.")
    ch = latest_challenge(db, leave.id)
    if not ch or ch.consumed_at:
        raise HTTPException(400, "There is no active code. Send a new code to the customer.")
    if ch.expires_at <= utcnow():
        raise HTTPException(410, "The code has expired. Send a new code to the customer.")
    if ch.attempts >= settings.otp_max_attempts:
        raise HTTPException(429, "Too many incorrect attempts. Send a new code to the customer.")

    ch.attempts += 1
    if not code_matches("leave", ch.id, body.code, ch.code_hash):
        remaining = settings.otp_max_attempts - ch.attempts
        audit(db, user, "otp_failed", "sick_leave", leave.id, f"{leave.reference} incorrect code, {remaining} attempts left", request)
        db.commit()
        if remaining <= 0:
            raise HTTPException(429, "Too many incorrect attempts. Send a new code to the customer.")
        raise HTTPException(400, f"The code is incorrect. {remaining} {'attempt' if remaining == 1 else 'attempts'} left.")

    now = utcnow()
    ch.consumed_at = now
    ch.verified = True
    leave.status = "verified"
    leave.verified_at = now
    leave.verified_by_id = user.id
    audit(db, user, "leave_verified", "sick_leave", leave.id, f"{leave.reference} verified with customer {leave.customer.full_name}", request)
    db.commit()
    db.refresh(leave)
    return leave_detail(db, leave, [])


@router.post("/{leave_id}/sheet/send")
def send_sheet(leave_id: int, body: SheetIn, request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Emails the uploaded certificate to the address that confirmed the verification code."""
    leave = _get(db, leave_id)
    ch = latest_challenge(db, leave.id)
    if leave.status != "verified" or not ch or not ch.verified:
        raise HTTPException(409, "The sheet can only be sent after the certificate is verified.")
    if not settings.mail_enabled:
        raise HTTPException(400, "Email delivery is not configured, so the sheet cannot be sent. Add the SMTP settings to .env.")
    customer = leave.customer
    if leave.ext_emirates_id and leave.ext_emirates_id != customer.emirates_id and not body.confirm_mismatch:
        raise HTTPException(409, "The certificate Emirates ID does not match this customer. Confirm to send it anyway.")
    path = settings.upload_dir / "leaves" / leave.stored_filename
    if not path.exists():
        raise HTTPException(404, "The original file is no longer available.")

    attachment = mailer.Attachment(
        filename=f"Sick_Leave_{leave.reference}.{leave.file_type}",
        content=path.read_bytes(),
        content_type=MEDIA_TYPES[leave.file_type],
    )
    try:
        mailer.send_sick_leave_sheet(ch.sent_to, customer.full_name, leave.reference or "", attachment)
    except mailer.MailError as exc:
        raise HTTPException(502, str(exc))

    leave.sheet_sent_at = utcnow()
    leave.sheet_sent_to = ch.sent_to
    audit(db, user, "sheet_sent", "sick_leave", leave.id, f"{leave.reference} sheet sent to {mask_email(ch.sent_to)}", request)
    db.commit()
    return leave_detail(db, leave, [])
