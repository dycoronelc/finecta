from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import (
    FactoringOperation,
    OperationEvent,
    OperationInvoice,
    OperationStatus,
    Payment,
    UserRole,
)
from app.db.session import get_db
from app.schemas.core import OperationOut, PaymentCreate, PaymentOut

router = APIRouter(prefix="/collections", tags=["Cobros y cierre"])


@router.get("/payments", response_model=list[PaymentOut])
def list_payments(
    operation_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[Payment]:
    b = select(Payment)
    if operation_id:
        b = b.where(Payment.operation_id == operation_id)
    if not is_finecta_user(user) and user.client_id:
        subq = select(FactoringOperation.id).where(
            FactoringOperation.client_id == user.client_id
        )
        b = b.where(Payment.operation_id.in_(subq))  # type: ignore[assignment]
    if not is_finecta_user(user) and not user.client_id:
        return []
    return list(db.scalars(b.order_by(Payment.id.desc())))


@router.post(
    "/payments/{operation_id}",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar pago recibido del pagador",
)
def create_payment(
    operation_id: int,
    body: PaymentCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Payment:
    o = db.get(FactoringOperation, operation_id)
    if not o:
        raise HTTPException(404, "Operación inexistente")
    r = body.received_at or datetime.now(timezone.utc)
    p = Payment(
        operation_id=operation_id,
        payer=body.payer,
        amount=body.amount,
        status=body.status,
        received_at=r,
        notes=body.notes,
    )
    o.status = OperationStatus.in_collection.value
    db.add(p)
    db.add(
        OperationEvent(
            operation_id=o.id,
            event_type="collection",
            message=f"Cobro registrado: {body.amount} de {body.payer}",
        )
    )
    db.commit()
    db.refresh(p)
    return p


@router.post(
    "/operations/{operation_id}/close",
    response_model=OperationOut,
    summary="Cerrar operación (ciclo de cobro completado)",
)
def close_operation(
    operation_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> OperationOut:
    o = db.get(FactoringOperation, operation_id)
    if not o:
        raise HTTPException(404, "Operación no encontrada")
    o.status = OperationStatus.closed.value
    o.closed_at = datetime.now(timezone.utc)
    db.add(
        OperationEvent(
            operation_id=o.id, event_type="closed", message="Operación cerrada en cobro"
        )
    )
    db.commit()
    db.refresh(o)
    cnt2 = (
        db.execute(
            select(func.count()).select_from(OperationInvoice).where(
                OperationInvoice.operation_id == o.id
            )
        ).scalar()
        or 0
    )
    b = OperationOut.model_validate(o)
    return b.model_copy(update={"invoice_count": int(cnt2)})
