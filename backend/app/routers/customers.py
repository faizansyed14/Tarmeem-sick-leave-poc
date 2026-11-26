import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import importer
from ..database import get_db
from ..deps import audit, get_current_user, require_admin
from ..models import Customer, ImportBatch, SickLeave, User, utcnow
from ..normalize import cell_to_str, format_eid, format_phone, normalize_eid, normalize_email, normalize_name, normalize_phone
from ..serializers import customer_out, iso, leave_detail

router = APIRouter(prefix="/api/customers", tags=["customers"])

MAX_IMPORT_BYTES = 15 * 1024 * 1024


class CommitIn(BaseModel):
    token: str
    update_existing: bool = False


@router.get("")
def list_customers(
    q: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Customer)
    term = q.strip()
    if term:
        like = f"%{term.lower()}%"
        digits = "".join(ch for ch in term if ch.isdigit())
        conds = [func.lower(Customer.full_name).like(like), func.lower(Customer.email).like(like)]
        if len(digits) >= 3:
            conds += [Customer.emirates_id.like(f"%{digits}%"), Customer.phone.like(f"%{digits}%")]
        stmt = stmt.where(or_(*conds))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Customer.full_name).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [customer_out(c) for c in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/template")
def template(_: User = Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = "Customers"
    ws.append(["Emirates ID", "Name", "Email", "Phone"])
    ws.append(["784-1990-1234567-1", "Fatima Al Mansoori", "fatima@example.com", "+971 50 123 4567"])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0F5C55")
    for col, width in zip("ABCD", (24, 32, 32, 20)):
        ws.column_dimensions[col].width = width
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="tarmeem-customer-template.xlsx"'},
    )


@router.post("/import/preview")
async def import_preview(file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(require_admin)):
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "The file is larger than 15 MB.")
    if not content:
        raise HTTPException(400, "The file is empty.")
    try:
        return importer.analyse(db, file.filename or "upload.xlsx", content)
    except importer.ImportFormatError as exc:
        raise HTTPException(422, str(exc))


