"""Customer spreadsheet import with duplicate detection.

Two steps: analyse (preview, nothing written) then commit.
"""

import csv
import io
import re
import secrets
import threading
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Customer
from .normalize import cell_to_str, format_eid, normalize_eid, normalize_email, normalize_name, normalize_phone

ALIASES = {
    "emirates_id": {"emiratesid", "eid", "emiratesidno", "emiratesidnumber", "idno", "idnumber", "nationalid", "uaeid", "emiratesidnum"},
    "name": {"name", "fullname", "customername", "patientname", "membername", "customer", "clientname", "employeename"},
    "email": {"email", "emailaddress", "mail", "emailid", "eemail"},
    "phone": {"phone", "phonenumber", "mobile", "mobilenumber", "mobileno", "contact", "contactnumber", "telephone", "tel", "phoneno", "contactno"},
}

PREVIEW_TTL = 1800
_previews: dict[str, dict] = {}
_lock = threading.Lock()


class ImportFormatError(Exception):
    pass


def _norm_header(value) -> str:
    return re.sub(r"[^a-z]", "", cell_to_str(value).lower())


def _map_headers(row) -> dict[str, int]:
    mapping = {}
    for idx, cell in enumerate(row):
        key = _norm_header(cell)
        for field, names in ALIASES.items():
            if key in names and field not in mapping:
                mapping[field] = idx
    return mapping


def _read_rows(filename: str, content: bytes) -> list[list]:
    lower = filename.lower()
    if lower.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        return [row for row in csv.reader(io.StringIO(text))]
    if lower.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook

        try:
            wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as exc:
            raise ImportFormatError("The spreadsheet could not be opened. Save it as .xlsx and try again.") from exc
        ws = wb.worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
        return rows
    raise ImportFormatError("Upload an Excel (.xlsx) or CSV file.")


def analyse(db: Session, filename: str, content: bytes) -> dict:
    rows = _read_rows(filename, content)
    header_idx, mapping = None, {}
    for i, row in enumerate(rows[:15]):
        m = _map_headers(row)
        if "emirates_id" in m and "name" in m:
            header_idx, mapping = i, m
            break
    if header_idx is None:
        found = [cell_to_str(c) for c in (rows[0] if rows else []) if cell_to_str(c)]
        raise ImportFormatError(
            "Could not find the Emirates ID and Name columns. "
            + (f"Columns found: {', '.join(found[:8])}." if found else "The first sheet is empty.")
        )

    def get(row, field):
        idx = mapping.get(field)
        return row[idx] if idx is not None and idx < len(row) else None

    parsed = []
    for offset, row in enumerate(rows[header_idx + 1 :], start=header_idx + 2):
        if not any(cell_to_str(c) for c in row):
            continue
        raw_eid, raw_email, raw_phone = get(row, "emirates_id"), get(row, "email"), get(row, "phone")
        item = {
            "row": offset,
            "emirates_id": normalize_eid(raw_eid),
            "raw_emirates_id": cell_to_str(raw_eid),
            "name": normalize_name(get(row, "name")),
            "email": normalize_email(raw_email),
            "phone": normalize_phone(raw_phone),
            "errors": [],
            "warnings": [],
            "status": "new",
            "changes": [],
        }
        if not item["emirates_id"]:
            item["errors"].append("Emirates ID must be 15 digits starting with 784" if item["raw_emirates_id"] else "Emirates ID is missing")
        if not item["name"]:
            item["errors"].append("Name is missing")
        if cell_to_str(raw_email) and not item["email"]:
            item["warnings"].append("Email address is not valid and was left empty")
        if not item["email"]:
            item["warnings"].append("No email, an OTP cannot be sent to this customer")
        if cell_to_str(raw_phone) and not item["phone"]:
            item["warnings"].append("Phone number is not valid and was left empty")
        parsed.append(item)

    # Existing records
    eids = [p["emirates_id"] for p in parsed if p["emirates_id"]]
    existing: dict[str, Customer] = {}
    for i in range(0, len(eids), 500):
        for c in db.scalars(select(Customer).where(Customer.emirates_id.in_(eids[i : i + 500]))):
            existing[c.emirates_id] = c
    emails = list({p["email"] for p in parsed if p["email"]})
    email_owner: dict[str, str] = {}
    for i in range(0, len(emails), 500):
        for c in db.scalars(select(Customer).where(Customer.email.in_(emails[i : i + 500]))):
            email_owner[c.email] = c.emirates_id
    phones = list({p["phone"] for p in parsed if p["phone"]})
    phone_owner: dict[str, str] = {}
    for i in range(0, len(phones), 500):
        for c in db.scalars(select(Customer).where(Customer.phone.in_(phones[i : i + 500]))):
            phone_owner[c.phone] = c.emirates_id

    seen_eid: dict[str, int] = {}
    seen_email: dict[str, tuple[int, str]] = {}
    for p in parsed:
        if p["errors"]:
            p["status"] = "invalid"
            continue
        eid = p["emirates_id"]
        if eid in seen_eid:
            p["status"] = "duplicate_in_file"
            p["warnings"].insert(0, f"Same Emirates ID as row {seen_eid[eid]}, this row will be skipped")
            continue
        seen_eid[eid] = p["row"]

        if eid in existing:
            c = existing[eid]
            changes = []
            if c.full_name != p["name"]:
                changes.append("name")
            if p["email"] and c.email != p["email"]:
                changes.append("email")
            if p["phone"] and c.phone != p["phone"]:
                changes.append("phone")
            p["changes"] = changes
            p["status"] = "exists_changed" if changes else "exists"
            p["existing_id"] = c.id

        if p["email"]:
            owner = email_owner.get(p["email"])
            if owner and owner != eid:
                p["warnings"].append(f"Email already belongs to customer {format_eid(owner)}")
            if p["email"] in seen_email and seen_email[p["email"]][1] != eid:
                p["warnings"].append(f"Email also used on row {seen_email[p['email']][0]}")
            seen_email.setdefault(p["email"], (p["row"], eid))
        if p["phone"]:
            owner = phone_owner.get(p["phone"])
            if owner and owner != eid:
                p["warnings"].append(f"Phone already belongs to customer {format_eid(owner)}")

    summary = {
        "total": len(parsed),
        "new": sum(p["status"] == "new" for p in parsed),
        "exists": sum(p["status"] == "exists" for p in parsed),
        "exists_changed": sum(p["status"] == "exists_changed" for p in parsed),
        "duplicate_in_file": sum(p["status"] == "duplicate_in_file" for p in parsed),
        "invalid": sum(p["status"] == "invalid" for p in parsed),
        "with_warnings": sum(bool(p["warnings"]) and p["status"] not in ("invalid", "duplicate_in_file") for p in parsed),
    }

    token = secrets.token_urlsafe(18)
    now = time.time()
    with _lock:
        for k in [k for k, v in _previews.items() if v["exp"] < now]:
            _previews.pop(k, None)
        _previews[token] = {"rows": parsed, "filename": filename, "exp": now + PREVIEW_TTL}

    display_rows = [
        {**p, "emirates_id": format_eid(p["emirates_id"]) if p["emirates_id"] else p["raw_emirates_id"]} for p in parsed
    ]
    return {"token": token, "filename": filename, "columns": list(mapping.keys()), "summary": summary, "rows": display_rows}


def take_preview(token: str) -> dict | None:
    with _lock:
        entry = _previews.pop(token, None)
    if not entry or entry["exp"] < time.time():
        return None
    return entry
