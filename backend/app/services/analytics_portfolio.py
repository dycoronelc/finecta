"""
Analítica de cartera: tendencias, volumen por empresa, RFM por emisor (proveedor) y clústeres K-Means.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import is_finecta_user
from app.db import models
from app.db.models.models import UserRole
from app.schemas.analytics import (
    ClientVolumeOut,
    ClusterOut,
    ClusterPointOut,
    IssuerBarOut,
    MonthlyPointOut,
    PortfolioAnalyticsOut,
    RfmIssuerOut,
    RfmSegmentCountOut,
)


def _date_today() -> date:
    return date.today()


def _inv_effective_date(inv) -> date | None:
    if inv.due_date is not None:
        return inv.due_date
    if inv.created_at is not None:
        return inv.created_at.date() if isinstance(inv.created_at, datetime) else inv.created_at
    return None


def _quintile_scores_1_5(
    values: list[float], *, lower_is_better: bool
) -> list[int]:
    """
    5 = mejor emisor. Recencia: días; menor = mejor. F, M: mayor = mejor.
    """
    a = np.array(values, dtype=float)
    n = a.size
    if n == 0:
        return []
    if n == 1:
        return [3]
    if lower_is_better:
        order = np.argsort(a)  # índice del mejor (menor valor) primero
    else:
        order = np.argsort(-a)
    out = [3] * n
    for rank, idx in enumerate(order):
        s = 5.0 - 4.0 * rank / (n - 1)
        out[idx] = int(max(1, min(5, round(s))))
    return out


def _segment_rfm(r: int, f: int, m: int) -> tuple[str, str]:
    s = r + f + m
    if s >= 13 and r >= 3 and f >= 3 and m >= 3:
        return "Campeones", "champions"
    if s >= 10 and r >= 2:
        return "En crecimiento", "growth"
    if r >= 3 or s >= 8:
        return "Fieles", "loyal"
    if r == 1 or s <= 5:
        return "Hibernando", "dormant"
    return "En riesgo", "at_risk"


def _month_label(ym: str) -> str:
    try:
        y, m = int(ym[:4]), int(ym[5:7])
        meses = "ene,feb,mar,abr,may,jun,jul,ago,sep,oct,nov,dic".split(",")
        return f"{meses[m - 1].capitalize()} {y % 100}"
    except (ValueError, IndexError):
        return ym


def build_portfolio_analytics(
    db: Session,
    user: models.User,
) -> PortfolioAnalyticsOut:
    today = _date_today()
    q = select(models.Invoice)
    if is_finecta_user(user) or user.role == UserRole.fiduciary.value:
        scope = "platform"
        client_id = None
    else:
        if not user.client_id:
            return PortfolioAnalyticsOut(
                has_data=False,
                scope="client",
                client_id=None,
            )
        q = q.where(models.Invoice.client_id == user.client_id)
        scope = "client"
        client_id = user.client_id

    invoices = list(db.execute(q).scalars().all())
    if not invoices:
        return PortfolioAnalyticsOut(
            has_data=False,
            scope=scope,
            client_id=client_id,
        )

    amounts: list[Decimal] = [inv.amount for inv in invoices]
    total_m = sum(amounts, Decimal(0))
    n_inv = len(invoices)
    by_client: dict[int, list] = defaultdict(lambda: [0, Decimal(0)])
    by_issuer: dict[str, list] = defaultdict(
        lambda: {
            "amounts": [],
            "dates": [],
        }
    )
    by_month: dict[str, list[Decimal]] = defaultdict(list)

    for inv in invoices:
        cid = inv.client_id
        by_client[cid][0] += 1
        by_client[cid][1] += inv.amount
        by_issuer[inv.issuer]["amounts"].append(float(inv.amount))
        d = _inv_effective_date(inv)
        if d:
            by_issuer[inv.issuer]["dates"].append(d)
        ref = _inv_effective_date(inv) or (inv.created_at.date() if inv.created_at else None)
        if ref:
            key = f"{ref.year:04d}-{ref.month:02d}"
            by_month[key].append(inv.amount)

    client_names: dict[int, str] = {}
    for cid in by_client:
        c = db.get(models.Client, cid)
        client_names[cid] = c.legal_name if c else f"ID {cid}"

    vol_c: list[ClientVolumeOut] = []
    for cid, (cnt, am) in by_client.items():
        pct = float((am / total_m * 100) if total_m > 0 else 0)
        vol_c.append(
            ClientVolumeOut(
                client_id=cid,
                legal_name=client_names.get(cid, str(cid))[:200],
                invoice_count=cnt,
                total_amount=str(round(am, 2)),
                share_percent=round(pct, 1),
            )
        )
    vol_c.sort(key=lambda x: -float(x.total_amount))

    months_sorted = sorted(by_month.keys())
    monthly: list[MonthlyPointOut] = []
    for ym in months_sorted[-18:]:  # últimos 18 meses como máximo
        am = sum(by_month[ym], Decimal(0))
        c = len(by_month[ym])
        monthly.append(
            MonthlyPointOut(
                month=ym,
                label=_month_label(ym),
                amount=str(round(am, 2)),
                invoice_count=c,
            )
        )

    issuer_m = {
        k: (sum(v["amounts"]), len(v["amounts"]))
        for k, v in by_issuer.items()
    }
    top_is = sorted(issuer_m.items(), key=lambda x: -x[1][0])[:15]
    top_issuers = [
        IssuerBarOut(
            issuer=(name[:100] if len(name) > 100 else name),
            amount=str(round(Decimal(str(total)), 2)),
            invoice_count=count,
        )
        for name, (total, count) in top_is
    ]

    rfm_issuers: list[RfmIssuerOut] = []
    iss_list = list(by_issuer.items())
    recs: list[float] = []
    freqs: list[int] = []
    mons: list[float] = []
    iss_names: list[str] = []
    for name, d in by_issuer.items():
        ds = d["dates"]
        if not ds:
            rdays = 9999
        else:
            last = max(ds)
            rdays = max(0, (today - last).days)
        freq = len(d["amounts"])
        mon = float(sum(d["amounts"]))
        recs.append(float(rdays))
        freqs.append(int(freq))
        mons.append(mon)
        iss_names.append(name)
    n = len(iss_list)
    if n > 0:
        r_s = _quintile_scores_1_5(recs, lower_is_better=True)
        f_s = _quintile_scores_1_5(
            [float(x) for x in freqs], lower_is_better=False
        )
        m_s = _quintile_scores_1_5(mons, lower_is_better=False)
    else:
        r_s, f_s, m_s = [], [], []

    seg_count: dict[str, int] = defaultdict(int)
    for i in range(n):
        r, f, m = r_s[i], f_s[i], m_s[i]
        label, k = _segment_rfm(r, f, m)
        seg_count[k] += 1
        rfm_issuers.append(
            RfmIssuerOut(
                issuer=(iss_names[i][:200] if len(iss_names[i]) > 200 else iss_names[i]),
                recency_days=int(recs[i]),
                frequency=freqs[i],
                monetary=str(round(Decimal(str(mons[i])), 2)),
                r_score=int(r_s[i]) if r_s else 0,
                f_score=int(f_s[i]) if f_s else 0,
                m_score=int(m_s[i]) if m_s else 0,
                segment=label,
            )
        )
    rfm_issuers.sort(key=lambda x: -float(x.monetary))

    seg_map = {
        "champions": "Campeones",
        "growth": "En crecimiento",
        "loyal": "Fieles",
        "at_risk": "En riesgo",
        "dormant": "Hibernando",
    }
    rfm_segments: list[RfmSegmentCountOut] = []
    for k, c in seg_count.items():
        rfm_segments.append(
            RfmSegmentCountOut(segment=seg_map.get(k, k), count=c, key=k)
        )
    rfm_segments.sort(key=lambda x: -x.count)

    clusters_out: list[ClusterOut] = []
    cl_assign: list[ClusterPointOut] = []
    n_sample = n
    if n_sample >= 3:
        n_cl = min(4, n_sample)
        if n_cl >= n_sample:
            n_cl = n_sample - 1
        if n_cl < 1:
            n_cl = 1
        X = np.column_stack(
            [np.log1p(recs), np.log1p(np.array(freqs, dtype=float)), np.log1p(mons)]
        )
        sc = StandardScaler()
        Xs = sc.fit_transform(X)
        km = KMeans(
            n_clusters=n_cl, random_state=42, n_init=10, max_iter=300
        )
        lab = km.fit_predict(Xs)
        center_m = [float(km.cluster_centers_[c][2]) for c in range(n_cl)]
        order = list(np.argsort(center_m))
        cl_labels: dict[int, str] = {}
        names_rank = [
            "Alto valor (clúster)",
            "Valor medio",
            "Valor bajo - emergente",
            "Bajo monto frecuente",
        ]
        for rank, cidx in enumerate(order):
            cl_labels[cidx] = names_rank[min(rank, len(names_rank) - 1)]
        for c in range(n_cl):
            co = int(np.sum(lab == c))
            clusters_out.append(ClusterOut(cluster_id=c, label=cl_labels[c], count=co))
        for i in range(n):
            cid = int(lab[i])
            rfm = f"{r_s[i]}-{f_s[i]}-{m_s[i]}"
            cl_assign.append(
                ClusterPointOut(
                    issuer=iss_names[i][:150],
                    cluster_id=cid,
                    label=cl_labels[cid],
                    rfm_score=rfm,
                )
            )
        cl_assign.sort(key=lambda x: (x.cluster_id, x.issuer))

    min_d = min((_inv_effective_date(i) for i in invoices if _inv_effective_date(i) is not None), default=None)
    max_d = max(
        (d for i in invoices if (d := _inv_effective_date(i)) is not None), default=None
    )
    summary: dict[str, Any] = {
        "invoices": n_inv,
        "total_amount": str(round(total_m, 2)),
        "unique_issuers": len(by_issuer),
        "avg_ticket": str(round((total_m / n_inv) if n_inv else Decimal(0), 2)),
        "date_from": min_d.isoformat() if min_d else None,
        "date_to": max_d.isoformat() if max_d else None,
    }

    return PortfolioAnalyticsOut(
        has_data=True,
        scope=scope,
        client_id=client_id,
        summary=summary,
        volume_by_client=vol_c,
        monthly_trend=monthly,
        top_issuers=top_issuers[:10],
        rfm_issuers=rfm_issuers[:25],
        rfm_segments=rfm_segments,
        clusters=clusters_out,
        cluster_assignments=cl_assign[:40],
    )
