"""Esquemas para analítica de cartera (RFM, tendencias, clustering)."""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class ClientVolumeOut(BaseModel):
    client_id: int
    legal_name: str
    invoice_count: int
    total_amount: str
    share_percent: float = 0.0


class MonthlyPointOut(BaseModel):
    month: str  # YYYY-MM
    label: str  # Ene 2025
    amount: str
    invoice_count: int


class IssuerBarOut(BaseModel):
    issuer: str
    amount: str
    invoice_count: int


class RfmIssuerOut(BaseModel):
    issuer: str
    recency_days: int
    frequency: int
    monetary: str
    r_score: int
    f_score: int
    m_score: int
    segment: str


class RfmSegmentCountOut(BaseModel):
    segment: str
    count: int
    key: str


class ClusterOut(BaseModel):
    cluster_id: int
    label: str
    count: int


class ClusterPointOut(BaseModel):
    issuer: str
    cluster_id: int
    label: str
    rfm_score: str  # p.ej. "3-2-3"


class PortfolioAnalyticsOut(BaseModel):
    has_data: bool = True
    scope: str  # "platform" | "client"
    client_id: int | None = None
    summary: dict[str, Any] = Field(
        default_factory=dict,
        description="Facturas, emisores únicos, monto promedio, rango de fechas",
    )
    volume_by_client: list[ClientVolumeOut] = []
    monthly_trend: list[MonthlyPointOut] = []
    top_issuers: list[IssuerBarOut] = []
    rfm_issuers: list[RfmIssuerOut] = []
    rfm_segments: list[RfmSegmentCountOut] = []
    clusters: list[ClusterOut] = []
    cluster_assignments: list[ClusterPointOut] = []
