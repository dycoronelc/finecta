"""Crear o reutilizar registros de pagador a partir de extracción de factura."""
from __future__ import annotations

import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.models import Payer


def get_or_create_payer_for_extraction(
    db: Session, legal_name: str, tax_id: str | None
) -> Payer:
    """
    Busca pagador por RNC/tax_id o por nombre; si no existe, crea uno mínimo
    (contacto placeholder hasta que Finecta lo complete en el catálogo).
    """
    name = (legal_name or "").strip() or "Sin nombre"
    tid = (tax_id or "").strip() or None
    if tid:
        row = db.scalar(select(Payer).where(Payer.tax_id == tid))
        if row:
            return row
    key = re.sub(r"\s+", " ", name).lower()
    row = db.scalar(
        select(Payer).where(func.lower(func.trim(Payer.legal_name)) == key)
    )
    if row:
        return row
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower())[:36].strip("-") or "payer"
    email = f"{slug}-{uuid.uuid4().hex[:10]}@payer.importado.finecta"
    tax = tid or "SIN-RNC"
    p = Payer(
        legal_name=name[:512],
        trade_name=None,
        tax_id=tax[:64],
        contact_email=email[:255],
        phone=None,
        contact_full_name="(importado desde factura)",
    )
    db.add(p)
    db.flush()
    return p
