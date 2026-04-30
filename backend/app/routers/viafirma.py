from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db import models
from app.db.models.models import SignatureStatus, UserRole
from app.db.session import get_db

router = APIRouter(prefix="/integrations/viafirma", tags=["ViaFirma (placeholder)"])


@router.post(
    "/contracts/{contract_id}/envelope",
    status_code=status.HTTP_201_CREATED,
    summary="Crear envío hacia firma (integración real pendiente: docs.viafirma.do).",
)
def create_envelope(
    contract_id: int,
    callback_url: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> dict[str, Any]:
    c = db.get(models.Contract, contract_id)
    if not c:
        raise HTTPException(404, "Contrato no encontrado")
    c.viafirma_id = f"VF-PLACEHOLDER-{contract_id}"
    c.signature_status = SignatureStatus.sent.value
    db.commit()
    return {
        "viafirma_id": c.viafirma_id,
        "status": c.signature_status,
        "message": "Placeholder — reemplazar por API ViaFirma",
        "callback": callback_url,
    }


@router.get(
    "/webhook",
    summary="Callback de ViaFirma (verificación; sin firma aún en prototipo).",
)
def viafirma_callback() -> dict[str, str]:
    return {"ok": "true", "message": "Registrar firma y actualizar contract.signature_status", "docs": "https://www.viafirma.do/"}
