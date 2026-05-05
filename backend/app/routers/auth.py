from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.core.deps import get_current_user
from app.db import models
from app.db.models.models import UserRole
from app.db.session import get_db
from app.schemas.auth import TokenResponse, UserLogin, UserOut
from app.schemas.core import ClientCreate

router = APIRouter(prefix="/auth", tags=["Autenticación"])


class RegisterClient(ClientCreate):
    admin_email: EmailStr
    admin_name: str
    password: str = Field(min_length=6)


def _register_core(db: Session, body: RegisterClient) -> models.User:
    exists = db.execute(
        select(models.User).where(models.User.email == body.admin_email)
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(400, "El correo ya está registrado")
    contact_fn = (body.contact_full_name or body.admin_name or "").strip()[:255]
    co = models.Client(
        legal_name=body.legal_name,
        trade_name=body.trade_name,
        tax_id=body.tax_id,
        contact_email=body.contact_email,
        phone=body.phone,
        contact_full_name=contact_fn,
    )
    db.add(co)
    db.flush()
    from app.services.client_timeline import add_client_timeline_event

    add_client_timeline_event(
        db,
        co.id,
        "created",
        f"Cliente «{co.legal_name}» registrado (autoregistro portal)",
    )
    u = models.User(
        email=body.admin_email,
        hashed_password=security.get_password_hash(body.password),
        full_name=body.admin_name,
        role=UserRole.client.value,
        client_id=co.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registro de empresa y usuario administrador",
)
def register_client(body: RegisterClient, db: Session = Depends(get_db)) -> TokenResponse:
    user = _register_core(db, body)
    token = security.create_access_token(str(user.id))
    return TokenResponse(
        access_token=token, token_type="bearer", user=UserOut.model_validate(user)
    )


@router.post("/login", response_model=TokenResponse, summary="Iniciar sesión (JWT)")
def login(body: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    u = db.execute(
        select(models.User).where(models.User.email == body.email)
    ).scalar_one_or_none()
    if not u or not security.verify_password(body.password, u.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    if not u.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo",
        )
    token = security.create_access_token(str(u.id))
    return TokenResponse(
        access_token=token, token_type="bearer", user=UserOut.model_validate(u)
    )


@router.get("/me", response_model=UserOut, summary="Perfil autenticado")
def me(user: models.User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
