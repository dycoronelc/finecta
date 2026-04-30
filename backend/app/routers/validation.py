from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, is_finecta_user
from app.db import models
from app.db.models.models import ValidationStatus
from app.db.session import get_db
from app.schemas.core import ValidationOut
from app.services.validation_excel import parse_payer_excel, run_matching

router = APIRouter(
    prefix="/payer-validation", tags=["Validación proveedor (Excel)"]
)


@router.post(
    "/upload",
    response_model=ValidationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Cargar Excel del pagador y emparejar facturas",
)
def upload(
    file: UploadFile = File(...),
    company_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> models.ValidationBatch:
    if is_finecta_user(user) and company_id:
        cid = company_id
    else:
        if not user.company_id:
            raise HTTPException(400, "Empresa requerida")
        cid = user.company_id
    sub = get_settings().UPLOAD_DIR / "validations" / str(cid)
    sub.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "x.xlsx").suffix or ".xlsx"
    p = sub / f"{uuid.uuid4()}{ext}"
    with p.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    rel = str(p.relative_to(get_settings().UPLOAD_DIR))
    b = models.ValidationBatch(
        company_id=cid,
        uploaded_by_id=user.id,
        file_path=rel,
        original_name=file.filename or "carga.xlsx",
        status=ValidationStatus.processing.value,
    )
    db.add(b)
    db.flush()
    try:
        rows = parse_payer_excel(p)
        results = run_matching(db, cid, rows)
        b.status = ValidationStatus.completed.value
        b.results = results
    except Exception as e:  # noqa: BLE001
        b.status = ValidationStatus.failed.value
        b.results = {"error": str(e)}
    db.commit()
    db.refresh(b)
    return b


@router.get(
    "/batches",
    response_model=list[ValidationOut],
    summary="Historial de validaciones (batch)",
)
def list_batches(
    company_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[models.ValidationBatch]:
    from sqlalchemy import select

    q = select(models.ValidationBatch)
    if is_finecta_user(user) and company_id:
        q = q.where(models.ValidationBatch.company_id == company_id)
    elif not is_finecta_user(user) and user.company_id:
        q = q.where(models.ValidationBatch.company_id == user.company_id)
    elif not is_finecta_user(user):
        return []
    return list(
        db.scalars(q.order_by(models.ValidationBatch.id.desc())).all()
    )
