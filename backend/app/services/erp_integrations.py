"""
Capa de integración ERP (Odoo, JSON-RPC) — endpoints de verificación
para la fase futura. Datos de ejemplo; sin credenciales reales.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import Any


class OdooConfigStub:
    url: str = ""
    db: str = ""


def validate_invoice_exists_stub(external_id: str) -> dict[str, Any]:
    return {
        "ok": True,
        "message": "placeholder — verificar en Odoo por JSON-RPC en producción",
        "external_id": external_id,
    }


def check_invoice_amount_stub(
    external_id: str, expected: Decimal
) -> dict[str, Any]:
    return {
        "match": None,
        "placeholders": {
            "expected": str(expected),
        },
    }


def check_due_date_stub(
    external_id: str, expected: date
) -> dict[str, Any]:
    return {
        "match": None,
        "expected": expected.isoformat(),
    }


def check_approval_status_stub(invoice_id: int) -> dict[str, Any]:
    return {
        "approved": None,
        "invoice_id": invoice_id,
        "source": "stub",
    }


def check_payment_status_stub(invoice_id: int) -> dict[str, Any]:
    return {
        "paid": None,
        "invoice_id": invoice_id,
        "source": "stub",
    }


class N8NConnectorHint(StrEnum):
    webhook_in = "webhook_in"
    rest_poll = "rest_poll"


def n8n_workflow_suggestion() -> dict[str, Any]:
    return {
        "suggested_triggers": ["nuevo archivo Excel", "cambio factura", "KYC aprobado"],
        "outbound": "/api/v1/integrations/n8n/trigger",
    }
