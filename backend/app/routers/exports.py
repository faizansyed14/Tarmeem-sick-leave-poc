"""Excel export of the customer register with each customer's sick leave verification status.

GET /api/export/customers   (admin)
"""

import io
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import audit, require_admin
from ..models import Customer, OtpChallenge, SickLeave, User, utcnow
from ..normalize import format_eid, format_phone

router = APIRouter(prefix="/api/export", tags=["export"])

DUBAI = timedelta(hours=4)  # UAE has no daylight saving
BRAND = "0F5C55"
HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor=BRAND)
THIN = Side(style="thin", color="E8E5DE")
STATUS_FILLS = {
    "Verified": PatternFill("solid", fgColor="EAF5EE"),
    "Awaiting code": PatternFill("solid", fgColor="FDF4E2"),
    "Not verified": PatternFill("solid", fgColor="F4F3EF"),
}


def local(dt: datetime | None) -> datetime | None:
    return dt + DUBAI if dt else None


def _sheet(ws: Worksheet, columns: list[tuple[str, int]], rows: list[list], status_col: str | None = None) -> None:
    """Writes a formatted table: branded header, frozen top row, filters, date formats."""
    ws.append([c[0] for c in columns])
    for i, (_, width) in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=i)
        cell.font, cell.fill = HEADER_FONT, HEADER_FILL
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[1].height = 22
    status_idx = [c[0] for c in columns].index(status_col) + 1 if status_col else None

    for r in rows:
        ws.append(r)
        row = ws.max_row
        for i, value in enumerate(r, start=1):
            cell = ws.cell(row=row, column=i)
            cell.border = Border(bottom=THIN)
            if isinstance(value, datetime):
                cell.number_format = "dd mmm yyyy hh:mm"
            elif isinstance(value, date):
                cell.number_format = "dd mmm yyyy"
        if status_idx:
            fill = STATUS_FILLS.get(ws.cell(row=row, column=status_idx).value)
            if fill:
                ws.cell(row=row, column=status_idx).fill = fill

    ws.freeze_panes = "A2"
    if rows:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(columns))}{len(rows) + 1}"


def _latest_challenges(db: Session) -> dict[int, OtpChallenge]:
    latest: dict[int, OtpChallenge] = {}
    for ch in db.scalars(select(OtpChallenge).order_by(OtpChallenge.id)):
        latest[ch.sick_leave_id] = ch
    return latest


def _leave_status(leave: SickLeave, ch: OtpChallenge | None, now: datetime) -> str:
    if leave.status == "verified":
        return "Verified"
    if ch and not ch.consumed_at and ch.expires_at > now and ch.attempts < settings.otp_max_attempts:
        return "Awaiting code"
    return "Not verified"


CUSTOMER_COLUMNS = [
    ("Emirates ID", 22), ("Name", 32), ("Email", 32), ("Phone", 18),
    ("Sick leave status", 20), ("Latest certificate", 18), ("Added (Dubai)", 20), ("Updated (Dubai)", 20),
]
STATUS_ORDER = ["Verified", "Awaiting code", "Not verified"]


def _customer_status(statuses: list[str]) -> str:
    """One status when all certificates agree, otherwise a readable breakdown."""
    if not statuses:
        return "No sick leave"
    if len(set(statuses)) == 1:
        return statuses[0]
    return ", ".join(f"{statuses.count(s)} {s.lower()}" for s in STATUS_ORDER if s in statuses)


def _customer_rows(db: Session) -> list[list]:
    latest = _latest_challenges(db)
    now = utcnow()
    statuses: dict[int, list[str]] = {}
    newest: dict[int, str] = {}
    for l in db.scalars(select(SickLeave).where(SickLeave.customer_id.is_not(None)).order_by(SickLeave.id)):
        statuses.setdefault(l.customer_id, []).append(_leave_status(l, latest.get(l.id), now))
        newest[l.customer_id] = l.reference
    return [
        [
            format_eid(c.emirates_id), c.full_name, c.email, format_phone(c.phone),
            _customer_status(statuses.get(c.id, [])), newest.get(c.id), local(c.created_at), local(c.updated_at),
        ]
        for c in db.scalars(select(Customer).order_by(Customer.full_name))
    ]


def _send(wb: Workbook, name: str) -> StreamingResponse:
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


def _stamp() -> str:
    return (utcnow() + DUBAI).strftime("%Y%m%d-%H%M")


@router.get("/customers")
def export_customers(request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rows = _customer_rows(db)
    wb = Workbook()
    ws = wb.active
    ws.title = "Customers"
    _sheet(ws, CUSTOMER_COLUMNS, rows, status_col="Sick leave status")
    audit(db, admin, "data_exported", "export", None, f"Customer register: {len(rows)} rows", request)
    db.commit()
    return _send(wb, f"tarmeem-customers-{_stamp()}.xlsx")
