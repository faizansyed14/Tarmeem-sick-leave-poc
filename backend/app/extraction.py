"""Text extraction and field parsing for sick leave certificates (PDF and DOCX)."""

import re
import threading
from datetime import date, datetime
from pathlib import Path

from .normalize import normalize_eid

MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
DATE = (
    rf"(\d{{1,2}}[/\-.]\d{{1,2}}[/\-.]\d{{2,4}}"
    rf"|\d{{4}}[/\-.]\d{{1,2}}[/\-.]\d{{1,2}}"
    rf"|\d{{1,2}}(?:st|nd|rd|th)?[\s\-]*(?:{MONTHS})[a-z]*\.?,?[\s\-]*\d{{2,4}}"
    rf"|(?:{MONTHS})[a-z]*\.?\s*\d{{1,2}}(?:st|nd|rd|th)?,?\s*\d{{4}})"
)

EID_RE = re.compile(r"784[\s\-]?\d{4}[\s\-]?\d{7}[\s\-]?\d")

NAME_LABELS = [
    r"patient(?:'s)?\s*full\s*name",
    r"patient(?:'s)?\s*name",
    r"name\s*of\s*(?:the\s*)?patient",
    r"employee(?:'s)?\s*name",
    r"^\s*(?:full\s*)?name",
    r"^\s*patient",
    r"this\s*is\s*to\s*certify\s*that(?:\s+(?:mr|mrs|ms|miss)\.?)?[ \t]+",
]
FACILITY_LABELS = [r"facility(?:\s*name)?", r"hospital(?:\s*name)?", r"clinic(?:\s*name)?", r"issued\s*by", r"health\s*(?:care\s*)?provider"]
DOCTOR_LABELS = [r"doctor(?:'s)?\s*name", r"physician(?:'s)?\s*name", r"treating\s*(?:doctor|physician)", r"attending\s*(?:doctor|physician)", r"physician(?:\s*name)?", r"^\s*doctor", r"consultant"]
CERT_LABELS = [
    r"certificate\s*(?:no|number|#|id)\.?",
    r"leave\s*(?:no|number|id|reference)\.?",
    r"reference\s*(?:no|number|#)?\.?",
    r"ref\.?\s*(?:no)?\.?",
    r"serial\s*(?:no|number)\.?",
]
ISSUE_LABELS = [r"date\s*of\s*issue", r"issue(?:d)?\s*(?:date|on)", r"date\s*issued", r"^\s*date"]

ALL_LABELS = (
    NAME_LABELS[:4]
    + FACILITY_LABELS
    + DOCTOR_LABELS[:4]
    + CERT_LABELS[:3]
    + [r"emirates\s*id", r"e\.?i\.?d", r"gender", r"age", r"nationality", r"diagnosis", r"date", r"mrn", r"file\s*no", r"from", r"to", r"days?"]
)
CUT_RE = re.compile(r"\s{3,}|\t|\s*\|\s*|\s+(?:" + "|".join(l.removeprefix(r"^\s*") for l in ALL_LABELS) + r")\s*[:#]", re.I)

TITLE_RE = re.compile(r"^(?:mr|mrs|ms|miss|mister|dr|master)\.?\s+", re.I)


class ExtractionError(Exception):
    pass


# OCR for scanned PDFs ---------------------------------------------------------
# RapidOCR runs PaddleOCR's recognition models on ONNX Runtime: high accuracy on
# printed forms, CPU only, no GPU or PyTorch. Used only when a PDF has no text layer.

OCR_SCALE = 2.0        # render at 144 dpi; tested as the lowest setting that keeps every field
OCR_MAX_PAGES = 3
OCR_MIN_SCORE = 0.6    # drops low confidence fragments such as Arabic stamps
MIN_TEXT_CHARS = 40    # fewer letters than this means the PDF is a scan

_ocr_engine = None
_ocr_lock = threading.Lock()


def _engine():
    global _ocr_engine
    with _ocr_lock:
        if _ocr_engine is None:
            from rapidocr import RapidOCR

            _ocr_engine = RapidOCR(params={"Global.use_cls": False, "Global.log_level": "critical"})
        return _ocr_engine


