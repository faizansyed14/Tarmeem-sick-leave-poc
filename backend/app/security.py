import hashlib
import hmac
import re
import secrets
import string
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp

from .config import settings

ALGORITHM = "HS256"
COOKIE_NAME = "tlm_session"


# Passwords -----------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def password_problems(password: str) -> list[str]:
    problems = []
    if len(password) < 10:
        problems.append("at least 10 characters")
    if not re.search(r"[A-Z]", password):
        problems.append("an uppercase letter")
    if not re.search(r"[a-z]", password):
        problems.append("a lowercase letter")
    if not re.search(r"\d", password):
        problems.append("a number")
    if not re.search(r"[^A-Za-z0-9]", password):
        problems.append("a symbol")
    return problems


def generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    symbols = "@#$%&*!?"
    while True:
        pw = [secrets.choice(alphabet) for _ in range(length - 2)] + [secrets.choice(symbols), secrets.choice(string.digits)]
        secrets.SystemRandom().shuffle(pw)
        candidate = "".join(pw)
        if not password_problems(candidate):
            return candidate


# Tokens --------------------------------------------------------------------

def create_token(user_id: int, token_type: str, minutes: int, session_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "typ": token_type,
        "sv": session_version,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != expected_type:
        return None
    return payload


# One time codes ------------------------------------------------------------

def generate_code(digits: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(digits))


def hash_code(purpose: str, subject_id: int, code: str) -> str:
    msg = f"{purpose}:{subject_id}:{code}".encode()
    return hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()


def code_matches(purpose: str, subject_id: int, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_code(purpose, subject_id, code.strip()), code_hash)


# TOTP ----------------------------------------------------------------------

TOTP_ISSUER = "Tarmeem Hospital"


def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=TOTP_ISSUER)


def verify_totp(secret: str, code: str, last_step: int) -> int | None:
    """Returns the matched time step, or None. Rejects reuse of a step."""
    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return None
    totp = pyotp.TOTP(secret)
    now = time.time()
    for offset in (0, -1, 1):
        t = now + offset * totp.interval
        step = int(t // totp.interval)
        if hmac.compare_digest(totp.at(t), code):
            return step if step > last_step else None
    return None


# Masking -------------------------------------------------------------------

def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked}@{domain}"
