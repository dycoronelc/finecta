"""
Migra todos los datos desde SQLite hacia MySQL preservando IDs y relaciones.

Uso (desde backend/ con venv activo):
    python scripts/migrate_sqlite_to_mysql.py \
      --sqlite-url "sqlite:///./finecta_dev.db" \
      --mysql-url "mysql+pymysql://USER:PASS@HOST:3306/finecta?charset=utf8mb4"

Exportar a CSV (sin MySQL):
    python scripts/migrate_sqlite_to_mysql.py \
      --sqlite-url "sqlite:///./finecta_dev.db" \
      --csv-dir "./exports/sqlite_csv"
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text

from app.db.base import Base
from app.db.models import models  # noqa: F401  # Importa modelos para registrar metadata

TABLE_ORDER = [
    "companies",
    "users",
    "company_documents",
    "invoices",
    "quotations",
    "contracts",
    "factoring_operations",
    "operation_invoices",
    "operation_events",
    "disbursements",
    "payments",
    "validation_batches",
    "webhook_deliveries",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrar datos SQLite -> MySQL")
    parser.add_argument(
        "--sqlite-url",
        default="sqlite:///./finecta_dev.db",
        help="SQLAlchemy URL de SQLite origen",
    )
    parser.add_argument(
        "--mysql-url",
        help="SQLAlchemy URL de MySQL destino (mysql+pymysql://...)",
    )
    parser.add_argument(
        "--csv-dir",
        help="Directorio de salida para exportar CSV por tabla",
    )
    parser.add_argument(
        "--truncate-first",
        action="store_true",
        help="Vaciar tablas destino antes de insertar",
    )
    return parser.parse_args()


def fetch_rows(sqlite_conn, table: str) -> list[dict[str, Any]]:
    rows = sqlite_conn.execute(text(f'SELECT * FROM "{table}"')).mappings().all()
    return [dict(r) for r in rows]


def reset_autoincrement(mysql_conn, table: str, max_id: int | None) -> None:
    next_id = (max_id or 0) + 1
    mysql_conn.execute(text(f"ALTER TABLE `{table}` AUTO_INCREMENT = {next_id}"))


def _to_csv_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def export_to_csv(sqlite_url: str, csv_dir: str) -> None:
    sqlite_engine = create_engine(sqlite_url)
    out_dir = Path(csv_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    with sqlite_engine.connect() as src:
        for table_name in TABLE_ORDER:
            rows = fetch_rows(src, table_name)
            file_path = out_dir / f"{table_name}.csv"

            with file_path.open("w", newline="", encoding="utf-8") as f:
                if rows:
                    fieldnames = list(rows[0].keys())
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    for row in rows:
                        writer.writerow({k: _to_csv_value(v) for k, v in row.items()})
                else:
                    # Archivo vacio para mantener consistencia tabla -> csv.
                    f.write("")

            print(f"{table_name}: {len(rows)} filas exportadas a {file_path}")


def migrate(sqlite_url: str, mysql_url: str, truncate_first: bool) -> None:
    sqlite_engine = create_engine(sqlite_url)
    mysql_engine = create_engine(mysql_url, pool_pre_ping=True, pool_recycle=3600)

    # Crea la estructura en MySQL si aun no existe.
    Base.metadata.create_all(bind=mysql_engine)

    with sqlite_engine.connect() as src, mysql_engine.begin() as dst:
        dst.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        try:
            for table_name in TABLE_ORDER:
                table = Base.metadata.tables[table_name]
                rows = fetch_rows(src, table_name)

                if truncate_first:
                    dst.execute(text(f"DELETE FROM `{table_name}`"))

                if rows:
                    dst.execute(table.insert(), rows)
                    max_id = max((r.get("id") or 0) for r in rows) if "id" in rows[0] else None
                    if max_id is not None:
                        reset_autoincrement(dst, table_name, int(max_id))

                print(f"{table_name}: {len(rows)} filas migradas")
        finally:
            dst.execute(text("SET FOREIGN_KEY_CHECKS=1"))


if __name__ == "__main__":
    args = parse_args()
    if not args.mysql_url and not args.csv_dir:
        raise SystemExit("Debe indicar --mysql-url o --csv-dir (o ambos).")

    if args.csv_dir:
        export_to_csv(sqlite_url=args.sqlite_url, csv_dir=args.csv_dir)

    if args.mysql_url:
        migrate(
            sqlite_url=args.sqlite_url,
            mysql_url=args.mysql_url,
            truncate_first=args.truncate_first,
        )
