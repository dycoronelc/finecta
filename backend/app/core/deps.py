from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db import models
from app.db.models.models import UserRole
from app.db.session import get_db

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> models.User:
    if not creds or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionó token de acceso",
        )
    data = decode_token(creds.credentials)
    if not data or "sub" not in data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )
    try:
        user_id = int(data["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
        )
    user = db.get(models.User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo o inexistente",
        )
    return user


def require_roles(*allowed: str | UserRole) -> type:
    raw = [r.value if isinstance(r, UserRole) else r for r in allowed]

    def dep(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role not in raw:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para esta acción",
            )
        return user

    return dep


def is_staff(user: models.User) -> bool:
    return user.role in (UserRole.admin.value, UserRole.analyst.value)


def is_finecta_user(user: models.User) -> bool:
    return user.role in (
        UserRole.admin.value,
        UserRole.analyst.value,
    )


def client_scope_user_ids(db: Session, client_id: int) -> set[int]:
    from sqlalchemy import select

    r = db.execute(
        select(models.User.id).where(
            models.User.client_id == client_id, models.User.is_active.is_(True)
        )
    )
    return {row[0] for row in r}
