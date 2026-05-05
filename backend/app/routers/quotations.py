from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import Invoice, InvoiceStatus, Quotation, QuotationStatus, UserRole
from app.db.session import get_db
from app.schemas.core import QuotationCreate, QuotationOut, QuotationResponse, QuotationUpdate

router = APIRouter(prefix="/quotations", tags=["Cotizaciones"])


def _revert_invoice_if_no_pending_quotations(db: Session, invoice_id: int | None) -> None:
    if not invoice_id:
        return
    pending = (
        db.scalar(
            select(func.count())
            .select_from(Quotation)
            .where(
                Quotation.invoice_id == invoice_id,
                Quotation.status == QuotationStatus.pending.value,
            )
        )
        or 0
    )
    if int(pending) > 0:
        return
    inv = db.get(Invoice, invoice_id)
    if inv and inv.status == InvoiceStatus.in_quotation.value:
        inv.status = InvoiceStatus.uploaded.value


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


@router.patch(
    "/{qid}",
    response_model=QuotationOut,
    summary="Editar o anular cotización (Finecta)",
)
def update_q_staff(
    qid: int,
    body: QuotationUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Quotation:
    q = db.get(Quotation, qid)
    if not q:
        raise HTTPException(404, "Cotización inexistente")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is not None:
        new_s = data["status"]
        if new_s not in (QuotationStatus.expired.value, QuotationStatus.rejected.value):
            raise HTTPException(
                400,
                "Solo se puede fijar estado rejected o expired para anular una cotización pendiente",
            )
        if q.status != QuotationStatus.pending.value:
            raise HTTPException(400, "Solo se anulan cotizaciones pendientes")
        q.status = new_s
        _revert_invoice_if_no_pending_quotations(db, q.invoice_id)
    amount_keys = ("amount_base", "commission", "operational_cost")
    if any(k in data for k in amount_keys):
        if q.status != QuotationStatus.pending.value:
            raise HTTPException(400, "Solo se editan importes en cotizaciones pendientes")
        if "amount_base" in data and data["amount_base"] is not None:
            q.amount_base = data["amount_base"]
        if "commission" in data and data["commission"] is not None:
            q.commission = data["commission"]
        if "operational_cost" in data and data["operational_cost"] is not None:
            q.operational_cost = data["operational_cost"]
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
