from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, User
from .security import COOKIE_NAME, decode_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:]
    payload = decode_token(token, "access") if token else None
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has ended. Please sign in again.")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active or payload.get("sv") != user.session_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has ended. Please sign in again.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access is required.")
    return user


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def audit(
    db: Session,
    user: User | None,
    action: str,
    entity: str | None = None,
    entity_id: str | int | None = None,
    detail: str | None = None,
    request: Request | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            detail=detail,
            ip_address=client_ip(request),
        )
    )