def _ocr_lines(result) -> list[str]:
    """Rebuilds reading order from OCR boxes: rows top to bottom, cells left to right.
    Cells far apart are joined with three spaces so labels and values stay separable."""
    items = []
    for box, text, score in zip(result.boxes if result.boxes is not None else [], result.txts or [], result.scores or []):
        text = (text or "").strip()
        if score < OCR_MIN_SCORE or not text:
            continue
        xs, ys = [p[0] for p in box], [p[1] for p in box]
        items.append((min(xs), max(xs), min(ys), max(ys), text))
    if not items:
        return []
    heights = sorted(i[3] - i[2] for i in items)
    h = max(heights[len(heights) // 2], 1)

    rows: list[dict] = []
    for it in sorted(items, key=lambda i: (i[2] + i[3]) / 2):
        cy = (it[2] + it[3]) / 2
        if rows and abs(cy - rows[-1]["cy"]) <= h * 0.6:
            row = rows[-1]
            row["items"].append(it)
            row["cy"] = sum((i[2] + i[3]) / 2 for i in row["items"]) / len(row["items"])
        else:
            rows.append({"cy": cy, "items": [it]})

    lines = []
    for row in rows:
        cells = sorted(row["items"], key=lambda i: i[0])
        line = cells[0][4]
        for prev, cur in zip(cells, cells[1:]):
            line += (" " if cur[0] - prev[1] < h * 1.2 else "   ") + cur[4]
        lines.append(line)
    return lines


def ocr_pdf(path: Path) -> str:
    import numpy as np
    import pypdfium2 as pdfium

    engine = _engine()
    pdf = pdfium.PdfDocument(str(path))
    try:
        pages = []
        for i in range(min(len(pdf), OCR_MAX_PAGES)):
            image = np.array(pdf[i].render(scale=OCR_SCALE).to_pil().convert("RGB"))
            pages.append("\n".join(_ocr_lines(engine(image))))
        return "\n".join(pages)
    finally:
        pdf.close()


def _has_text(text: str) -> bool:
    return len(re.findall(r"[A-Za-z0-9]", text)) >= MIN_TEXT_CHARS


def extract_document(path: Path, file_type: str) -> tuple[str, str]:
    """Returns (text, method) where method is 'text' or 'ocr'."""
    text = extract_text(path, file_type)
    if file_type == "pdf" and not _has_text(text):
        try:
            ocr_text = ocr_pdf(path)
        except Exception as exc:
            raise ExtractionError(f"The scanned document could not be read ({exc.__class__.__name__}).") from exc
        if not _has_text(ocr_text):
            raise ExtractionError("No text could be read from this scan. Upload a clearer copy of the certificate.")
        return ocr_text, "ocr"
    return text, "text"


def extract_text(path: Path, file_type: str) -> str:
    try:
        if file_type == "pdf":
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            pages = [(page.extract_text() or "") for page in reader.pages[:10]]
            return "\n".join(pages)
        if file_type == "docx":
            import docx

            document = docx.Document(str(path))
            lines = [p.text for p in document.paragraphs]
            for table in document.tables:
                for row in table.rows:
                    cells = []
                    for cell in row.cells:
                        t = cell.text.strip()
                        if t and (not cells or cells[-1] != t):
                            cells.append(t)
                    lines.append("   ".join(cells))
            for section in document.sections:
                for p in section.header.paragraphs:
                    lines.insert(0, p.text)
            return "\n".join(lines)
    except Exception as exc:  # corrupted or encrypted documents
        raise ExtractionError(f"The document could not be read ({exc.__class__.__name__}).") from exc
    raise ExtractionError("Unsupported file type.")


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    v = re.sub(r"(\d)(st|nd|rd|th)", r"\1", value.strip(), flags=re.I)
    v = re.sub(r"[,]", " ", v)
    v = re.sub(r"\s+", " ", v).strip(" .")
    v = v.replace("Sept", "Sep").replace("sept", "sep")
    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y", "%d-%m-%y", "%d.%m.%y",
        "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
        "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%B-%Y", "%d %b %y", "%d-%b-%y",
        "%b %d %Y", "%B %d %Y",
    ]
    for fmt in formats:
        try:
            parsed = datetime.strptime(v, fmt).date()
            if 2000 <= parsed.year <= 2100:
                return parsed
        except ValueError:
            continue
    return None


# A label only counts when it is followed by a colon (value on the same line or the
# next line, as in DOH certificates), or by a table gap (Word tables). This stops
# headings such as "Facility Information" or "Physician Remarks" being read as values.
SEP = r"(?:[ \t]*[:#][ \t]*(?:\r?\n[ \t]*)?|[ \t]{2,}|\t+|(?<=[ \t]))"
ARABIC_TAIL_RE = re.compile(r"\s*:?\s*[؀-ۿݐ-ݿΠ-Ͽ].*$")


def _value_after(text: str, labels: list[str]) -> str | None:
    for label in labels:
        for m in re.finditer(rf"(?im){label}{SEP}(?P<v>[^\n]*)", text):
            value = CUT_RE.split(m.group("v"), maxsplit=1)[0]
            value = ARABIC_TAIL_RE.sub("", value).strip(" :.-#")
            if value:
                return value
    return None


def _clean_name(value: str | None) -> str | None:
    if not value:
        return None
    value = TITLE_RE.sub("", value.strip())
    value = re.split(r"\s+(?:holder|bearing|with|aged|age|has|was|is)\b", value, maxsplit=1, flags=re.I)[0]
    value = re.sub(r"[^A-Za-z؀-ۿ' .\-]", " ", value)
    value = re.sub(r"\s+", " ", value).strip(" .-'")
    words = value.split()
    if not (1 < len(words) <= 7) or len(value) > 80:
        return None
    if value.isupper() or value.islower():
        value = value.title()
    return value


def _clean_text(value: str | None, max_len: int = 120) -> str | None:
    if not value:
        return None
    value = re.sub(r"\s+", " ", value).strip(" :.-")
    return value[:max_len] if value else None


def parse_certificate(text: str) -> dict:
    flat = text.replace("\r", "")
    result: dict = {}

    # Emirates ID
    m = EID_RE.search(flat)
    result["emirates_id"] = normalize_eid(m.group(0)) if m else None

    # Patient name
    result["patient_name"] = _clean_name(_value_after(flat, NAME_LABELS))

    # Leave period
    start = end = None
    rng = re.search(
        rf"(?is)(?:from|period|between|starting)(?:\s*,?\s*to)?\s*(?:date)?\s*[:\-]?\s*{DATE}\s*(?:to|till|until|and|through|\-|,)\s*(?:date)?\s*[:\-]?\s*{DATE}",
        flat,
    )
    if rng:
        start, end = parse_date(rng.group(1)), parse_date(rng.group(2))
    if not start:
        s = re.search(rf"(?im)(?:leave\s*from|from\s*date|start\s*date|start|from|effective\s*from|commencing)\s*[:\-]?\s*{DATE}", flat)
        start = parse_date(s.group(1)) if s else None
    if not end:
        e = re.search(rf"(?im)(?:leave\s*to|to\s*date|end\s*date|return\s*to\s*work|until|till|to)\s*[:\-]?\s*{DATE}", flat)
        end = parse_date(e.group(1)) if e else None
    if start and end and end < start:
        start, end = end, start
    result["start_date"], result["end_date"] = start, end

    # Number of days
    days = None
    d = re.search(r"(?i)(?:no\.?\s*of\s*days|number\s*of\s*days|total\s*days|duration|leave\s*days|days\s*granted|period)\s*[:\-]?\s*(\d{1,3})", flat)
    if not d:
        d = re.search(r"(?i)\b(\d{1,3})\s*(?:\(\s*[a-z ]+\s*\)\s*)?(?:calendar\s+|working\s+)?days?\b", flat)
    if d:
        days = int(d.group(1))
    if not days and start and end:
        days = (end - start).days + 1
    result["days"] = days if days and 0 < days < 366 else None

    # Facility
    facility = _value_after(flat, FACILITY_LABELS)
    if not facility:
        for line in flat.splitlines()[:12]:
            if re.search(r"(?i)\b(hospital|clinic|medical\s*cent(?:er|re)|healthcare|health\s*center)\b", line):
                facility = line
                break
    result["facility"] = _clean_text(facility)

    # Doctor
    doctor = _value_after(flat, DOCTOR_LABELS)
    if not doctor:
        dm = re.search(r"\bDr\.?\s+([A-Z][A-Za-z.'\- ]{2,60})", flat)
        doctor = dm.group(1) if dm else None
    if doctor:
        doctor = re.sub(r"^(?:dr\.?\s+)", "", doctor.strip(), flags=re.I)
        doctor = _clean_text(re.split(r",|\(", doctor)[0], 80)
        if doctor and (doctor.isupper() or doctor.islower()):
            doctor = doctor.title()
        doctor = f"Dr. {doctor}" if doctor else None
    result["doctor"] = doctor

    # Certificate number
    cert = _value_after(flat, CERT_LABELS)
    if cert:
        cm = re.match(r"[A-Za-z0-9][A-Za-z0-9/\-_.]{2,40}", cert.strip())
        cert = cm.group(0) if cm else None
    result["certificate_no"] = cert

    # Issue date
    issue = None
    im = re.search(rf"(?im)(?:approved\s*on|date\s*of\s*issue|issue(?:d)?\s*(?:date|on)|date\s*issued|sick\s*leave\s*date|^\s*date)\s*[:\-]?\s*{DATE}", flat)
    if im:
        issue = parse_date(im.group(1))
    result["issue_date"] = issue

    return result


KEY_FIELDS = ["patient_name", "emirates_id", "start_date", "end_date", "days", "facility", "doctor", "certificate_no"]


def fields_found(parsed: dict) -> int:
    return sum(1 for k in KEY_FIELDS if parsed.get(k))
