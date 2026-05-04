from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field


# --- Company ---
class CompanyCreate(BaseModel):
    legal_name: str
    trade_name: str | None = None
    tax_id: str
    contact_email: str
    phone: str | None = None


class CompanyUpdate(BaseModel):
    kyc_status: str | None = None
    kyc_notes: str | None = None
    legal_name: str | None = None
    contact_email: str | None = None
    phone: str | None = None


class CompanyOut(BaseModel):
    id: int
    legal_name: str
    trade_name: str | None
    tax_id: str
    contact_email: str
    phone: str | None
    kyc_status: str
    kyc_notes: str | None
    approved_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class CompanyDocumentOut(BaseModel):
    id: int
    file_path: str
    original_name: str
    document_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


# --- Invoices ---
class InvoiceOut(BaseModel):
    id: int
    company_id: int
    invoice_number: str
    issuer: str
    payer: str
    payer_tax_id: str | None = None
    amount: Decimal
    due_date: date | None
    status: str
    pdf_path: str | None
    extraction: dict | None
    created_at: datetime

    class Config:
        from_attributes = True


class InvoicePayerFilterOption(BaseModel):
    """Valores distintos de pagador por empresa (un emisor puede tener muchos pagadores)."""

    payer: str
    payer_tax_id: str | None = None


class InvoiceUpdate(BaseModel):
    invoice_number: str | None = None
    issuer: str | None = None
    payer: str | None = None
    payer_tax_id: str | None = None
    amount: Decimal | None = None
    due_date: date | None = None
    status: str | None = None


# --- Quotations ---
class QuotationCreate(BaseModel):
    invoice_id: int
    amount_base: Decimal
    commission_rate: Decimal = Field(
        default=Decimal("0.02"), description="0-1 fracción comisión"
    )
    operational_cost: Decimal = Decimal("0")


class QuotationOut(BaseModel):
    id: int
    company_id: int
    invoice_id: int | None
    amount_base: Decimal
    commission: Decimal
    operational_cost: Decimal
    status: str
    client_comment: str | None
    created_at: datetime
    responded_at: datetime | None

    class Config:
        from_attributes = True


class QuotationResponse(BaseModel):
    accept: bool
    comment: str | None = None


# --- Operations ---
class OperationInvoiceIn(BaseModel):
    invoice_id: int
    amount_assigned: Decimal | None = None


class OperationCreate(BaseModel):
    company_id: int
    quotation_id: int | None = None
    items: list[OperationInvoiceIn]
    allow_multiple_payers: bool = Field(
        default=True,
        description="Si es false, no se permite vincular facturas con distinto pagador en la misma operación.",
    )


class OperationEventOut(BaseModel):
    id: int
    event_type: str
    message: str
    metadata_json: dict | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class OperationOut(BaseModel):
    id: int
    code: str
    company_id: int
    status: str
    total_invoiced: Decimal
    total_disbursed: Decimal | None
    quotation_id: int | None
    created_at: datetime
    closed_at: datetime | None
    invoice_count: int = 0

    class Config:
        from_attributes = True


# --- Disbursement / payments ---
class DisbursementOut(BaseModel):
    id: int
    operation_id: int
    amount: Decimal
    status: str
    reference: str | None
    created_at: datetime
    completed_at: datetime | None

    class Config:
        from_attributes = True


class DisbursementCreate(BaseModel):
    amount: Decimal
    reference: str | None = None


class PaymentOut(BaseModel):
    id: int
    operation_id: int
    payer: str
    amount: Decimal
    status: str
    received_at: datetime | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentCreate(BaseModel):
    amount: Decimal
    payer: str
    status: str = "received"
    notes: str | None = None
    received_at: datetime | None = None


# --- Contracts ---
class ContractOut(BaseModel):
    id: int
    company_id: int
    contract_type: str
    file_path: str | None
    title: str
    signature_status: str
    viafirma_id: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Validation ---
class ValidationOut(BaseModel):
    id: int
    company_id: int
    original_name: str
    status: str
    results: dict | None
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardKpis(BaseModel):
    kyc_pending: int = 0
    open_operations: int = 0
    total_disbursed: str = "0"
    in_collection: int = 0
    my_invoices: int = 0
    my_operations: int = 0
    today_collections: int = 0
    open_quotations: int = 0
