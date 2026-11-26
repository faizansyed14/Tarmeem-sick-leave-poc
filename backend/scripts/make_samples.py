"""Generates demo files in ../samples: a customer spreadsheet and sick leave certificates.

Run:  .venv\\Scripts\\python scripts\\make_samples.py
"""

from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parents[2] / "samples"
OUT.mkdir(exist_ok=True)

CUSTOMERS = [
    ("784-1988-4523671-2", "Fatima Ahmed Al Mansoori", "fatima.mansoori@example.com", "050 123 4567"),
    ("784199037812455", "Omar Khalid Al Hashimi", "omar.hashimi@example.com", "+971 55 987 6543"),
    ("784-1992-1187634-5", "Aisha Saeed Al Nuaimi", "aisha.nuaimi@example.com", "0529876123"),
    ("784-1985-7765432-1", "Mohammed Rashid Al Dhaheri", "m.dhaheri@example.com", "00971501112233"),
    ("784-1995-2234561-8", "Priya Nair", "priya.nair@example.com", "0567778899"),
    ("784-1979-9981234-3", "John Matthews", "john.matthews@example.com", "+971501239876"),
    ("784-1991-3345612-7", "Mariam Yousef Al Kaabi", "mariam.kaabi@example.com", "0503344556"),
    ("784-1987-5567123-4", "Ahmed Hassan Ibrahim", "ahmed.ibrahim@example.com", "0551234321"),
    ("784-1993-6678234-9", "Sara Abdullah Al Shamsi", "sara.shamsi@example.com", "0526677889"),
    ("784-1982-1123987-6", "Rajesh Kumar Menon", "rajesh.menon@example.com", "0509871234"),
    ("784-1996-4456789-0", "Layla Hamad Al Mazrouei", "layla.mazrouei@example.com", "0544455667"),
    ("784-1989-8890123-2", "Khalid Salem Al Ameri", "khalid.ameri@example.com", "0501122334"),
    # Duplicate of row 2 inside the file (same Emirates ID, different formatting)
    ("784 1990 3781245 5", "Omar Al Hashimi", "omar.h@example.com", "0559876543"),
    # Invalid Emirates ID
    ("12345", "Unknown Record", "unknown@example.com", "0500000000"),
    # Missing email (allowed, but OTP cannot be sent)
    ("784-1984-2209876-1", "Noura Ali Al Suwaidi", "", "0507654321"),
    # Shares an email with another customer
    ("784-1997-7712345-3", "Hessa Al Mansoori", "fatima.mansoori@example.com", "0509998877"),
]


def make_customers() -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Customers"
    ws.append(["Emirates ID", "Customer Name", "Email Address", "Mobile Number"])
    for row in CUSTOMERS:
        ws.append(list(row))
    for col, width in zip("ABCD", (24, 34, 34, 20)):
        ws.column_dimensions[col].width = width
    wb.save(OUT / "customers.xlsx")


CERTS = [
    {
        "file": "sick_leave_fatima.pdf",
        "name": "Fatima Ahmed Al Mansoori",
        "eid": "784-1988-4523671-2",
        "from": "10/11/2026",
        "to": "12/11/2026",
        "days": 3,
        "doctor": "Dr. Hana Al Zaabi",
        "cert": "TMH-SL-2026-01482",
        "issued": "10/11/2026",
    },
    {
        "file": "sick_leave_omar.pdf",
        "name": "OMAR KHALID AL HASHIMI",
        "eid": "784-1990-3781245-5",
        "from": "18/11/2026",
        "to": "19/11/2026",
        "days": 2,
        "doctor": "Dr. Samuel Thomas",
        "cert": "TMH-SL-2026-01517",
        "issued": "18/11/2026",
    },
    {
        "file": "sick_leave_priya_name_only.pdf",
        "name": "Priya Nair",
        "eid": None,
        "from": "20/11/2026",
        "to": "22/11/2026",
        "days": 3,
        "doctor": "Dr. Fatma Al Hosani",
        "cert": "TMH-SL-2026-01544",
        "issued": "20/11/2026",
    },
]


def make_pdf(c: dict) -> None:
    path = OUT / c["file"]
    pdf = canvas.Canvas(str(path), pagesize=A4)
    w, h = A4
    teal = colors.HexColor("#0F5C55")
    pdf.setFillColor(teal)
    pdf.rect(0, h - 28 * mm, w, 28 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(20 * mm, h - 16 * mm, "Tarmeem Hospital")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(20 * mm, h - 22 * mm, "Al Reem Island, Abu Dhabi, United Arab Emirates")

    pdf.setFillColor(colors.HexColor("#14201F"))
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(20 * mm, h - 45 * mm, "Sick Leave Certificate")
    pdf.setFont("Helvetica", 10)
    y = h - 60 * mm
    rows = [
        ("Certificate No", c["cert"]),
        ("Patient Name", c["name"]),
        ("Emirates ID", c["eid"] or "Not provided"),
        ("Facility", "Tarmeem Hospital, Abu Dhabi"),
        ("Leave From", c["from"]),
        ("Leave To", c["to"]),
        ("Number of Days", str(c["days"])),
        ("Doctor Name", c["doctor"]),
        ("Date of Issue", c["issued"]),
    ]
    for label, value in rows:
        pdf.setFillColor(colors.HexColor("#6B6862"))
        pdf.drawString(20 * mm, y, f"{label}:")
        pdf.setFillColor(colors.HexColor("#14201F"))
        pdf.drawString(65 * mm, y, value)
        y -= 8 * mm
    y -= 4 * mm
    pdf.setFillColor(colors.HexColor("#3F3F46"))
    text = pdf.beginText(20 * mm, y)
    text.setFont("Helvetica", 10)
    text.textLine("This is to certify that the above named patient was examined and is medically")
    text.textLine(f"unfit for work for {c['days']} days for the period stated above.")
    pdf.drawText(text)
    pdf.setFont("Helvetica-Oblique", 9)
    pdf.drawString(20 * mm, 30 * mm, "This certificate is electronically generated for demonstration purposes.")
    pdf.save()


def make_docx() -> None:
    doc = Document()
    title = doc.add_paragraph()
    run = title.add_run("Tarmeem Hospital")
    run.bold = True
    run.font.size = Pt(18)
    run.font.color.rgb = RGBColor(0x0F, 0x5C, 0x55)
    doc.add_paragraph("Medical Leave Certificate")
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    for label, value in [
        ("Certificate No", "TMH-SL-2026-01560"),
        ("Patient Name", "Aisha Saeed Al Nuaimi"),
        ("Emirates ID", "784-1992-1187634-5"),
        ("Leave From", "21 Nov 2026"),
        ("Leave To", "23 Nov 2026"),
        ("Number of Days", "3"),
        ("Doctor Name", "Dr. Robert Fernandes"),
        ("Facility", "Tarmeem Hospital, Abu Dhabi"),
    ]:
        cells = table.add_row().cells
        cells[0].text = label
        cells[1].text = value
    doc.add_paragraph("")
    doc.add_paragraph("The patient was advised rest for the period mentioned above.")
    doc.save(OUT / "sick_leave_aisha.docx")


if __name__ == "__main__":
    make_customers()
    for c in CERTS:
        make_pdf(c)
    make_docx()
    print(f"Samples written to {OUT}")
