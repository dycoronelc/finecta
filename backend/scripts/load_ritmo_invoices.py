"""
Carga en la base de datos las facturas desde docs/facturas_ritmo_2026-04-22.xlsx

Uso (desde la carpeta backend, con venv activo):
  set PYTHONPATH=.
  python scripts/load_ritmo_invoices.py

Requisito: el archivo Excel en la raíz del repo: ../docs/facturas_ritmo_2026-04-22.xlsx
Crea (si no existe) la empresa "Ritmo" y las facturas; no duplica por (empresa, número de factura).
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

# raíz del repo: .../finecta
ROOT = Path(__file__).resolve().parents[2]
BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import app.db.models  # noqa: E402, F401 — registra tablas

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.init_db import create_tables, ensure_uploads
from app.core.security import get_password_hash
from app.db.models.models import (
    Company,
    Invoice,
    InvoiceStatus,
    KycStatus,
    User,
    UserRole,
)
from app.db.session import SessionLocal
from app.services.ritmo_excel_import import parse_ritmo_facturas_excel

EXCEL = ROOT / "docs" / "facturas_ritmo_2026-04-22.xlsx"
RITMO_TAX_ID = "00000000013"
RITMO_NAME = "Ritmo"
PAYER_NAME = "Ritmo"  # Pagador (empresa a la facturan los proveedores; export AP)


def _map_status(s: str) -> str:
    t = (s or "").lower()
    if "pago parcial" in t or "parcial" in t:
        return InvoiceStatus.in_collection.value
    if "pagad" in t and "no" not in t and "parcial" not in t:
        return InvoiceStatus.paid.value
    if "no pagad" in t or "pend" in t:
        return InvoiceStatus.in_collection.value
    return InvoiceStatus.uploaded.value


def run() -> None:
    if not EXCEL.is_file():
        print(f"ERROR: no existe {EXCEL}", file=sys.stderr)
        sys.exit(1)
    ensure_uploads()
    create_tables()

    rows = parse_ritmo_facturas_excel(EXCEL, header_row=1)
    print(f"Leídas {len(rows)} filas del Excel.")

    db: Session = SessionLocal()
    try:
        co = db.execute(
            select(Company).where(Company.tax_id == RITMO_TAX_ID)
        ).scalar_one_or_none()
        if not co:
            co = Company(
                legal_name=RITMO_NAME,
                trade_name=RITMO_NAME,
                tax_id=RITMO_TAX_ID,
                contact_email="contacto@ritmo.com",
                phone="",
                kyc_status=KycStatus.approved.value,
                approved_at=datetime.now(timezone.utc),
            )
            db.add(co)
            db.flush()
            print(f"Empresa creada: {co.legal_name} (id={co.id})")
        else:
            print(f"Usando empresa existente: {co.legal_name} (id={co.id})")

        u_rit = db.execute(
            select(User).where(User.email == "cliente@ritmo.com")
        ).scalar_one_or_none()
        if not u_rit:
            u_rit = User(
                email="cliente@ritmo.com",
                hashed_password=get_password_hash("Ritmo2026!"),
                full_name="Usuario Ritmo",
                role=UserRole.client.value,
                is_active=True,
                company_id=co.id,
            )
            db.add(u_rit)
            db.commit()
            print("Usuario creada: cliente@ritmo.com / Ritmo2026! (cambie en producción).")
        else:
            u_rit.company_id = co.id
            db.commit()
            print("Usuario existente: cliente@ritmo.com (empresa vinculada a Ritmo).")

        ex = (
            db.execute(
                select(Invoice.invoice_number).where(Invoice.company_id == co.id)
            ).scalars().all()
        )
        have = {str(n) for n in ex if n}
        n_ins = 0
        n_skip = 0
        for r in rows:
            if r.n_factura in have:
                n_skip += 1
                continue
            ex_json = {
                "fuente": "ritmo_excel",
                "rnc_proveedor": r.rnc,
                "referencia": r.referencia,
                "moneda": r.moneda,
                "pendiente": str(r.pendiente) if r.pendiente is not None else None,
                "estado_proveedor": r.estado,
                "dias_vencido": r.dias_vencido,
                "fecha_emision": r.fecha.isoformat() if r.fecha else None,
            }
            inv = Invoice(
                company_id=co.id,
                invoice_number=r.n_factura[:120],
                issuer=r.proveedor[:500],
                payer=PAYER_NAME[:500],
                amount=r.total,
                due_date=r.vencimiento,
                status=_map_status(r.estado),
                pdf_path=None,
                extraction=ex_json,
            )
            db.add(inv)
            have.add(r.n_factura)
            n_ins += 1
        db.commit()
        print(f"Insertadas: {n_ins}, omitidas (duplicado): {n_skip}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
