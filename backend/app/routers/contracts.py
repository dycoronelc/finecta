from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import Contract, ContractType, SignatureStatus, UserRole
from app.db.session import get_db
from app.schemas.core import ContractOut

router = APIRouter(prefix="/contracts", tags=["Contratos"])


TITLES = {
    ContractType.marco: "Contrato Marco",
    ContractType.cession: "Contrato de Cesión",
    ContractType.confirmation: "Confirmación de Operación",
}


@router.get("", response_model=list[ContractOut])
def list_c(
    client_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[Contract]:
    b = select(Contract)
    if not is_finecta_user(user):
        if not user.client_id:
            return []
        b = b.where(Contract.client_id == user.client_id)
    elif client_id:
        b = b.where(Contract.client_id == client_id)
    return list(db.scalars(b.order_by(Contract.id.desc())))


@router.post(
    "/generate",
    response_model=ContractOut,
    status_code=status.HTTP_201_CREATED,
    summary="Generar registro de contrato (archivo de plantilla local)",
)
def gen_contract(
    client_id: int,
    contract_type: ContractType,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Contract:
    co = db.get(models.Client, client_id)
    if not co:
        raise HTTPException(404, "Cliente inexistente")
    title = TITLES[contract_type]
    body = f"""{title}\n\nCliente: {co.legal_name}\nRNC: {co.tax_id}\n\n(Plantilla de demostración — reemplazar por PDF legal)"""
    sub = get_settings().UPLOAD_DIR / "contracts" / str(client_id)
    sub.mkdir(parents=True, exist_ok=True)
    p = sub / f"{contract_type.value}-{uuid.uuid4().hex[:8]}.txt"
    p.write_text(body, encoding="utf-8")
    rel = str(p.relative_to(get_settings().UPLOAD_DIR))
    c = Contract(
        client_id=client_id,
        contract_type=contract_type.value,
        file_path=rel,
        title=title,
        signature_status=SignatureStatus.pending.value,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.post("/{c_id}/upload", response_model=ContractOut, summary="Adjuntar versión firmada")
def upload_signed(
    c_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> Contract:
    c = db.get(Contract, c_id)
    if not c:
        raise HTTPException(404, "Contrato no encontrado")
    if (user.role not in (UserRole.admin.value, UserRole.analyst.value)) and user.client_id != c.client_id:
        raise HTTPException(403, "Solo su empresa o Finecta")
    get_settings().UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    p = get_settings().UPLOAD_DIR / "contracts" / f"{c_id}-signed{Path(file.filename or 'x').suffix}"
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("wb") as f:
        f.write(file.file.read())
    c.file_path = str(p.relative_to(get_settings().UPLOAD_DIR))
    c.signature_status = SignatureStatus.signed.value
    db.commit()
    db.refresh(c)
    return c
