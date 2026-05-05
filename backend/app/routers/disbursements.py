from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import (
    Disbursement,
    DisbursementStatus,
    FactoringOperation,
    OperationEvent,
    OperationStatus,
    UserRole,
)
from app.db.session import get_db
from app.schemas.core import DisbursementCreate, DisbursementOut

router = APIRouter(prefix="/disbursements", tags=["Desembolsos"])


@router.get("", response_model=list[DisbursementOut])
def list_d(
    operation_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[Disbursement]:
    b = select(Disbursement)
    if operation_id:
        b = b.where(Disbursement.operation_id == operation_id)
    if not is_finecta_user(user) and (not user.client_id):
        return []
    if not is_finecta_user(user) and user.client_id:
        subq = select(FactoringOperation.id).where(
            FactoringOperation.client_id == user.client_id
        )
        b = b.where(Disbursement.operation_id.in_(subq))  # type: ignore[assignment]
    return list(db.scalars(b.order_by(Disbursement.id.desc())))


@router.post(
    "/{operation_id}",
    response_model=DisbursementOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar desembolso a cliente",
)
def create_d(
    operation_id: int,
    body: DisbursementCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Disbursement:
    o = db.get(FactoringOperation, operation_id)
    if not o:
        raise HTTPException(404, "Operación inexistente")
    d = Disbursement(
        operation_id=operation_id,
        amount=body.amount,
        reference=body.reference,
        status=DisbursementStatus.completed.value,
    )
    d.completed_at = datetime.now(timezone.utc)
    prev = o.total_disbursed or Decimal("0")
    o.total_disbursed = prev + body.amount
    o.status = OperationStatus.disbursed.value
    db.add(d)
    db.add(
        OperationEvent(
            operation_id=o.id,
            event_type="disbursement",
            message=f"Desembolso registrado: {body.amount}",
        )
    )
    db.commit()
    db.refresh(d)
    return d