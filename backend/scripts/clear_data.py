"""Deletes all application data except the bootstrap administrator.

Keeps the user whose email matches ADMIN_EMAIL in .env. Does not delete
uploaded certificate files on disk.

Run from the backend folder:
    .venv\\Scripts\\python scripts\\clear_data.py
    .venv\\Scripts\\python scripts\\clear_data.py --yes
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402

TABLES = ["otp_challenges", "login_codes", "sick_leaves", "customers", "import_batches", "audit_logs", "users"]


def counts(conn) -> dict[str, int]:
    return {table: conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one() for table in TABLES}


def main() -> int:
    confirmed = "--yes" in sys.argv[1:]
    if not confirmed:
        answer = input(f"Delete all data except {settings.admin_email}? Type yes: ").strip().lower()
        if answer != "yes":
            print("Cancelled.")
            return 1

    with engine.begin() as conn:
        print("before:", counts(conn))
        admin = conn.execute(
            text("SELECT id, email FROM users WHERE lower(email) = lower(:email) AND role = 'admin'"),
            {"email": settings.admin_email},
        ).first()
        if admin is None:
            print(f"No admin user for {settings.admin_email}. Restart the backend so it can create one, then run this again.")
            return 1
        print("keeping:", tuple(admin))
        for table in TABLES[:-1]:
            deleted = conn.execute(text(f"DELETE FROM {table}")).rowcount
            print("deleted", table, deleted)
        deleted_users = conn.execute(text("DELETE FROM users WHERE id != :id"), {"id": admin.id}).rowcount
        print("deleted other users", deleted_users)

    with engine.connect() as conn:
        print("after:", counts(conn))

    if settings.resolved_database_url.startswith("sqlite"):
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("VACUUM"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
