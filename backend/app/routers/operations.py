from __future__ import annotations

import random
import string
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

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
    client_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[OperationOut]:
    b = select(FactoringOperation)
    if not is_finecta_user(user):
        if not user.client_id:
            return []
        b = b.where(FactoringOperation.client_id == user.client_id)
    elif client_id:
        b = b.where(FactoringOperation.client_id == client_id)
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
    if not is_finecta_user(user) and user.client_id != o.client_id:
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
    if not is_finecta_user(user) and user.client_id != o.client_id:
        raise HTTPException(403, "Acceso denegado")
    q = (
        select(Invoice)
        .join(
            OperationInvoice, OperationInvoice.invoice_id == Invoice.id
        )
        .where(OperationInvoice.operation_id == op_id)
        .options(selectinload(Invoice.payer))
    )
    return list(db.scalars(q))


@router.get("/{op_id}/timeline", response_model=list[OperationEventOut])
def timeline(
    op_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> list[OperationEvent]:
    o = db.get(FactoringOperation, op_id)
    if not o:
        raise HTTPException(404, "Operación no encontrada")
    if not is_finecta_user(user) and user.client_id != o.client_id:
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
    inv_refs: list[Invoice] = []
    for it in body.items:
        inv = db.get(Invoice, it.invoice_id)
        if not inv or inv.client_id != body.client_id:
            raise HTTPException(400, f"Factura {it.invoice_id} inválida")
        am = it.amount_assigned or inv.amount
        total += am
        oi_rows.append((inv.id, am))
        inv_refs.append(inv)
    payers = sorted(
        {
            i.payer.legal_name.strip()
            for i in inv_refs
            if i.payer
            and i.payer.legal_name.strip()
            and i.payer.legal_name.strip() != "—"
        }
    )
    if len(payers) > 1 and not body.allow_multiple_payers:
        raise HTTPException(
            400,
            "Las facturas incluyen varios pagadores. Active «permitir varios pagadores» o cree operaciones separadas por pagador.",
        )
    code = _code()
    op = FactoringOperation(
        code=code,
        client_id=body.client_id,
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
    payer_tax_ids = sorted(
        {
            (i.payer.tax_id or "").strip()
            for i in inv_refs
            if i.payer and (i.payer.tax_id or "").strip()
        }
    )
    _add_event(
        db,
        op.id,
        "created",
        "Operación creada y facturas vinculadas"
        + (f" · Pagadores: {', '.join(payers)}" if payers else ""),
        {
            "total": str(total),
            "payers": payers,
            "payer_tax_ids": payer_tax_ids,
            "multiple_payers": len(payers) > 1,
        },
    )
    db.commit()
    db.refresh(op)
    return OperationOut.model_validate(op).model_copy(update={"invoice_count": len(oi_rows)})
