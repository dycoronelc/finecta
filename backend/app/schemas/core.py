from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# --- Client (persona jurídica cliente) ---
class ClientCreate(BaseModel):
    legal_name: str
    trade_name: str | None = None
    tax_id: str
    contact_email: str
    phone: str | None = None
    contact_full_name: str | None = None


class ClientStaffCreate(BaseModel):
    """Alta de cliente por Finecta (sin usuario portal aún)."""

    legal_name: str
    trade_name: str | None = None
    tax_id: str
    contact_email: str
    phone: str | None = None
    contact_full_name: str = Field(..., min_length=2, description="Nombre y apellidos del contacto principal")


class ClientGeneralUpdate(BaseModel):
    legal_name: str | None = None
    trade_name: str | None = None
    tax_id: str | None = None
    contact_email: str | None = None
    phone: str | None = None
    contact_full_name: str | None = None


class ClientOut(BaseModel):
    id: int
    legal_name: str
    trade_name: str | None
    tax_id: str
    contact_email: str
    phone: str | None
    contact_full_name: str = ""
    created_at: datetime
    kyc_summary: str | None = Field(
        None,
        description="Peor estado KYC entre beneficiarios finales vinculados (si aplica)",
    )

    @field_validator("contact_full_name", mode="before")
    @classmethod
    def _empty_contact(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    class Config:
        from_attributes = True


class BeneficialOwnerOut(BaseModel):
    id: int
    full_name: str
    national_id: str | None
    kyc_status: str
    kyc_notes: str | None
    kyc_screening: dict | None = None
    approved_at: datetime | None
    created_at: datetime

    @field_validator("approved_at", mode="before")
    @classmethod
    def _coerce_approved_at(cls, v: object) -> datetime | None:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v
        s = str(v).strip()
        if not s or s.startswith("0000-00-00"):
            return None
        return v  # type: ignore[return-value]

    class Config:
        from_attributes = True


class BeneficialOwnerKycUpdate(BaseModel):
    kyc_status: str | None = None
    kyc_notes: str | None = None


class BeneficialOwnerCreate(BaseModel):
    full_name: str = Field(..., min_length=2)
    national_id: str | None = None


class LinkBeneficialOwnerIn(BaseModel):
    beneficial_owner_id: int


class ClientDetailOut(ClientOut):
    beneficial_owners: list[BeneficialOwnerOut] = Field(default_factory=list)


class ClientDocumentOut(BaseModel):
    id: int
    file_path: str
    original_name: str
    document_type: str
    party_name: str | None = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


class BeneficialOwnerDocumentOut(BaseModel):
    id: int
    beneficial_owner_id: int
    file_path: str
    original_name: str
    document_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


class ClientTimelineEventOut(BaseModel):
    id: int
    event_type: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Invoices ---
class InvoiceOut(BaseModel):
    id: int
    client_id: int
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
    client_id: int
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
    client_id: int
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
    client_id: int
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
    client_id: int
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
    client_id: int
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
