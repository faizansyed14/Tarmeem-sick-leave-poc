from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import BASE_DIR, settings

url = settings.resolved_database_url
connect_args = {}
if url.startswith("sqlite"):
    (BASE_DIR / "data").mkdir(exist_ok=True)
    connect_args = {"check_same_thread": False}

engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)

if url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
