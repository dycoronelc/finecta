import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    analyst = "analyst"
    client = "client"
    fiduciary = "fiduciary"
    payer = "payer"


class KycStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    in_review = "in_review"
    approved = "approved"
    rejected = "rejected"


class InvoiceStatus(str, enum.Enum):
    draft = "draft"
    uploaded = "uploaded"
    in_quotation = "in_quotation"
    in_operation = "in_operation"
    in_collection = "in_collection"
    paid = "paid"
    closed = "closed"
    rejected = "rejected"


class QuotationStatus(str, enum.Enum):
    draft = "draft"
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    expired = "expired"


class ContractType(str, enum.Enum):
    marco = "marco"  # Contrato Marco
    cession = "cession"  # Contrato de Cesión
    confirmation = "confirmation"  # Confirmación de Operación


class SignatureStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    signed = "signed"
    void = "void"


class OperationStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    disbursed = "disbursed"
    in_collection = "in_collection"
    closed = "closed"
    cancelled = "cancelled"


class DisbursementStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class PaymentStatus(str, enum.Enum):
    expected = "expected"
    partial = "partial"
    received = "received"
    settled = "settled"


class ValidationStatus(str, enum.Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"


def _enum_values(e: type[enum.Enum]) -> list[str]:
    return [m.value for m in e]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(
        Enum(UserRole, values_callable=_enum_values), default=UserRole.client.value
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    company_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    company: Mapped[Optional["Company"]] = relationship(
        "Company", back_populates="users", foreign_keys=[company_id]
    )


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    legal_name: Mapped[str] = mapped_column(String(512))
    trade_name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    tax_id: Mapped[str] = mapped_column(String(64), index=True)
    contact_email: Mapped[str] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    contact_full_name: Mapped[str] = mapped_column(
        String(255), default="", doc="Nombre y apellidos del contacto principal"
    )
    kyc_status: Mapped[str] = mapped_column(
        Enum(KycStatus, values_callable=_enum_values), default=KycStatus.draft.value
    )
    kyc_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    kyc_screening: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, doc="Solicitudes y resultados del proveedor de listas (KYC externo)"
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    users: Mapped[list[User]] = relationship(
        "User", back_populates="company", foreign_keys="User.company_id"
    )
    documents: Mapped[list["CompanyDocument"]] = relationship(
        "CompanyDocument", back_populates="company", cascade="all, delete-orphan"
    )
    timeline_events: Mapped[list["CompanyTimelineEvent"]] = relationship(
        "CompanyTimelineEvent",
        back_populates="company",
        cascade="all, delete-orphan",
    )


class CompanyTimelineEvent(Base):
    __tablename__ = "company_timeline_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    company: Mapped["Company"] = relationship("Company", back_populates="timeline_events")


class CompanyDocument(Base):
    __tablename__ = "company_documents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE")
    )
    file_path: Mapped[str] = mapped_column(String(1024))
    original_name: Mapped[str] = mapped_column(String(512))
    document_type: Mapped[str] = mapped_column(
        String(64)
    )  # ruc, registro_mercantil, ubo_identidad, etc.
    party_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, doc="Nombre del beneficiario final (documentos UBO)"
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    company: Mapped[Company] = relationship("Company", back_populates="documents")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (Index("ix_invoices_company_payer", "company_id", "payer"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    invoice_number: Mapped[str] = mapped_column(String(128), index=True)
    issuer: Mapped[str] = mapped_column(String(512))
    payer: Mapped[str] = mapped_column(String(512))
    payer_tax_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True, doc="RNC u otro ID del pagador (varios pagadores por emisor)"
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(InvoiceStatus, values_callable=_enum_values),
        default=InvoiceStatus.draft.value,
    )
    pdf_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    extraction: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )
    company: Mapped[Company] = relationship("Company")
    operation_links: Mapped[list["OperationInvoice"]] = relationship(
        "OperationInvoice", back_populates="invoice"
    )


class Quotation(Base):
    __tablename__ = "quotations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    invoice_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    amount_base: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    commission: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    operational_cost: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    status: Mapped[str] = mapped_column(
        Enum(QuotationStatus, values_callable=_enum_values),
        default=QuotationStatus.pending.value,
    )
    client_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    company: Mapped[Company] = relationship("Company")
    invoice: Mapped[Optional[Invoice]] = relationship("Invoice")


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    contract_type: Mapped[str] = mapped_column(
        Enum(ContractType, values_callable=_enum_values)
    )
    file_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    signature_status: Mapped[str] = mapped_column(
        Enum(SignatureStatus, values_callable=_enum_values),
        default=SignatureStatus.pending.value,
    )
    viafirma_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    company: Mapped[Company] = relationship("Company")


class FactoringOperation(Base):
    __tablename__ = "factoring_operations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(
        Enum(OperationStatus, values_callable=_enum_values),
        default=OperationStatus.draft.value,
    )
    total_invoiced: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0"))
    total_disbursed: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    quotation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("quotations.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    company: Mapped[Company] = relationship("Company")
    quotation: Mapped[Optional[Quotation]] = relationship("Quotation")
    invoices: Mapped[list["OperationInvoice"]] = relationship(
        "OperationInvoice", back_populates="operation", cascade="all, delete-orphan"
    )
    events: Mapped[list["OperationEvent"]] = relationship(
        "OperationEvent", back_populates="operation", cascade="all, delete-orphan"
    )


class OperationInvoice(Base):
    __tablename__ = "operation_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    operation_id: Mapped[int] = mapped_column(
        ForeignKey("factoring_operations.id", ondelete="CASCADE")
    )
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE")
    )
    amount_assigned: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    operation: Mapped[FactoringOperation] = relationship(
        "FactoringOperation", back_populates="invoices"
    )
    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="operation_links")


class OperationEvent(Base):
    __tablename__ = "operation_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    operation_id: Mapped[int] = mapped_column(
        ForeignKey("factoring_operations.id", ondelete="CASCADE")
    )
    event_type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(String(1024))
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    operation: Mapped[FactoringOperation] = relationship(
        "FactoringOperation", back_populates="events"
    )


class Disbursement(Base):
    __tablename__ = "disbursements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    operation_id: Mapped[int] = mapped_column(
        ForeignKey("factoring_operations.id", ondelete="CASCADE")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    status: Mapped[str] = mapped_column(
        Enum(DisbursementStatus, values_callable=_enum_values),
        default=DisbursementStatus.pending.value,
    )
    reference: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    operation: Mapped[FactoringOperation] = relationship("FactoringOperation")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    operation_id: Mapped[int] = mapped_column(
        ForeignKey("factoring_operations.id", ondelete="CASCADE")
    )
    payer: Mapped[str] = mapped_column(String(512))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    status: Mapped[str] = mapped_column(
        Enum(PaymentStatus, values_callable=_enum_values),
        default=PaymentStatus.expected.value,
    )
    received_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    operation: Mapped[FactoringOperation] = relationship("FactoringOperation")


class ValidationBatch(Base):
    __tablename__ = "validation_batches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    file_path: Mapped[str] = mapped_column(String(1024))
    original_name: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(
        Enum(ValidationStatus, values_callable=_enum_values),
        default=ValidationStatus.processing.value,
    )
    results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(64))  # n8n, other
    event_type: Mapped[str] = mapped_column(String(128))
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status: Mapped[str] = mapped_column(String(32), default="received")
