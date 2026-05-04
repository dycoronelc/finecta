"""Crea tablas y datos de demostración."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db import models
from app.db.base import Base
from app.db.models.models import KycStatus, UserRole
from app.db.session import SessionLocal, engine

settings = get_settings()


def ensure_uploads() -> None:
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_invoice_payer_tax_id_column()


def _ensure_invoice_payer_tax_id_column() -> None:
    """Añade columnas nuevas en BD existentes (create_all no altera tablas ya creadas)."""
    insp = inspect(engine)
    if "invoices" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("invoices")}
    if "payer_tax_id" in cols:
        return
    ddl = "ALTER TABLE invoices ADD COLUMN payer_tax_id VARCHAR(64) NULL"
    if settings.database_url.startswith("sqlite"):
        ddl = "ALTER TABLE invoices ADD COLUMN payer_tax_id VARCHAR(64)"
    with engine.begin() as conn:
        conn.execute(text(ddl))


def seed_if_empty() -> None:
    db: Session = SessionLocal()
    try:
        n = db.execute(select(models.User.id).limit(1)).scalar()
        if n is not None:
            return
        c_demo = models.Company(
            legal_name="Comercial Demo SRL",
            trade_name="Demo",
            tax_id="123456789",
            contact_email="empresa@demo.com",
            phone="809-555-0000",
            kyc_status=KycStatus.approved.value,
            approved_at=datetime.now(timezone.utc),
        )
        c_pending = models.Company(
            legal_name="Importadora BETA SRL",
            tax_id="987654321",
            contact_email="beta@demo.com",
            kyc_status=KycStatus.in_review.value,
        )
        db.add_all([c_demo, c_pending])
        db.flush()
        u_admin = models.User(
            email="admin@finecta.com",
            hashed_password=get_password_hash("Admin123!"),
            full_name="Admin Finecta",
            role=UserRole.admin.value,
            is_active=True,
        )
        u_ana = models.User(
            email="analista@finecta.com",
            hashed_password=get_password_hash("Analista123!"),
            full_name="Ana Lista",
            role=UserRole.analyst.value,
            is_active=True,
        )
        u_fid = models.User(
            email="fiduciario@finecta.com",
            hashed_password=get_password_hash("Fiduciario123!"),
            full_name="Fid. Seguro",
            role=UserRole.fiduciary.value,
            is_active=True,
        )
        u_payer = models.User(
            email="pagador@empresa.com",
            hashed_password=get_password_hash("Pagador123!"),
            full_name="Pagos Corp",
            role=UserRole.payer.value,
            is_active=True,
        )
        u_client = models.User(
            email="cliente@demo.com",
            hashed_password=get_password_hash("Cliente123!"),
            full_name="Carlos Cliente",
            role=UserRole.client.value,
            company_id=c_demo.id,
        )
        db.add_all([u_admin, u_ana, u_fid, u_payer, u_client])
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    ensure_uploads()
    create_tables()
    seed_if_empty()
    print("Base lista.")
