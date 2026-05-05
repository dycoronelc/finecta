from __future__ import annotations

import re
import shutil
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.core.config import get_settings
from app.core.deps import get_current_user, is_finecta_user
from app.db import models
from app.db.models.models import (
    Invoice,
    InvoiceStatus,
    OperationInvoice,
    Payer,
    Quotation,
    QuotationStatus,
)
from app.db.session import get_db
from app.schemas.core import InvoiceOut, InvoicePayerFilterOption, InvoiceUpdate
from app.services import invoice_extraction
from app.services.payer_resolution import get_or_create_payer_for_extraction

router = APIRouter(prefix="/invoices", tags=["Facturas"])


def _digits_tax(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\D", "", s)


def _require_client_id(user: models.User) -> int:
    if not user.client_id:
        raise HTTPException(403, "Solo clientes o cliente requerido")
    return user.client_id


@router.get("/payer-options", response_model=list[InvoicePayerFilterOption])
def list_payer_filter_options(
    client_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[InvoicePayerFilterOption]:
    """Pagadores distintos vinculados a facturas del cliente (para filtros)."""
    cid: int
    if is_finecta_user(user):
        if not client_id:
            raise HTTPException(
                400, "Indique client_id para listar pagadores de ese cliente"
            )
        cid = client_id
    else:
        cid = _require_client_id(user)
    rows = db.execute(
        select(Payer.id, Payer.legal_name, Payer.tax_id)
        .join(Invoice, Invoice.payer_id == Payer.id)
        .where(Invoice.client_id == cid)
        .distinct()
        .order_by(Payer.legal_name.asc())
    ).all()
    return [
        InvoicePayerFilterOption(id=int(r[0]), legal_name=r[1], tax_id=r[2])
        for r in rows
    ]


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    status: str | None = None,
    q: str | None = None,
    client_id: int | None = None,
    payer_id: int | None = None,
    payer: str | None = Query(
        None,
        description="Filtra por nombre del pagador (contiene; usa join al catálogo)",
    ),
    payer_tax_id: str | None = Query(
        None, description="Filtra por RNC/ID del pagador (coincidencia por dígitos o texto)"
    ),
    limit: int = Query(2000, ge=1, le=10_000, description="Máximo de filas (paginación con offset)"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[Invoice]:
    needs_join = bool(payer or payer_tax_id or q)
    b = select(Invoice)
    if needs_join:
        b = b.join(Payer, Invoice.payer_id == Payer.id).options(contains_eager(Invoice.payer))
    else:
        b = b.options(selectinload(Invoice.payer))
    if not is_finecta_user(user):
        b = b.where(Invoice.client_id == _require_client_id(user))
    elif client_id:
        b = b.where(Invoice.client_id == client_id)
    if payer_id is not None:
        b = b.where(Invoice.payer_id == payer_id)
    if status:
        b = b.where(Invoice.status == status)
    if payer:
        b = b.where(Payer.legal_name.ilike(f"%{payer.strip()}%"))
    if payer_tax_id:
        digits = _digits_tax(payer_tax_id)
        if digits:
            like = f"%{digits}%"
            b = b.where(
                or_(
                    Payer.tax_id.ilike(like),
                    Payer.legal_name.ilike(like),
                )
            )
        else:
            b = b.where(Payer.tax_id.ilike(f"%{payer_tax_id.strip()}%"))
    if q:
        like = f"%{q}%"
        b = b.where(
            or_(
                Invoice.invoice_number.ilike(like),
                Invoice.issuer.ilike(like),
                Payer.legal_name.ilike(like),
                Payer.tax_id.ilike(like),
            )
        )
    b = b.order_by(Invoice.id.desc()).limit(limit).offset(offset)
    return list(db.scalars(b))


@router.get("/{inv_id}/pdf", summary="Descargar o ver el PDF de la factura")
def get_invoice_pdf(
    inv_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> FileResponse:
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    if not is_finecta_user(user) and user.client_id != inv.client_id:
        raise HTTPException(403, "Acceso denegado")
    if not inv.pdf_path:
        raise HTTPException(404, "Esta factura no tiene PDF adjunto")
    root = get_settings().UPLOAD_DIR.resolve()
    full = (get_settings().UPLOAD_DIR / inv.pdf_path).resolve()
    if not str(full).startswith(str(root)) or not full.is_file():
        raise HTTPException(404, "Archivo no encontrado")
    return FileResponse(
        path=str(full),
        media_type="application/pdf",
        filename=f"factura-{inv_id}.pdf",
    )


@router.get("/{inv_id}", response_model=InvoiceOut)
def get_invoice(
    inv_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> Invoice:
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    if not is_finecta_user(user) and user.client_id != inv.client_id:
        raise HTTPException(403, "Acceso denegado")
    _ = inv.payer  # eager for serialization
    return inv


@router.post(
    "",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Subir PDF y extraer datos (heurística / editable)",
)
def upload_invoice(
    file: UploadFile = File(...),
    client_id: int | None = Query(None, description="Solo staff"),
    payer_id: int | None = Query(
        None, description="Pagador del catálogo; si se omite, se crea o reutiliza según el PDF"
    ),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> Invoice:
    if is_finecta_user(user) and client_id:
        cid = client_id
    else:
        cid = _require_client_id(user)
    get_settings().UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "inv.pdf").suffix or ".pdf"
    sub = get_settings().UPLOAD_DIR / "invoices" / str(cid)
    sub.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4()}{ext}"
    path = sub / name
    with path.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    rel = str(path.relative_to(get_settings().UPLOAD_DIR))
    ext_res = invoice_extraction.extract_from_pdf(path)
    ext_dict = invoice_extraction.to_dict(ext_res)
    if payer_id is not None:
        pay = db.get(Payer, payer_id)
        if not pay:
            raise HTTPException(400, "Pagador no encontrado")
    else:
        pay = get_or_create_payer_for_extraction(
            db, ext_res.payer or "", ext_res.payer_tax_id
        )
    inv = Invoice(
        client_id=cid,
        payer_id=pay.id,
        invoice_number=ext_res.invoice_number or f"PEND-{uuid.uuid4().hex[:8].upper()}",
        issuer=ext_res.issuer or "—",
        amount=ext_res.amount or Decimal("0"),
        due_date=ext_res.due_date,
        status=InvoiceStatus.uploaded.value,
        pdf_path=rel,
        extraction=ext_dict,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    _ = inv.payer
    return inv


@router.patch("/{inv_id}", response_model=InvoiceOut)
def update_invoice(
    inv_id: int,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> Invoice:
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    if not is_finecta_user(user) and user.client_id != inv.client_id:
        raise HTTPException(403, "Acceso denegado")
    data = body.model_dump(exclude_unset=True)
    if "payer_id" in data and data["payer_id"] is not None:
        pay = db.get(Payer, int(data["payer_id"]))
        if not pay:
            raise HTTPException(400, "Pagador no encontrado")
    for k, v in data.items():
        if v is not None and hasattr(inv, k):
            setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    _ = inv.payer
    return inv


@router.delete("/{inv_id}", summary="Eliminar factura")
def delete_invoice(
    inv_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> Response:
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    if not is_finecta_user(user) and user.client_id != inv.client_id:
        raise HTTPException(403, "Acceso denegado")
    n_op = (
        db.scalar(
            select(func.count())
            .select_from(OperationInvoice)
            .where(OperationInvoice.invoice_id == inv_id)
        )
        or 0
    )
    if int(n_op) > 0:
        raise HTTPException(
            400,
            "No se puede eliminar: la factura está vinculada a una operación.",
        )
    n_qp = (
        db.scalar(
            select(func.count())
            .select_from(Quotation)
            .where(
                Quotation.invoice_id == inv_id,
                Quotation.status == QuotationStatus.pending.value,
            )
        )
        or 0
    )
    if int(n_qp) > 0:
        raise HTTPException(
            400,
            "No se puede eliminar: hay cotizaciones pendientes vinculadas; cancele las cotizaciones primero.",
        )
    n_qa = (
        db.scalar(
            select(func.count())
            .select_from(Quotation)
            .where(
                Quotation.invoice_id == inv_id,
                Quotation.status == QuotationStatus.accepted.value,
            )
        )
        or 0
    )
    if int(n_qa) > 0:
        raise HTTPException(
            400,
            "No se puede eliminar: existe una cotización aceptada vinculada a esta factura.",
        )
    if inv.pdf_path:
        try:
            p = (get_settings().UPLOAD_DIR / inv.pdf_path).resolve()
            root = get_settings().UPLOAD_DIR.resolve()
            if str(p).startswith(str(root)) and p.is_file():
                p.unlink()
        except OSError:
            pass
    db.delete(inv)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
