from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db import models
from app.db.models.models import UserRole
from app.db.session import get_db

router = APIRouter(prefix="/integrations/n8n", tags=["Integración n8n"])


@router.post(
    "/ingest",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Webhook genérico para flujos n8n (procesamiento asíncrono futuro)",
)
async def n8n_ingest(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    body: Any
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {"raw": (await request.body()).decode("utf-8", errors="replace")[:2000]}
    w = models.WebhookDelivery(
        source="n8n",
        event_type=str(body.get("event", "unknown")) if isinstance(body, dict) else "raw",
        payload=body if isinstance(body, dict) else {"value": str(body)[:2000]},
        status="received",
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return {"ok": True, "id": w.id}


@router.get(
    "/deliveries",
    summary="Auditoría de entregas webhook (admin)",
)
def list_deliveries(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin)),
) -> list[dict[str, Any]]:
    from sqlalchemy import select

    q = select(models.WebhookDelivery).order_by(
        models.WebhookDelivery.id.desc()
    ).limit(limit)
    rows = list(db.scalars(q))
    return [
        {
            "id": r.id,
            "source": r.source,
            "event_type": r.event_type,
            "status": r.status,
            "received_at": r.received_at.isoformat() if r.received_at else None,
        }
        for r in rows
    ]
