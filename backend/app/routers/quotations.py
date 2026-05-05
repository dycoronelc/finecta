from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import Invoice, InvoiceStatus, Quotation, QuotationStatus, UserRole
from app.db.session import get_db
from app.schemas.core import QuotationCreate, QuotationOut, QuotationResponse

router = APIRouter(prefix="/quotations", tags=["Cotizaciones"])


@router.get("", response_model=list[QuotationOut])
def list_q(
    client_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[Quotation]:
    b = select(Quotation)
    if not is_finecta_user(user):
        if not user.client_id:
            return []
        b = b.where(Quotation.client_id == user.client_id)
    elif client_id:
        b = b.where(Quotation.client_id == client_id)
    return list(db.scalars(b.order_by(Quotation.id.desc())))


@router.post(
    "",
    response_model=QuotationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear cotización (Finecta)",
)
def create_q(
    body: QuotationCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Quotation:
    inv = db.get(Invoice, body.invoice_id)
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    if inv.status not in (
        InvoiceStatus.uploaded.value,
        InvoiceStatus.draft.value,
    ):
        raise HTTPException(400, "La factura no acepta cotización en su estado")
    com = (body.amount_base * body.commission_rate).quantize(Decimal("0.01"))
    op_cost = body.operational_cost
    q = Quotation(
        client_id=inv.client_id,
        invoice_id=inv.id,
        amount_base=body.amount_base,
        commission=com,
        operational_cost=op_cost,
        status=QuotationStatus.pending.value,
    )
    inv.status = InvoiceStatus.in_quotation.value
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.post(
    "/{qid}/respond",
    response_model=QuotationOut,
    summary="Aceptar o rechazar (cliente)",
)
def respond(
    qid: int, body: QuotationResponse, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> Quotation:
    q = db.get(Quotation, qid)
    if not q:
        raise HTTPException(404, "Cotización inexistente")
    if not user.client_id or q.client_id != user.client_id:
        raise HTTPException(403, "Solo su empresa")
    if q.status != QuotationStatus.pending.value:
        raise HTTPException(400, "Cotización ya respondida")
    q.status = QuotationStatus.accepted.value if body.accept else QuotationStatus.rejected.value
    q.client_comment = body.comment
    q.responded_at = datetime.now(timezone.utc)
    if q.invoice_id and body.accept:
        inv = db.get(Invoice, q.invoice_id)
        if inv:
            pass  # mantiene in_quotation hasta operación; puede pasar a approved flow en negocio real
    if q.invoice_id and not body.accept:
        inv = db.get(Invoice, q.invoice_id)
        if inv:
            inv.status = InvoiceStatus.uploaded.value
    db.commit()
    db.refresh(q)
    return q
