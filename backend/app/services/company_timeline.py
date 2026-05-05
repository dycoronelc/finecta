"""Eventos de línea de tiempo por cliente (empresa)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.models import CompanyTimelineEvent


def add_company_timeline_event(
    db: Session, company_id: int, event_type: str, message: str
) -> None:
    db.add(
        CompanyTimelineEvent(
            company_id=company_id,
            event_type=event_type[:64],
            message=message[:1024],
        )
    )
