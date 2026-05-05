from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, is_finecta_user, require_roles
from app.db import models
from app.db.models.models import BeneficialOwner, BeneficialOwnerDocument, Client, ClientBeneficialOwner, ClientDocument, ClientTimelineEvent, KycStatus, UserRole
from app.db.session import get_db
from app.schemas.core import (
    BeneficialOwnerCreate,
    BeneficialOwnerDocumentOut,
    BeneficialOwnerKycUpdate,
    BeneficialOwnerOut,
    ClientDetailOut,
    ClientDocumentOut,
    ClientGeneralUpdate,
    ClientOut,
    ClientStaffCreate,
    ClientTimelineEventOut,
    LinkBeneficialOwnerIn,
)
from app.services.client_timeline import add_client_timeline_event

router = APIRouter(prefix="/clients", tags=["Clientes y onboarding"])

CLIENT_DOCUMENT_TYPES = frozenset(
    {
        "ruc",
        "registro_mercantil",
        "rnc_documento",
        "acta_asamblea",
        "cedula_representante",
        "bank",
        "other",
    }
)

DOC_TYPE_LABELS: dict[str, str] = {
    "ruc": "RNC / documento general",
    "registro_mercantil": "Certificado de Registro Mercantil",
    "rnc_documento": "Constancia RNC",
    "acta_asamblea": "Acta de asamblea",
    "cedula_representante": "Identidad del representante legal",
    "bank": "Documento bancario",
    "other": "Otro documento",
}


def _count_ubos_with_identity(db: Session, client_id: int) -> int:
    """Beneficiarios finales vinculados al cliente que ya tienen al menos un documento de identidad."""
    n = (
        db.execute(
            select(func.count(func.distinct(BeneficialOwner.id)))
            .select_from(BeneficialOwner)
            .join(
                ClientBeneficialOwner,
                ClientBeneficialOwner.beneficial_owner_id == BeneficialOwner.id,
            )
            .join(
                BeneficialOwnerDocument,
                BeneficialOwnerDocument.beneficial_owner_id == BeneficialOwner.id,
            )
            .where(ClientBeneficialOwner.client_id == client_id)
        ).scalar()
        or 0
    )
    return int(n)


def _kyc_summary_for_client(db: Session, client_id: int) -> str | None:
    rows = list(
        db.scalars(
            select(BeneficialOwner.kyc_status)
            .join(
                ClientBeneficialOwner,
                ClientBeneficialOwner.beneficial_owner_id == BeneficialOwner.id,
            )
            .where(ClientBeneficialOwner.client_id == client_id)
        )
    )
    if not rows:
        return None
    rank = {"rejected": 5, "in_review": 4, "submitted": 3, "draft": 2, "approved": 1}
    return max(rows, key=lambda s: rank.get(s, 0))


def _can_access_client(user: models.User, client_id: int) -> bool:
    if is_finecta_user(user) or user.role == UserRole.fiduciary.value:
        return True
    return user.client_id == client_id


def _bo_linked_to_client(db: Session, client_id: int, beneficial_owner_id: int) -> bool:
    return (
        db.execute(
            select(ClientBeneficialOwner.id).where(
                ClientBeneficialOwner.client_id == client_id,
                ClientBeneficialOwner.beneficial_owner_id == beneficial_owner_id,
            )
        ).scalar_one_or_none()
        is not None
    )


def _client_detail_out(db: Session, c: Client) -> ClientDetailOut:
    bos = list(
        db.scalars(
            select(BeneficialOwner)
            .join(ClientBeneficialOwner, ClientBeneficialOwner.beneficial_owner_id == BeneficialOwner.id)
            .where(ClientBeneficialOwner.client_id == c.id)
            .order_by(BeneficialOwner.id.asc())
        )
    )
    return ClientDetailOut(
        id=c.id,
        legal_name=c.legal_name,
        trade_name=c.trade_name,
        tax_id=c.tax_id,
        contact_email=c.contact_email,
        phone=c.phone,
        contact_full_name=c.contact_full_name or "",
        created_at=c.created_at,
        beneficial_owners=[BeneficialOwnerOut.model_validate(b) for b in bos],
        kyc_summary=_kyc_summary_for_client(db, c.id),
    )


def _can_access_beneficial_owner(user: models.User, db: Session, bo_id: int) -> bool:
    if is_finecta_user(user) or user.role == UserRole.fiduciary.value:
        return True
    if not user.client_id:
        return False
    return _bo_linked_to_client(db, user.client_id, bo_id)