@router.post("/import/commit")
def import_commit(body: CommitIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    preview = importer.take_preview(body.token)
    if not preview:
        raise HTTPException(410, "This preview has expired. Upload the file again.")
    rows = preview["rows"]
    batch = ImportBatch(filename=preview["filename"], uploaded_by_id=admin.id, total_rows=len(rows))
    db.add(batch)
    db.flush()

    inserted = updated = skipped = invalid = 0
    for r in rows:
        if r["status"] == "invalid":
            invalid += 1
            continue
        if r["status"] == "duplicate_in_file":
            skipped += 1
            continue
        existing = db.scalar(select(Customer).where(Customer.emirates_id == r["emirates_id"]))
        if existing:
            if body.update_existing and r["status"] == "exists_changed":
                existing.full_name = r["name"]
                existing.email = r["email"] or existing.email
                existing.phone = r["phone"] or existing.phone
                existing.updated_at = utcnow()
                updated += 1
            else:
                skipped += 1
            continue
        db.add(Customer(emirates_id=r["emirates_id"], full_name=r["name"], email=r["email"], phone=r["phone"], import_batch_id=batch.id))
        inserted += 1

    batch.inserted, batch.updated, batch.skipped, batch.invalid = inserted, updated, skipped, invalid
    audit(
        db, admin, "customers_imported", "import", batch.id,
        f"{preview['filename']}: {inserted} added, {updated} updated, {skipped} skipped, {invalid} invalid", request,
    )
    db.commit()
    return {"batch_id": batch.id, "inserted": inserted, "updated": updated, "skipped": skipped, "invalid": invalid}


@router.get("/imports")
def import_history(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    batches = db.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(20)).all()
    return {
        "items": [
            {
                "id": b.id,
                "filename": b.filename,
                "uploaded_by": b.uploaded_by.full_name if b.uploaded_by else None,
                "total_rows": b.total_rows,
                "inserted": b.inserted,
                "updated": b.updated,
                "skipped": b.skipped,
                "invalid": b.invalid,
                "created_at": iso(b.created_at),
            }
            for b in batches
        ]
    }


@router.delete("/{customer_id}")
def delete_customer(customer_id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found.")
    linked = db.scalar(select(func.count()).select_from(SickLeave).where(SickLeave.customer_id == c.id))
    if linked:
        raise HTTPException(
            409,
            f"{c.full_name} has {linked} sick leave {'certificate' if linked == 1 else 'certificates'} linked and cannot be deleted. "
            "Certificates are kept as a permanent record.",
        )
    audit(db, admin, "customer_deleted", "customer", c.id, c.full_name, request)
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/{customer_id:int}")
def get_customer(customer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """A customer with every sick leave certificate linked to them, newest first."""
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found.")
    leaves = db.scalars(select(SickLeave).where(SickLeave.customer_id == c.id).order_by(SickLeave.id.desc())).all()
    details = [leave_detail(db, l, []) for l in leaves]
    return {
        "customer": customer_out(c),
        "imported_from": c.import_batch_id and db.get(ImportBatch, c.import_batch_id).filename,
        "stats": {
            "total": len(details),
            "verified": sum(d["status"] == "verified" for d in details),
            "awaiting_otp": sum(d["status"] == "awaiting_otp" for d in details),
            "not_verified": sum(d["status"] == "not_verified" for d in details),
            "days": sum(d["days"] or 0 for d in details),
        },
        "leaves": details,
    }


class CustomerIn(BaseModel):
    emirates_id: str = Field(max_length=32)
    full_name: str = Field(max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=32)


def _validated(db: Session, body: CustomerIn, current_id: int | None = None) -> tuple[dict, list[str]]:
    """Normalises and checks customer fields. Shared by create and update, same rules as the import."""
    eid = normalize_eid(body.emirates_id)
    if not eid:
        raise HTTPException(422, "Emirates ID must be 15 digits starting with 784.")
    name = normalize_name(body.full_name)
    if len(name) < 2:
        raise HTTPException(422, "Enter the customer's full name.")
    email = normalize_email(body.email)
    if cell_to_str(body.email) and not email:
        raise HTTPException(422, "Enter a valid email address, or leave it empty.")
    phone = normalize_phone(body.phone)
    if cell_to_str(body.phone) and not phone:
        raise HTTPException(422, "Enter a valid phone number, or leave it empty.")

    existing = db.scalar(select(Customer).where(Customer.emirates_id == eid, Customer.id != (current_id or 0)))
    if existing:
        raise HTTPException(409, f"{existing.full_name} is already in the register with Emirates ID {format_eid(eid)}.")

    warnings = []
    if email and (other := db.scalar(select(Customer).where(Customer.email == email, Customer.id != (current_id or 0)))):
        warnings.append(f"This email is also used by {other.full_name} ({format_eid(other.emirates_id)}).")
    if phone and (other := db.scalar(select(Customer).where(Customer.phone == phone, Customer.id != (current_id or 0)))):
        warnings.append(f"This phone number is also used by {other.full_name} ({format_eid(other.emirates_id)}).")
    return {"emirates_id": eid, "full_name": name, "email": email, "phone": phone}, warnings


@router.post("", status_code=201)
def create_customer(body: CustomerIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Adds one customer by hand."""
    fields, warnings = _validated(db, body)
    c = Customer(**fields)
    db.add(c)
    db.flush()
    audit(db, admin, "customer_created", "customer", c.id, f"{c.full_name} ({format_eid(c.emirates_id)})", request)
    db.commit()
    return {"customer": customer_out(c), "warnings": warnings}


@router.put("/{customer_id:int}")
def update_customer(customer_id: int, body: CustomerIn, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Edits a customer. The Emirates ID is locked once a certificate has been verified against it."""
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found.")
    fields, warnings = _validated(db, body, current_id=c.id)

    if fields["emirates_id"] != c.emirates_id:
        verified = db.scalar(
            select(func.count()).select_from(SickLeave).where(SickLeave.customer_id == c.id, SickLeave.status == "verified")
        )
        if verified:
            raise HTTPException(
                409,
                f"The Emirates ID cannot be changed because {verified} verified "
                f"{'certificate is' if verified == 1 else 'certificates are'} linked to this customer.",
            )

    labels = {"emirates_id": "Emirates ID", "full_name": "name", "email": "email", "phone": "phone"}
    changes = []
    for key, value in fields.items():
        old = getattr(c, key)
        if value != old:
            fmt = {"emirates_id": format_eid, "phone": format_phone}.get(key, lambda v: v)
            shown = (fmt(old) or "empty", fmt(value) or "empty")
            changes.append(f"{labels[key]} {shown[0]} to {shown[1]}")
            setattr(c, key, value)
    if changes:
        c.updated_at = utcnow()
        audit(db, admin, "customer_updated", "customer", c.id, f"{c.full_name}: " + "; ".join(changes), request)
        db.commit()
    return {"customer": customer_out(c), "warnings": warnings, "changed": bool(changes)}
