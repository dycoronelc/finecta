from __future__ import annotations

import random
import string
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import (
    FactoringOperation,
    Invoice,
    InvoiceStatus,
    OperationEvent,
    OperationInvoice,
    OperationStatus,
    Quotation,
    QuotationStatus,
    UserRole,
)
from app.db.session import get_db
from app.schemas.core import (
    InvoiceOut,
    OperationCreate,
    OperationEventOut,
    OperationOut,
)

router = APIRouter(prefix="/operations", tags=["Operaciones de factoring"])


def _code() -> str:
    d = date.today().strftime("%Y%m%d")
    suf = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"OP-{d}-{suf}"


@router.get("", response_model=list[OperationOut])
def list_ops(
    company_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[OperationOut]:
    b = select(FactoringOperation)
    if not is_finecta_user(user):
        if not user.company_id:
            return []
        b = b.where(FactoringOperation.company_id == user.company_id)
    elif company_id:
        b = b.where(FactoringOperation.company_id == company_id)
    rows = list(db.scalars(b.order_by(FactoringOperation.id.desc())))
    out: list[OperationOut] = []
    for o in rows:
        cnt = db.execute(
            select(func.count()).select_from(OperationInvoice).where(
                OperationInvoice.operation_id == o.id
            )
        ).scalar() or 0
        d = OperationOut.model_validate(o)
        d = d.model_copy(update={"invoice_count": int(cnt)})
        out.append(d)
    return out


@router.get("/{op_id}", response_model=OperationOut)
def get_op(
    op_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> OperationOut:
    o = db.get(FactoringOperation, op_id)
    if not o:
        raise HTTPException(404, "Operación no encontrada")
    if not is_finecta_user(user) and user.company_id != o.company_id:
        raise HTTPException(403, "Acceso denegado")
    cnt = db.execute(
        select(func.count()).select_from(OperationInvoice).where(
            OperationInvoice.operation_id == o.id
        )
    ).scalar() or 0
    b = OperationOut.model_validate(o)
    return b.model_copy(update={"invoice_count": int(cnt)})


@router.get(
    "/{op_id}/invoices",
    response_model=list[InvoiceOut],
    summary="Facturas vinculadas a la operación",
)
def op_invoices(
    op_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[Invoice]:
    o = db.get(FactoringOperation, op_id)
    if not o:
        raise HTTPException(404, "Operación no encontrada")
    if not is_finecta_user(user) and user.company_id != o.company_id:
        raise HTTPException(403, "Acceso denegado")
    q = (
        select(Invoice)
        .join(
            OperationInvoice, OperationInvoice.invoice_id == Invoice.id
        )
        .where(OperationInvoice.operation_id == op_id)
    )
    return list(db.scalars(q))


@router.get("/{op_id}/timeline", response_model=list[OperationEventOut])
def timeline(
    op_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[OperationEvent]:
    o = db.get(FactoringOperation, op_id)
    if not o:
        raise HTTPException(404, "Operación no encontrada")
    if not is_finecta_user(user) and user.company_id != o.company_id:
        raise HTTPException(403, "Acceso denegado")
    return list(
        db.scalars(
            select(OperationEvent)
            .where(OperationEvent.operation_id == op_id)
            .order_by(OperationEvent.id.asc())
        )
    )


def _add_event(
    db: Session, op_id: int, event_type: str, message: str, meta: dict | None = None
) -> None:
    e = OperationEvent(
        operation_id=op_id, event_type=event_type, message=message, metadata_json=meta
    )
    db.add(e)


@router.post(
    "",
    response_model=OperationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear operación y vincular facturas",
)
def create_op(
    body: OperationCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> OperationOut:
    total = Decimal("0")
    oi_rows: list[tuple[int, Decimal]] = []
    for it in body.items:
        inv = db.get(Invoice, it.invoice_id)
        if not inv or inv.company_id != body.company_id:
            raise HTTPException(400, f"Factura {it.invoice_id} inválida")
        am = it.amount_assigned or inv.amount
        total += am
        oi_rows.append((inv.id, am))
    code = _code()
    op = FactoringOperation(
        code=code,
        company_id=body.company_id,
        status=OperationStatus.active.value,
        total_invoiced=total,
        quotation_id=body.quotation_id,
    )
    if body.quotation_id:
        q = db.get(Quotation, body.quotation_id)
        if q and q.status != QuotationStatus.accepted.value:
            raise HTTPException(400, "Cotización no aceptada")
    db.add(op)
    db.flush()
    for iid, am in oi_rows:
        inv = db.get(Invoice, iid)
        if inv:
            inv.status = InvoiceStatus.in_operation.value
        db.add(
            OperationInvoice(
                operation_id=op.id, invoice_id=iid, amount_assigned=am
            )
        )
    _add_event(
        db,
        op.id,
        "created",
        "Operación creada y facturas vinculadas",
        {"total": str(total)},
    )
    db.commit()
    db.refresh(op)
    return OperationOut.model_validate(op).model_copy(update={"invoice_count": len(oi_rows)})
