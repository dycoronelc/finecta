"""Eventos de línea de tiempo por cliente."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.models import ClientTimelineEvent


def add_client_timeline_event(
    db: Session, client_id: int, event_type: str, message: str
) -> None:
    db.add(
        ClientTimelineEvent(
            client_id=client_id,
            event_type=event_type[:64],
            message=message[:1024],
        )
    )
