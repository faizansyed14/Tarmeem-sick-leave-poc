import re

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-']+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def cell_to_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return repr(value)
    return str(value).strip()


def normalize_eid(value) -> str | None:
    digits = re.sub(r"\D", "", cell_to_str(value))
    if len(digits) == 15 and digits.startswith("784"):
        return digits
    return None


def format_eid(digits: str | None) -> str | None:
    if not digits or len(digits) != 15:
        return digits
    return f"{digits[:3]}-{digits[3:7]}-{digits[7:14]}-{digits[14]}"


def normalize_name(value) -> str:
    name = re.sub(r"\s+", " ", cell_to_str(value)).strip()
    if name.isupper() or name.islower():
        name = name.title()
    return name


def normalize_email(value) -> str | None:
    email = cell_to_str(value).lower()
    if not email:
        return None
    return email if EMAIL_RE.match(email) else None


def normalize_phone(value) -> str | None:
    raw = cell_to_str(value)
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) in (9, 10):
        digits = "971" + digits[1:]
    if len(digits) == 9 and digits.startswith("5"):
        digits = "971" + digits
    if not (8 <= len(digits) <= 15):
        return None
    return "+" + digits


def format_phone(phone: str | None) -> str | None:
    if not phone:
        return phone
    d = phone.lstrip("+")
    if d.startswith("971") and len(d) == 12:
        return f"+971 {d[3:5]} {d[5:8]} {d[8:]}"
    return phone
