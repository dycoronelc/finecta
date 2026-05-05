from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db import models
from app.db.models.models import Invoice, Payer, UserRole
from app.db.session import get_db
from app.schemas.core import PayerGeneralUpdate, PayerOut, PayerStaffCreate

router = APIRouter(prefix="/payers", tags=["Pagadores"])


@router.get("", response_model=list[PayerOut])
def list_payers(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> list[Payer]:
    return list(db.scalars(select(Payer).order_by(Payer.id.desc())))


@router.post(
    "",
    response_model=PayerOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear pagador (Finecta)",
)
def create_payer(
    body: PayerStaffCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Payer:
    tid = body.tax_id.strip()
    if tid and tid != "SIN-RNC":
        dup = db.scalar(select(Payer.id).where(Payer.tax_id == tid))
        if dup is not None:
            raise HTTPException(400, "Ya existe un pagador con ese RUC / tax_id")
    p = Payer(
        legal_name=body.legal_name.strip(),
        trade_name=body.trade_name.strip() if body.trade_name else None,
        tax_id=body.tax_id.strip(),
        contact_email=body.contact_email.strip(),
        phone=body.phone.strip() if body.phone else None,
        contact_full_name=body.contact_full_name.strip(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("/{payer_id}", response_model=PayerOut)
def get_payer(
    payer_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Payer:
    p = db.get(Payer, payer_id)
    if not p:
        raise HTTPException(404, "Pagador no encontrado")
    return p


@router.patch("/{payer_id}", response_model=PayerOut)
def update_payer(
    payer_id: int,
    body: PayerGeneralUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Payer:
    p = db.get(Payer, payer_id)
    if not p:
        raise HTTPException(404, "Pagador no encontrado")
    if body.tax_id is not None and body.tax_id.strip() != p.tax_id:
        nt = body.tax_id.strip()
        if nt and nt != "SIN-RNC":
            dup = db.scalar(
                select(Payer.id).where(Payer.tax_id == nt, Payer.id != payer_id)
            )
            if dup is not None:
                raise HTTPException(400, "Ya existe otro pagador con ese RUC / tax_id")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None and hasattr(p, k):
            if k in ("legal_name", "tax_id", "contact_email", "contact_full_name"):
                setattr(p, k, str(v).strip())
            elif k == "trade_name":
                setattr(p, k, str(v).strip() if v else None)
            elif k == "phone":
                setattr(p, k, str(v).strip() if v else None)
            else:
                setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete(
    "/{payer_id}",
    summary="Eliminar pagador (solo si no hay facturas)",
)
def delete_payer(
    payer_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Response:
    p = db.get(Payer, payer_id)
    if not p:
        raise HTTPException(404, "Pagador no encontrado")
    n = (
        db.scalar(
            select(func.count()).select_from(Invoice).where(Invoice.payer_id == payer_id)
        )
        or 0
    )
    if int(n) > 0:
        raise HTTPException(
            400, "No se puede eliminar: hay facturas vinculadas a este pagador."
        )
    db.delete(p)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