@router.get("", response_model=list[ClientOut])
def list_clients(
    kyc: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> list[ClientOut]:
    q = select(Client)
    if kyc:
        sub = (
            select(ClientBeneficialOwner.client_id)
            .join(BeneficialOwner, BeneficialOwner.id == ClientBeneficialOwner.beneficial_owner_id)
            .where(BeneficialOwner.kyc_status == kyc)
            .distinct()
        )
        q = q.where(Client.id.in_(sub))
    rows = list(db.scalars(q.order_by(Client.id.desc())))
    return [
        ClientOut.model_validate(c).model_copy(
            update={"kyc_summary": _kyc_summary_for_client(db, c.id)}
        )
        for c in rows
    ]


@router.post(
    "",
    response_model=ClientOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear cliente (Finecta)",
)
def create_client_staff(
    body: ClientStaffCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Client:
    c = Client(
        legal_name=body.legal_name.strip(),
        trade_name=body.trade_name.strip() if body.trade_name else None,
        tax_id=body.tax_id.strip(),
        contact_email=body.contact_email.strip(),
        phone=body.phone.strip() if body.phone else None,
        contact_full_name=body.contact_full_name.strip(),
    )
    db.add(c)
    db.flush()
    add_client_timeline_event(
        db,
        c.id,
        "created",
        f"Cliente «{c.legal_name}» registrado en el sistema",
    )
    db.commit()
    db.refresh(c)
    return c


@router.get("/mine", response_model=ClientDetailOut)
def get_my_client(
    db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
) -> ClientDetailOut:
    if not user.client_id:
        raise HTTPException(404, "Sin cliente vinculado")
    c = db.get(Client, user.client_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    return _client_detail_out(db, c)


@router.post(
    "/mine/submit-for-review",
    response_model=ClientDetailOut,
    summary="Cliente: enviar expediente a revisión (requiere al menos un UBO con identidad)",
)
def submit_kyc_for_review(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> ClientDetailOut:
    if user.role != UserRole.client.value or not user.client_id:
        raise HTTPException(403, "Solo clientes con cliente asignado")
    c = db.get(Client, user.client_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    linked = (
        db.execute(
            select(func.count()).select_from(ClientBeneficialOwner).where(
                ClientBeneficialOwner.client_id == c.id
            )
        ).scalar()
        or 0
    )
    if int(linked) < 1:
        raise HTTPException(
            400,
            "Debe registrar al menos un beneficiario final vinculado a su expediente.",
        )
    if _count_ubos_with_identity(db, c.id) < 1:
        raise HTTPException(
            400,
            "Para enviar a revisión, al menos un beneficiario final debe tener documento de identidad adjunto.",
        )
    for link in db.scalars(
        select(ClientBeneficialOwner).where(ClientBeneficialOwner.client_id == c.id)
    ):
        bo = link.beneficial_owner
        if bo.kyc_status == KycStatus.draft.value:
            bo.kyc_status = KycStatus.submitted.value
    add_client_timeline_event(
        db,
        c.id,
        "kyc_submitted",
        "Expediente KYC enviado a revisión por el cliente (beneficiarios finales)",
    )
    db.commit()
    db.refresh(c)
    return _client_detail_out(db, c)


@router.get("/{client_id}", response_model=ClientDetailOut)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> ClientDetailOut:
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    return _client_detail_out(db, c)


@router.get(
    "/{client_id}/timeline",
    response_model=list[ClientTimelineEventOut],
    summary="Línea de tiempo de actualizaciones del cliente",
)
def client_timeline(
    client_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[ClientTimelineEvent]:
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    if not db.get(Client, client_id):
        raise HTTPException(404, "Cliente no encontrado")
    return list(
        db.scalars(
            select(ClientTimelineEvent)
            .where(ClientTimelineEvent.client_id == client_id)
            .order_by(ClientTimelineEvent.id.asc())
        )
    )


@router.patch(
    "/{client_id}",
    response_model=ClientOut,
    summary="Actualizar datos generales del cliente (Finecta)",
)
def update_client_general(
    client_id: int,
    body: ClientGeneralUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> Client:
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    changed: list[str] = []
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None and hasattr(c, k):
            if isinstance(v, str):
                v = v.strip()
            setattr(c, k, v)
            changed.append(k)
    if changed:
        add_client_timeline_event(
            db,
            client_id,
            "general_updated",
            "Datos generales actualizados: " + ", ".join(changed),
        )
    db.commit()
    db.refresh(c)
    return c


@router.post(
    "/{client_id}/beneficial-owners",
    response_model=BeneficialOwnerOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar beneficiario final y vincularlo a este cliente",
)
def create_beneficial_owner_for_client(
    client_id: int,
    body: BeneficialOwnerCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> BeneficialOwner:
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    if not db.get(Client, client_id):
        raise HTTPException(404, "Cliente no encontrado")
    bo = BeneficialOwner(
        full_name=body.full_name.strip(),
        national_id=body.national_id.strip() if body.national_id else None,
        kyc_status=KycStatus.draft.value,
    )
    db.add(bo)
    db.flush()
    db.add(ClientBeneficialOwner(client_id=client_id, beneficial_owner_id=bo.id))
    add_client_timeline_event(
        db,
        client_id,
        "ubo_linked",
        f"Beneficiario final registrado: {bo.full_name}",
    )
    db.commit()
    db.refresh(bo)
    return bo


@router.post(
    "/{client_id}/beneficial-owners/link",
    response_model=BeneficialOwnerOut,
    summary="Vincular un beneficiario final existente a este cliente",
)
def link_existing_beneficial_owner(
    client_id: int,
    body: LinkBeneficialOwnerIn,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> BeneficialOwner:
    if not db.get(Client, client_id):
        raise HTTPException(404, "Cliente no encontrado")
    bo = db.get(BeneficialOwner, body.beneficial_owner_id)
    if not bo:
        raise HTTPException(404, "Beneficiario no encontrado")
    exists = db.execute(
        select(ClientBeneficialOwner.id).where(
            ClientBeneficialOwner.client_id == client_id,
            ClientBeneficialOwner.beneficial_owner_id == bo.id,
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(400, "El beneficiario ya está vinculado a este cliente")
    db.add(ClientBeneficialOwner(client_id=client_id, beneficial_owner_id=bo.id))
    add_client_timeline_event(
        db,
        client_id,
        "ubo_linked",
        f"Vinculado beneficiario final existente: {bo.full_name}",
    )
    db.commit()
    db.refresh(bo)
    return bo


@router.get(
    "/{client_id}/beneficial-owners/{bo_id}/documents",
    response_model=list[BeneficialOwnerDocumentOut],
    summary="Documentos de identidad del beneficiario (en contexto de este cliente)",
)
def list_bo_documents(
    client_id: int,
    bo_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[BeneficialOwnerDocument]:
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    if not _bo_linked_to_client(db, client_id, bo_id):
        raise HTTPException(404, "Beneficiario no vinculado a este cliente")
    return list(
        db.scalars(
            select(BeneficialOwnerDocument)
            .where(BeneficialOwnerDocument.beneficial_owner_id == bo_id)
            .order_by(BeneficialOwnerDocument.id.desc())
        )
    )


@router.post(
    "/{client_id}/beneficial-owners/{bo_id}/documents",
    response_model=BeneficialOwnerDocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Subir documento de identidad del beneficiario final",
)
def upload_bo_document(
    client_id: int,
    bo_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("identity"),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> BeneficialOwnerDocument:
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    if not _bo_linked_to_client(db, client_id, bo_id):
        raise HTTPException(404, "Beneficiario no vinculado a este cliente")
    bo = db.get(BeneficialOwner, bo_id)
    if not bo:
        raise HTTPException(404, "Beneficiario no encontrado")
    get_settings().UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix or ".bin"
    dest = get_settings().UPLOAD_DIR / "beneficial_owner" / str(bo_id)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{uuid.uuid4()}{ext}"
    with path.open("wb") as f:
        f.write(file.file.read())
    doc = BeneficialOwnerDocument(
        beneficial_owner_id=bo_id,
        file_path=str(path.relative_to(get_settings().UPLOAD_DIR)),
        original_name=file.filename or "documento",
        document_type=(document_type or "identity").strip()[:64] or "identity",
    )
    db.add(doc)
    db.flush()
    add_client_timeline_event(
        db,
        client_id,
        "document",
        f"Documento de identidad cargado — beneficiario final: {bo.full_name}",
    )
    db.commit()
    db.refresh(doc)
    return doc


@router.patch(
    "/{client_id}/beneficial-owners/{bo_id}/kyc",
    response_model=BeneficialOwnerOut,
    summary="Aprobar / actualizar estado KYC del beneficiario final (Finecta)",
)
def update_beneficial_owner_kyc(
    client_id: int,
    bo_id: int,
    body: BeneficialOwnerKycUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> BeneficialOwner:
    if not _bo_linked_to_client(db, client_id, bo_id):
        raise HTTPException(404, "Beneficiario no vinculado a este cliente")
    bo = db.get(BeneficialOwner, bo_id)
    if not bo:
        raise HTTPException(404, "Beneficiario no encontrado")
    prev = bo.kyc_status
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is not None and hasattr(bo, k):
            setattr(bo, k, v)
    if body.kyc_status == KycStatus.approved.value:
        bo.approved_at = datetime.now(timezone.utc)
    elif body.kyc_status is not None and body.kyc_status != KycStatus.approved.value:
        bo.approved_at = None
    if "kyc_status" in data and data.get("kyc_status") is not None and data["kyc_status"] != prev:
        add_client_timeline_event(
            db,
            client_id,
            "kyc_status",
            f"KYC beneficiario «{bo.full_name}»: {prev} → {data['kyc_status']}",
        )
    if "kyc_notes" in data and data.get("kyc_notes") and str(data["kyc_notes"]).strip():
        add_client_timeline_event(
            db,
            client_id,
            "kyc_note",
            f"Nota KYC ({bo.full_name}): {str(data['kyc_notes']).strip()[:200]}",
        )
    db.commit()
    db.refresh(bo)
    return bo


@router.post(
    "/{client_id}/beneficial-owners/{bo_id}/kyc-screening/request",
    response_model=BeneficialOwnerOut,
    summary="Solicitar consulta en listas para un beneficiario final (stub)",
)
def request_bo_kyc_screening(
    client_id: int,
    bo_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles(UserRole.admin, UserRole.analyst)),
) -> BeneficialOwner:
    if not _bo_linked_to_client(db, client_id, bo_id):
        raise HTTPException(404, "Beneficiario no vinculado a este cliente")
    bo = db.get(BeneficialOwner, bo_id)
    if not bo:
        raise HTTPException(404, "Beneficiario no encontrado")
    has_doc = (
        db.execute(
            select(func.count())
            .select_from(BeneficialOwnerDocument)
            .where(BeneficialOwnerDocument.beneficial_owner_id == bo_id)
        ).scalar()
        or 0
    )
    if int(has_doc) < 1:
        raise HTTPException(
            400,
            "Adjunte al menos un documento de identidad del beneficiario antes de solicitar la consulta en listas.",
        )
    screening = dict(bo.kyc_screening) if bo.kyc_screening else {}
    requests = list(screening.get("requests") or [])
    ref = f"LOCAL-{uuid.uuid4().hex[:12].upper()}"
    requests.append(
        {
            "reference": ref,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending_provider",
            "message": "Pendiente de integración con proveedor de búsquedas sobre el beneficiario final.",
        }
    )
    screening["requests"] = requests[-30:]
    screening["last_request_reference"] = ref
    screening["last_status"] = "pending_provider"
    screening["last_message"] = (
        "La solicitud quedó registrada. Cuando exista integración, "
        "el resultado aparecerá en esta sección."
    )
    bo.kyc_screening = screening
    add_client_timeline_event(
        db,
        client_id,
        "kyc_screening",
        f"Consulta en listas solicitada para beneficiario «{bo.full_name}» (ref. {ref})",
    )
    db.commit()
    db.refresh(bo)
    return bo


@router.post(
    "/{client_id}/documents",
    response_model=ClientDocumentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Subir documento del expediente del cliente (no UBO)",
)
def upload_client_doc(
    client_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("ruc"),
    party_name: str | None = Form(None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> ClientDocument:
    if user.role == UserRole.client.value and user.client_id != client_id:
        raise HTTPException(403, "Acceso denegado")
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    dt = (document_type or "ruc").strip()[:64]
    if dt not in CLIENT_DOCUMENT_TYPES:
        raise HTTPException(
            400,
            f"document_type no válido. Use uno de: {', '.join(sorted(CLIENT_DOCUMENT_TYPES))}",
        )
    pn = (party_name or "").strip()[:255] or None
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    get_settings().UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix or ".bin"
    dest = get_settings().UPLOAD_DIR / "client" / str(client_id)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{uuid.uuid4()}{ext}"
    with path.open("wb") as f:
        f.write(file.file.read())
    doc = ClientDocument(
        client_id=client_id,
        file_path=str(path.relative_to(get_settings().UPLOAD_DIR)),
        original_name=file.filename or "documento",
        document_type=dt,
        party_name=pn,
    )
    db.add(doc)
    db.flush()
    label = DOC_TYPE_LABELS.get(dt, dt)
    msg = f"Documento cargado: {label}"
    if pn:
        msg += f" — {pn}"
    add_client_timeline_event(db, client_id, "document", msg)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{client_id}/documents", response_model=list[ClientDocumentOut])
def list_client_documents(
    client_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> list[ClientDocument]:
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Acceso denegado")
    if not db.get(Client, client_id):
        raise HTTPException(404, "Cliente no encontrado")
    return list(
        db.scalars(
            select(ClientDocument)
            .where(ClientDocument.client_id == client_id)
            .order_by(ClientDocument.id.desc())
        )
    )
