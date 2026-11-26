import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text

from .config import settings
from .database import Base, SessionLocal, engine
from .models import User
from .routers import auth, customers, dashboard, exports, leaves, users
from .security import hash_password, verify_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tarmeem")


def migrate() -> None:
    """Adds columns introduced after the first release to an existing database."""
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    if "mfa_method" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN mfa_method VARCHAR(20) NOT NULL DEFAULT 'captcha'"))
        log.info("Added users.mfa_method column")
    leave_columns = {c["name"] for c in inspect(engine).get_columns("sick_leaves")}
    if "extraction_method" not in leave_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE sick_leaves ADD COLUMN extraction_method VARCHAR(10) NOT NULL DEFAULT 'text'"))
        log.info("Added sick_leaves.extraction_method column")


def bootstrap_admin() -> None:
    with SessionLocal() as db:
        email = settings.admin_email.strip().lower()
        admin = db.scalar(select(User).where(func.lower(User.email) == email))
        if not admin:
            db.add(
                User(
                    email=email,
                    full_name=settings.admin_name,
                    role="admin",
                    mfa_method="captcha",
                    password_hash=hash_password(settings.admin_password),
                )
            )
            log.info("Created bootstrap administrator %s", email)
        else:
            admin.role, admin.is_active = "admin", True
            if not verify_password(settings.admin_password, admin.password_hash):
                admin.password_hash = hash_password(settings.admin_password)
                admin.session_version += 1
                log.info("Administrator password synced from .env")
        db.commit()


app = FastAPI(title=settings.app_name, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Cache-Control", "no-store")
    if not request.url.path.endswith("/file"):
        response.headers.setdefault("X-Frame-Options", "DENY")
    return response


@app.on_event("startup")
def on_startup() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    migrate()
    bootstrap_admin()
    if settings.expose_dev_codes:
        log.warning("Email delivery is not configured. OTP DEV MODE is on: codes are logged and shown in the UI.")
    elif settings.mail_enabled:
        log.info("Email delivery: %s", settings.mail_description)


@app.get("/api/health")
def health():
    return {"status": "ok", "mail_enabled": settings.mail_enabled}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(customers.router)
app.include_router(leaves.router)
app.include_router(dashboard.router)
app.include_router(exports.router)
