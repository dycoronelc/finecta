from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from typing import Any

from app.core.deps import get_current_user
from app.db import models
from app.services.erp_integrations import (
    check_approval_status_stub,
    check_due_date_stub,
    check_invoice_amount_stub,
    check_payment_status_stub,
    n8n_workflow_suggestion,
    validate_invoice_exists_stub,
)

router = APIRouter(
    prefix="/integrations/erp",
    tags=["ERP / Odoo (fase 2) — verificación"],
)


@router.get(
    "/odoo/validate-exists",
    summary="(Stub) Comprobar existencia de factura en sistema externo / Odoo",
)
def val_exists(
    external_id: str, _: models.User = Depends(get_current_user)
) -> dict[str, Any]:
    return validate_invoice_exists_stub(external_id)


@router.get("/odoo/amount", summary="(Stub) Comprobar monto")
def val_amount(
    external_id: str, expected: Decimal, _: models.User = Depends(get_current_user)
) -> dict[str, Any]:
    return check_invoice_amount_stub(external_id, expected)


@router.get("/odoo/due", summary="(Stub) Comprobar fecha de vencimiento")
def val_due(
    external_id: str, expected: date, _: models.User = Depends(get_current_user)
) -> dict[str, Any]:
    return check_due_date_stub(external_id, expected)


@router.get(
    "/odoo/approval",
    summary="(Stub) Comprobar estado de aprobación (invoice local)",
)
def val_appr(
    invoice_id: int, _: models.User = Depends(get_current_user)
) -> dict[str, Any]:
    return check_approval_status_stub(invoice_id)


@router.get(
    "/odoo/payment",
    summary="(Stub) Comprobar si la factura está pagada en tercero",
)
def val_pay(
    invoice_id: int, _: models.User = Depends(get_current_user)
) -> dict[str, Any]:
    return check_payment_status_stub(invoice_id)


@router.get(
    "/n8n",
    summary="Pistas para conectar n8n con el middleware Finecta",
)
def n8n_hints() -> dict[str, Any]:
    return n8n_workflow_suggestion()
