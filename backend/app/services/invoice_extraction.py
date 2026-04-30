"""Extracción básica de datos desde PDFs de factura (heurística, extensible a IA)."""
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import pdfplumber

DATE_PATTERNS = [
    re.compile(
        r"(?i)(?:venc|due|fecha\s*venc|fecha\s*limite)\s*[:#]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
    ),
    re.compile(r"\b(\d{4}[/-]\d{1,2}[/-]\d{1,2})\b"),
    re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b"),
]
AMOUNT_RE = re.compile(
    r"(?i)(?:monto|total|importe|amount)\s*[:#]?\s*[\$]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)"
)
NCF_INVOICE_RE = re.compile(r"\b([BE]\d{2}\d{3}\d{2}\d{2}\d{7})\b")
SIMPLE_INVOICE_RE = re.compile(r"(?i)(?:factura|n[°º]|no\.?)\s*[:#]?\s*([A-Z0-9-]{4,20})")
EMISOR_RE = re.compile(
    r"(?i)(?:emisor|deudor|proveedor|vendedor)\s*[:#]?\s*([^\n]{4,80})"
)
PAYER_RE = re.compile(
    r"(?i)(?:cliente|comprador|pagador)\s*[:#]?\s*([^\n]{4,80})"
)


def _parse_amount(s: str) -> Decimal | None:
    t = s.strip().replace(",", "")
    t = t.replace(" ", "")
    if "," in s and "." not in s:
        t = s.replace(",", ".")
    try:
        return Decimal(t)
    except (InvalidOperation, ValueError):
        return None


def _parse_date(s: str) -> date | None:
    for sep in ("/", "-"):
        parts = s.split(sep)
        if len(parts) == 3:
            a, b, c = int(parts[0]), int(parts[1]), int(parts[2])
            if c < 100:
                c += 2000
            if a > 31:  # yyyy-mm-dd
                try:
                    return date(a, b, c)
                except ValueError:
                    pass
            if a > 12:  # dd/mm
                try:
                    return date(c, b, a)
                except ValueError:
                    try:
                        return date(c, a, b)
                    except ValueError:
                        return None
    return None


@dataclass
class ExtractionResult:
    invoice_number: str | None
    issuer: str | None
    payer: str | None
    amount: Decimal | None
    due_date: date | None
    raw_text_preview: str


def extract_from_pdf(file_path: Path) -> ExtractionResult:
    text = ""
    try:
        with pdfplumber.open(str(file_path)) as pdf:
            for page in pdf.pages[:3]:
                t = page.extract_text() or ""
                text += t + "\n"
    except Exception:  # noqa: BLE001
        text = ""

    preview = text[:4000]
    number = None
    m = NCF_INVOICE_RE.search(text)
    if m:
        number = m.group(1)
    else:
        m2 = SIMPLE_INVOICE_RE.search(text)
        if m2:
            number = m2.group(1).strip()

    em = EMISOR_RE.search(text)
    emisor = em.group(1).strip() if em else None
    pm = PAYER_RE.search(text)
    payer = pm.group(1).strip() if pm else None
    if not emisor:
        for line in text.splitlines()[:5]:
            if line.strip() and "FINECTA" not in line:
                emisor = line.strip()[:120]
                break
    if not payer:
        payer = emisor

    amount = None
    am = AMOUNT_RE.search(text)
    if am:
        amount = _parse_amount(am.group(1))

    due: date | None = None
    for pat in DATE_PATTERNS:
        dm = pat.search(text)
        if dm:
            due = _parse_date(dm.group(1).replace(" ", ""))
            if due:
                break
    if amount is None:
        m_dec = re.findall(r"[\$]?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2}))\b", text)
        for cand in m_dec:
            a = _parse_amount(cand)
            if a and a > 0:
                amount = a
                break

    return ExtractionResult(
        invoice_number=number,
        issuer=emisor,
        payer=payer,
        amount=amount,
        due_date=due,
        raw_text_preview=preview,
    )


def to_dict(e: ExtractionResult) -> dict[str, Any]:
    return {
        "invoice_number": e.invoice_number,
        "issuer": e.issuer,
        "payer": e.payer,
        "amount": str(e.amount) if e.amount is not None else None,
        "due_date": e.due_date.isoformat() if e.due_date else None,
        "raw_text_preview": e.raw_text_preview[:2000],
    }
