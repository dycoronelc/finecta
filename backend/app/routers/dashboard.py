from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, not_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, is_finecta_user
from app.db import models
from app.db.models.models import (
    BeneficialOwner,
    Disbursement,
    FactoringOperation,
    Invoice,
    KycStatus,
    OperationStatus,
    Quotation,
    QuotationStatus,
    UserRole,
)
from app.db.session import get_db
from app.schemas.core import DashboardKpis
from app.schemas.analytics import PortfolioAnalyticsOut
from app.services.analytics_portfolio import build_portfolio_analytics

router = APIRouter(prefix="/dashboard", tags=["Panel"])


@router.get("/kpis", response_model=DashboardKpis)
def kpis(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> DashboardKpis:
    if is_finecta_user(user) or user.role == UserRole.fiduciary.value:
        kyc = (
            db.execute(
                select(func.count())
                .select_from(BeneficialOwner)
                .where(
                    BeneficialOwner.kyc_status.in_(
                        (KycStatus.in_review.value, KycStatus.submitted.value)
                    )
                )
            ).scalar()
            or 0
        )
        open_op = (
            db.execute(
                select(func.count())
                .select_from(FactoringOperation)
                .where(
                    not_(
                        FactoringOperation.status.in_(
                            (
                                OperationStatus.closed.value,
                                OperationStatus.cancelled.value,
                            )
                        )
                    )
                )
            ).scalar()
            or 0
        )
        total_d = (
            db.execute(
                select(func.coalesce(func.sum(Disbursement.amount), 0))
            ).scalar()
            or 0
        )
        in_col = (
            db.execute(
                select(func.count())
                .select_from(FactoringOperation)
                .where(
                    FactoringOperation.status == OperationStatus.in_collection.value
                )
            ).scalar()
            or 0
        )
        qpen = (
            db.execute(
                select(func.count())
                .select_from(Quotation)
                .where(Quotation.status == QuotationStatus.pending.value)
            ).scalar()
            or 0
        )
        return DashboardKpis(
            kyc_pending=int(kyc),
            open_operations=int(open_op),
            total_disbursed=str(total_d),
            in_collection=int(in_col),
            my_invoices=0,
            my_operations=0,
            open_quotations=int(qpen),
        )
    if not user.client_id:
        return DashboardKpis()
    cid = user.client_id
    invc = (
        db.execute(
            select(func.count()).select_from(Invoice).where(Invoice.client_id == cid)
        ).scalar()
        or 0
    )
    ops = (
        db.execute(
            select(func.count())
            .select_from(FactoringOperation)
            .where(FactoringOperation.client_id == cid)
        ).scalar()
        or 0
    )
    qd = (
        db.execute(
            select(func.count())
            .select_from(Quotation)
            .where(
                Quotation.client_id == cid,
                Quotation.status == QuotationStatus.pending.value,
            )
        ).scalar()
        or 0
    )
    return DashboardKpis(
        my_invoices=int(invc),
        my_operations=int(ops),
        open_quotations=int(qd),
    )


@router.get(
    "/analytics",
    response_model=PortfolioAnalyticsOut,
    summary="Analítica de cartera: tendencias, RFM, clústeres (emisores)",
)
def portfolio_analytics(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> PortfolioAnalyticsOut:
    if user.role == UserRole.payer.value and not user.client_id:
        return PortfolioAnalyticsOut(
            has_data=False, scope="client", client_id=None, summary={}
        )
    return build_portfolio_analytics(db, user)
