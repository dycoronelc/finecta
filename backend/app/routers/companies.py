from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import KycStatus, UserRole
from app.db.session import get_db
from app.schemas.core import (
    CompanyDocumentOut,
    CompanyGeneralUpdate,
    CompanyOut,
    CompanyStaffCreate,
    CompanyUpdate,
)

router = APIRouter(prefix="/companies", tags=["Clientes y onboarding"])

# Tipos de documento KYC (legacy "ruc" se mantiene por compatibilidad)
def _count_ubo_with_identity(db: Session, company_id: int) -> int:
    """Beneficiarios finales registrados con nombre e identificación (documento UBO)."""
    n = (
        db.execute(
            select(func.count())
            .select_from(models.CompanyDocument)
            .where(
                and_(
                    models.CompanyDocument.company_id == company_id,
                    models.CompanyDocument.document_type == "ubo_identidad",
                    models.CompanyDocument.party_name.isnot(None),
                    models.CompanyDocument.party_name != "",
                )
            )
        ).scalar()
        or 0
    )
    return int(n)


DOCUMENT_TYPES = frozenset(
    {
        "ruc",
        "registro_mercantil",
        "rnc_documento",
        "acta_asamblea",
        "cedula_representante",
        "ubo_identidad",
        "bank",
        "other",
    }
)


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


@router.post(
    "",
    response_model=CompanyOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear cliente (Finecta)",
)
def create_company_staff(
    body: CompanyStaffCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> models.Company:
    c = models.Company(
        legal_name=body.legal_name.strip(),
        trade_name=body.trade_name.strip() if body.trade_name else None,
        tax_id=body.tax_id.strip(),
        contact_email=body.contact_email.strip(),
        phone=body.phone.strip() if body.phone else None,
        contact_full_name=body.contact_full_name.strip(),
        kyc_status=KycStatus.draft.value,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


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


@router.post(
    "/mine/submit-for-review",
    response_model=CompanyOut,
    summary="Cliente: enviar KYC a revisión (requiere beneficiarios finales — UBO)",
)
def submit_kyc_for_review(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.Company:
    if user.role != UserRole.client.value or not user.company_id:
        raise HTTPException(403, "Solo clientes con empresa asignada")
    c = db.get(models.Company, user.company_id)
    if not c:
        raise HTTPException(404, "Empresa no encontrada")
    if c.kyc_status != KycStatus.draft.value:
        raise HTTPException(
            400, "El expediente ya fue enviado o no está en borrador"
        )
    if _count_ubo_with_identity(db, c.id) < 1:
        raise HTTPException(
            400,
            "Para el KYC debe registrar al menos un beneficiario final (persona física a "
            "investigar) con nombre completo y documento de identidad adjunto.",
        )
    c.kyc_status = KycStatus.submitted.value
    db.commit()
    db.refresh(c)
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
    "/{company_id}",
    response_model=CompanyOut,
    summary="Actualizar datos generales del cliente (Finecta)",
)
def update_company_general(
    company_id: int,
    body: CompanyGeneralUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> models.Company:
    c = db.get(models.Company, company_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None and hasattr(c, k):
            if isinstance(v, str):
                v = v.strip()
            setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.patch(
    "/{company_id}/kyc",
    response_model=CompanyOut,
    summary="Aprobar / actualizar estado KYC (Finecta)",
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
        c.approved_at = datetime.now(timezone.utc)
    elif body.kyc_status is not None and body.kyc_status != KycStatus.approved.value:
        c.approved_at = None
    db.commit()
    db.refresh(c)
    return c


@router.post(
    "/{company_id}/kyc-screening/request",
    response_model=CompanyOut,
    summary="Solicitar consulta en proveedor externo de listas (stub — integración futura)",
)
def request_kyc_screening(
    company_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> models.Company:
    c = db.get(models.Company, company_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    if _count_ubo_with_identity(db, company_id) < 1:
        raise HTTPException(
            400,
            "Registre al menos un beneficiario final con identidad antes de solicitar la consulta en listas.",
        )
    screening = dict(c.kyc_screening) if c.kyc_screening else {}
    requests = list(screening.get("requests") or [])
    ref = f"LOCAL-{uuid.uuid4().hex[:12].upper()}"
    requests.append(
        {
            "reference": ref,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending_provider",
            "message": "Pendiente de integración con proveedor de búsquedas sobre beneficiarios finales (UBO).",
        }
    )
    screening["requests"] = requests[-30:]
    screening["last_request_reference"] = ref
    screening["last_status"] = "pending_provider"
    screening["last_message"] = (
        "La solicitud quedó registrada. Cuando exista integración, "
        "el resultado aparecerá en esta sección."
    )
    c.kyc_screening = screening
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
    file: UploadFile = File(...),
    document_type: str = Form("ruc"),
    party_name: str | None = Form(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.CompanyDocument:
    if user.role == UserRole.client.value and user.company_id != company_id:
        raise HTTPException(403, "Acceso denegado")
    dt = (document_type or "ruc").strip()[:64]
    if dt not in DOCUMENT_TYPES:
        raise HTTPException(
            400,
            f"document_type no válido. Use uno de: {', '.join(sorted(DOCUMENT_TYPES))}",
        )
    pn = (party_name or "").strip()[:255] or None
    if dt == "ubo_identidad" and not pn:
        raise HTTPException(
            400, "Para documentos de beneficiario final indique party_name (nombre completo)",
        )
    c = db.get(models.Company, company_id)
    if not c:
        raise HTTPException(404, "Empresa no encontrada")
    get_settings().UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix or ".bin"
    dest = get_settings().UPLOAD_DIR / "company" / str(company_id)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{uuid.uuid4()}{ext}"
    with path.open("wb") as f:
        f.write(file.file.read())
    doc = models.CompanyDocument(
        company_id=company_id,
        file_path=str(path.relative_to(get_settings().UPLOAD_DIR)),
        original_name=file.filename or "documento",
        document_type=dt,
        party_name=pn,
    )
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
            select(models.CompanyDocument)
            .where(models.CompanyDocument.company_id == company_id)
            .order_by(models.CompanyDocument.id.desc())
        )
    )
