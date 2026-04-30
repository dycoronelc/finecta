from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db import models
from app.db.models.models import (
    FactoringOperation,
    OperationInvoice,
    UserRole,
)
from app.db.session import get_db
from app.schemas.core import OperationOut

router = APIRouter(
    prefix="/fiduciary",
    tags=["Fiduciario (custodia y visión mínima)"],
)


@router.get(
    "/operations",
    response_model=list[OperationOut],
    summary="Listar operaciones para validación de custodia",
)
def list_for_fid(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.fiduciary, UserRole.admin)),
) -> list[OperationOut]:
    q = select(FactoringOperation).order_by(FactoringOperation.id.desc())
    rows = list(db.scalars(q))
    out: list[OperationOut] = []
    for o in rows:
        cnt = (
            db.execute(
                select(func.count())
                .select_from(OperationInvoice)
                .where(OperationInvoice.operation_id == o.id)
            ).scalar()
            or 0
        )
        b = OperationOut.model_validate(o)
        out.append(b.model_copy(update={"invoice_count": int(cnt)}))
    return out


@router.post(
    "/operations/{operation_id}/validate",
    summary="Validar transacción de custodia (placeholder de integración futura).",
)
def validate_op(
    operation_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(
        require_roles(UserRole.fiduciary, UserRole.admin)
    ),
) -> dict[str, str | int]:
    o = db.get(FactoringOperation, operation_id)
    if not o:
        raise HTTPException(404, "Operación no encontrada")
    return {
        "operation_id": o.id,
        "code": o.code,
        "custody_status": "verificado (demo)",
        "validated_by": user.email,
    }
