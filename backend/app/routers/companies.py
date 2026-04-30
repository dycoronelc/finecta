from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.core.config import get_settings
from app.db import models
from app.db.models.models import KycStatus, UserRole
from app.db.session import get_db
from app.schemas.core import CompanyOut, CompanyUpdate, CompanyDocumentOut

router = APIRouter(prefix="/companies", tags=["Onboarding y empresas"])


def _can_access_company(user: models.User, company_id: int) -> bool:
    if is_finecta_user(user) or user.role == UserRole.fiduciary.value:
        return True
    return user.company_id == company_id


@router.get("", response_model=list[CompanyOut])
def list_companies(
    kyc: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> list[models.Company]:
    q = select(models.Company)
    if kyc:
        q = q.where(models.Company.kyc_status == kyc)
    return list(db.scalars(q.order_by(models.Company.id.desc())))


@router.get("/mine", response_model=CompanyOut)
def get_my_company(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> models.Company:
    if not user.company_id:
        raise HTTPException(404, "Sin empresa vinculada")
    c = db.get(models.Company, user.company_id)
    if not c:
        raise HTTPException(404, "Empresa no encontrada")
    return c


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.Company:
    c = db.get(models.Company, company_id)
    if not c:
        raise HTTPException(404, "Empresa no encontrada")
    if not _can_access_company(user, company_id):
        raise HTTPException(403, "Acceso denegado")
    return c


@router.patch(
    "/{company_id}/kyc",
    response_model=CompanyOut,
    summary="Aprobar / actualizar KYC (Finecta)",
)
def update_kyc(
    company_id: int,
    body: CompanyUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> models.Company:
    c = db.get(models.Company, company_id)
    if not c:
        raise HTTPException(404, "Empresa no encontrada")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None and hasattr(c, k):
            setattr(c, k, v)
    if body.kyc_status == KycStatus.approved.value:
        from datetime import datetime, timezone
        c.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    return c


@router.post(
    "/{company_id}/documents",
    response_model=CompanyDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_doc(
    company_id: int,
    document_type: str = "ruc",
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.CompanyDocument:
    if user.role == UserRole.client.value and user.company_id != company_id:
        raise HTTPException(403, "Acceso denegado")
    c = db.get(models.Company, company_id)
    if not c:
        raise HTTPException(404, "Empresa no encontrada")
    get_settings().UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix or ".bin"
    dest = get_settings().UPLOAD_DIR / "company" / str(company_id)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{uuid.uuid4()}{ext}"
    with path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    doc = models.CompanyDocument(
        company_id=company_id,
        file_path=str(path.relative_to(get_settings().UPLOAD_DIR)),
        original_name=file.filename or "documento",
        document_type=document_type,
    )
    if c.kyc_status in (KycStatus.draft.value,):
        c.kyc_status = KycStatus.submitted.value
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{company_id}/documents", response_model=list[CompanyDocumentOut])
def list_documents(
    company_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[models.CompanyDocument]:
    if not _can_access_company(user, company_id):
        raise HTTPException(403, "Acceso denegado")
    if not db.get(models.Company, company_id):
        raise HTTPException(404, "Empresa no encontrada")
    return list(
        db.scalars(
            select(models.CompanyDocument).where(
                models.CompanyDocument.company_id == company_id
            )
        )
    )
