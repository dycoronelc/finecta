from __future__ import annotations

import re
import shutil
import uuid
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, is_finecta_user
from app.db import models
from app.db.models.models import Invoice, InvoiceStatus
from app.db.session import get_db
from app.schemas.core import InvoiceOut, InvoicePayerFilterOption, InvoiceUpdate
from app.services import invoice_extraction

router = APIRouter(prefix="/invoices", tags=["Facturas"])


def _digits_tax(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\D", "", s)


def _client_company_id(user: models.User) -> int:
    if not user.company_id:
        raise HTTPException(403, "Solo clientes o empresa requerida")
    return user.company_id


@router.get("/payer-options", response_model=list[InvoicePayerFilterOption])
def list_payer_filter_options(
    company_id: int | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[InvoicePayerFilterOption]:
    """Pagadores distintos registrados en facturas (para filtros cuando hay varios por emisor)."""
    cid: int
    if is_finecta_user(user):
        if not company_id:
            raise HTTPException(
                400, "Indique company_id para listar pagadores de esa empresa"
            )
        cid = company_id
    else:
        cid = _client_company_id(user)
    rows = db.execute(
        select(Invoice.payer, Invoice.payer_tax_id)
        .where(Invoice.company_id == cid)
        .where(Invoice.payer != "")
        .distinct()
        .order_by(Invoice.payer.asc())
    ).all()
    return [InvoicePayerFilterOption(payer=r[0], payer_tax_id=r[1]) for r in rows]


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    status: str | None = None,
    q: str | None = None,
    company_id: int | None = None,
    payer: str | None = Query(
        None, description="Filtra por nombre de pagador (contiene, sin distinguir mayúsculas)"
    ),
    payer_tax_id: str | None = Query(
        None, description="Filtra por RNC/ID del pagador (coincidencia por dígitos o texto)"
    ),
    limit: int = Query(2000, ge=1, le=10_000, description="Máximo de filas (paginación con offset)"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[Invoice]:
    b = select(Invoice)
    if not is_finecta_user(user):
        b = b.where(Invoice.company_id == _client_company_id(user))
    elif company_id:
        b = b.where(Invoice.company_id == company_id)
    if status:
        b = b.where(Invoice.status == status)
    if payer:
        b = b.where(Invoice.payer.ilike(f"%{payer.strip()}%"))
    if payer_tax_id:
        digits = _digits_tax(payer_tax_id)
        if digits:
            like = f"%{digits}%"
            b = b.where(
                or_(
                    Invoice.payer_tax_id.ilike(like),
                    Invoice.payer.ilike(like),
                )
            )
        else:
            b = b.where(Invoice.payer_tax_id.ilike(f"%{payer_tax_id.strip()}%"))
    if q:
        like = f"%{q}%"
        b = b.where(
            or_(
                Invoice.invoice_number.ilike(like),
                Invoice.issuer.ilike(like),
                Invoice.payer.ilike(like),
                Invoice.payer_tax_id.ilike(like),
            )
        )
    b = b.order_by(Invoice.id.desc()).limit(limit).offset(offset)
    return list(db.scalars(b))


@router.get("/{inv_id}", response_model=InvoiceOut)
def get_invoice(
    inv_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> Invoice:
    inv = db.get(Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Factura no encontrada")
    if not is_finecta_user(user) and user.company_id != inv.company_id:
        raise HTTPException(403, "Acceso denegado")
    return inv


@router.post(
    "",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Subir PDF y extraer datos (heurística / editable)",
)
def upload_invoice(
    file: UploadFile = File(...),
    company_id: int | None = Query(None, description="Solo staff"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> Invoice:
    if is_finecta_user(user) and company_id:
        cid = company_id
    else:
        cid = _client_company_id(user)
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
    inv = Invoice(
        company_id=cid,
        invoice_number=ext_res.invoice_number or f"PEND-{uuid.uuid4().hex[:8].upper()}",
        issuer=ext_res.issuer or "—",
        payer=ext_res.payer or "—",
        payer_tax_id=ext_res.payer_tax_id,
        amount=ext_res.amount or Decimal("0"),
        due_date=ext_res.due_date,
        status=InvoiceStatus.uploaded.value,
        pdf_path=rel,
        extraction=ext_dict,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
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
    if not is_finecta_user(user) and user.company_id != inv.company_id:
        raise HTTPException(403, "Acceso denegado")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None and hasattr(inv, k):
            setattr(inv, k, v)
    db.commit()
    db.refresh(inv)
    return inv
