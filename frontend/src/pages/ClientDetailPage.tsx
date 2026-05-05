import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, base } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { FilePicker } from "../components/ui/FilePicker";
import { StatusBadge } from "../components/ui/StatusBadge";
import { fmtDate, fmtDateShort, money } from "../lib/format";

type BeneficialOwnerRow = {
  id: number;
  full_name: string;
  national_id: string | null;
  kyc_status: string;
  kyc_notes: string | null;
  kyc_screening: {
    requests?: Array<Record<string, unknown>>;
    last_status?: string;
    last_message?: string;
    last_request_reference?: string;
  } | null;
  approved_at: string | null;
  created_at: string;
};

type ClientDetail = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  contact_email: string;
  phone: string | null;
  contact_full_name: string;
  created_at: string;
  beneficial_owners: BeneficialOwnerRow[];
  kyc_summary?: string | null;
};

type Doc = {
  id: number;
  original_name: string;
  document_type: string;
  party_name: string | null;
  uploaded_at: string;
};

type TimelineEv = {
  id: number;
  event_type: string;
  message: string;
  created_at: string;
};

type ClientInvPayer = { id: number; legal_name: string; tax_id: string };

type ClientInvRow = {
  id: number;
  invoice_number: string;
  issuer: string;
  payer_id: number;
  payer: ClientInvPayer;
  amount: string;
  due_date: string | null;
  status: string;
  pdf_path?: string | null;
  created_at: string;
};

type PayerCatalogRow = { id: number; legal_name: string; tax_id: string };

type ClientQuotRow = {
  id: number;
  client_id: number;
  invoice_id: number | null;
  amount_base: string;
  commission: string;
  operational_cost: string;
  status: string;
  client_comment: string | null;
  created_at: string;
};

function parseRouteClientId(param: string | undefined): number | null {
  if (param == null) return null;
  const t = param.trim();
  if (t === "" || t === "nuevo" || t === "undefined") return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const EXPEDIENTE_DOCS: { type: string; label: string }[] = [
  { type: "registro_mercantil", label: "Certificado de Registro Mercantil" },
  { type: "rnc_documento", label: "RNC" },
  { type: "acta_asamblea", label: "Acta de asamblea (representante legal y atribuciones)" },
  { type: "cedula_representante", label: "Cédula o pasaporte del representante legal del acta" },
];

type TabId = "general" | "docs" | "kyc" | "invoices" | "quotations";

export function ClientDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "analyst";
  const canUploadInvoice = user?.role === "client" || staff;
  const isNew = !id || id === "nuevo";
  const [tab, setTab] = useState<TabId>("general");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [co, setCo] = useState<ClientDetail | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [timeline, setTimeline] = useState<TimelineEv[]>([]);
  const [kycBoId, setKycBoId] = useState<number | null>(null);

  const [invRows, setInvRows] = useState<ClientInvRow[]>([]);
  const [invQ, setInvQ] = useState("");
  const [invSt, setInvSt] = useState<string | "">("");
  const [invFile, setInvFile] = useState<File | null>(null);
  const [invEdit, setInvEdit] = useState<ClientInvRow | null>(null);
  const [invEditForm, setInvEditForm] = useState({
    invoice_number: "",
    issuer: "",
    payer_id: "",
    amount: "",
    due_date: "",
    status: "",
  });
  const [payerCatalog, setPayerCatalog] = useState<PayerCatalogRow[]>([]);
  const [invoicePayerOpts, setInvoicePayerOpts] = useState<PayerCatalogRow[]>([]);
  const [uploadPayerId, setUploadPayerId] = useState("");

  const [qRows, setQRows] = useState<ClientQuotRow[]>([]);
  const [qInvOptions, setQInvOptions] = useState<ClientInvRow[]>([]);
  const [qInvId, setQInvId] = useState("");
  const [qAmountBase, setQAmountBase] = useState("");
  const [qOpCost, setQOpCost] = useState("0");
  const [qCommRate, setQCommRate] = useState("0.02");
  const [qEdit, setQEdit] = useState<ClientQuotRow | null>(null);
  const [qEditForm, setQEditForm] = useState({
    amount_base: "",
    commission: "",
    operational_cost: "",
  });

  const [legal_name, setLegalName] = useState("");
  const [trade_name, setTradeName] = useState("");
  const [tax_id, setTaxId] = useState("");
  const [contact_email, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contact_full_name, setContactFullName] = useState("");

  const [uboName, setUboName] = useState("");
  const [uboNationalId, setUboNationalId] = useState("");
  const [uboFile, setUboFile] = useState<File | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const loadClient = useCallback(async (clientId: number) => {
    const c = await api<ClientDetail>(`/clients/${clientId}`);
    setCo(c);
    setLegalName(c.legal_name);
    setTradeName(c.trade_name ?? "");
    setTaxId(c.tax_id);
    setContactEmail(c.contact_email);
    setPhone(c.phone ?? "");
    setContactFullName(c.contact_full_name ?? "");
    if (c.beneficial_owners.length > 0) {
      setKycBoId((prev) => (prev != null && c.beneficial_owners.some((b) => b.id === prev) ? prev : c.beneficial_owners[0].id));
    } else {
      setKycBoId(null);
    }
    return c;
  }, []);

  const loadDocs = useCallback(async (clientId: number) => {
    const d = await api<Doc[]>(`/clients/${clientId}/documents`);
    setDocs(d);
  }, []);

  const loadTimeline = useCallback(async (clientId: number) => {
    try {
      const t = await api<TimelineEv[]>(`/clients/${clientId}/timeline`);
      setTimeline(t);
    } catch {
      setTimeline([]);
    }
  }, []);

  const loadClientInvoices = useCallback(async () => {
    if (!co) return;
    const p = new URLSearchParams();
    p.set("client_id", String(co.id));
    const qTrim = invQ.trim();
    if (qTrim) p.set("q", qTrim);
    if (invSt) p.set("status", invSt);
    const data = await api<ClientInvRow[]>(`/invoices?${p.toString()}`);
    setInvRows(data);
  }, [co, invQ, invSt]);

  const loadClientQuotations = useCallback(async () => {
    if (!co) return;
    const data = await api<ClientQuotRow[]>(`/quotations?client_id=${co.id}`);
    setQRows(data);
  }, [co]);

  useEffect(() => {
    if (isNew || !id) {
      setCo(null);
      setDocs([]);
      setLegalName("");
      setTradeName("");
      setTaxId("");
      setContactEmail("");
      setPhone("");
      setContactFullName("");
      setTimeline([]);
      setKycBoId(null);
      return;
    }
    const cid = parseRouteClientId(id);
    if (cid == null) {
      setErr("Identificador inválido");
      return;
    }
    setErr(null);
    Promise.all([loadClient(cid), loadDocs(cid), loadTimeline(cid)]).catch((e) =>
      setErr(e instanceof Error ? e.message : "Error")
    );
  }, [id, isNew, loadClient, loadDocs, loadTimeline]);

  useEffect(() => {
    if (!co || isNew || tab !== "invoices") return;
    loadClientInvoices().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [co?.id, tab, invSt, isNew, loadClientInvoices]);

  useEffect(() => {
    if (!co || isNew || tab !== "quotations") return;
    loadClientQuotations().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [co?.id, tab, isNew, loadClientQuotations]);

  useEffect(() => {
    if (!co || isNew || tab !== "quotations" || !staff) return;
    api<ClientInvRow[]>(`/invoices?client_id=${co.id}&limit=500`)
      .then(setQInvOptions)
      .catch(() => setQInvOptions([]));
  }, [co?.id, tab, staff, isNew]);

  useEffect(() => {
    if (!staff || !co || isNew || tab !== "invoices") return;
    api<PayerCatalogRow[]>("/payers")
      .then(setPayerCatalog)
      .catch(() => setPayerCatalog([]));
  }, [staff, co?.id, tab, isNew]);

  useEffect(() => {
    if (!co || isNew || tab !== "invoices") return;
    api<PayerCatalogRow[]>(`/invoices/payer-options?client_id=${co.id}`)
      .then(setInvoicePayerOpts)
      .catch(() => setInvoicePayerOpts([]));
  }, [co?.id, tab, isNew]);

  useEffect(() => {
    if (!invEdit) return;
    setInvEditForm({
      invoice_number: invEdit.invoice_number,
      issuer: invEdit.issuer,
      payer_id: String(invEdit.payer_id),
      amount: invEdit.amount,
      due_date: invEdit.due_date ? invEdit.due_date.slice(0, 10) : "",
      status: invEdit.status,
    });
  }, [invEdit]);

  useEffect(() => {
    if (!qEdit) return;
    setQEditForm({
      amount_base: qEdit.amount_base,
      commission: qEdit.commission,
      operational_cost: qEdit.operational_cost,
    });
  }, [qEdit]);

  async function openInvoicePdf(invId: number) {
    const tok = localStorage.getItem("finecta_token");
    const headers: Record<string, string> = {};
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const r = await fetch(`${base}/invoices/${invId}/pdf`, { headers });
    if (!r.ok) {
      setErr("No se pudo abrir el PDF");
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  async function uploadClientInvoice() {
    if (!co || !invFile) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", invFile);
      const p = new URLSearchParams();
      if (staff) p.set("client_id", String(co.id));
      if (staff && uploadPayerId) p.set("payer_id", uploadPayerId);
      const qs = p.toString();
      await api<ClientInvRow>(`/invoices${qs ? `?${qs}` : ""}`, { method: "POST", formData: fd });
      setInvFile(null);
      await loadClientInvoices();
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteClientInvoice(invId: number) {
    if (!co || !window.confirm("¿Eliminar esta factura? Esta acción no se puede deshacer.")) return;
    setErr(null);
    try {
      await api(`/invoices/${invId}`, { method: "DELETE" });
      await loadClientInvoices();
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function saveInvoicePatch() {
    if (!co || !invEdit) return;
    setErr(null);
    try {
      const pid = parseInt(invEditForm.payer_id, 10);
      if (!Number.isFinite(pid) || pid <= 0) {
        setErr("Seleccione un pagador válido.");
        return;
      }
      await api<ClientInvRow>(`/invoices/${invEdit.id}`, {
        method: "PATCH",
        json: {
          invoice_number: invEditForm.invoice_number.trim(),
          issuer: invEditForm.issuer.trim(),
          payer_id: pid,
          amount: invEditForm.amount,
          due_date: invEditForm.due_date.trim() ? invEditForm.due_date.trim() : null,
          status: invEditForm.status || undefined,
        },
      });
      setInvEdit(null);
      await loadClientInvoices();
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function createClientQuotation() {
    if (!co || !staff) return;
    const iid = Number(qInvId);
    const baseN = parseFloat(String(qAmountBase).replace(",", "."));
    const opN = parseFloat(String(qOpCost).replace(",", ".")) || 0;
    const rateN = parseFloat(String(qCommRate).replace(",", "."));
    if (!iid || Number.isNaN(baseN) || baseN <= 0) {
      setErr("Seleccione factura e importe base válidos.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api<ClientQuotRow>("/quotations", {
        method: "POST",
        json: {
          invoice_id: iid,
          amount_base: baseN,
          commission_rate: Number.isNaN(rateN) ? 0.02 : rateN,
          operational_cost: opN,
        },
      });
      setQAmountBase("");
      setQInvId("");
      await loadClientQuotations();
      await loadClientInvoices();
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function saveQuotationPatch() {
    if (!co || !qEdit) return;
    setErr(null);
    try {
      await api<ClientQuotRow>(`/quotations/${qEdit.id}`, {
        method: "PATCH",
        json: {
          amount_base: parseFloat(qEditForm.amount_base.replace(",", ".")),
          commission: parseFloat(qEditForm.commission.replace(",", ".")),
          operational_cost: parseFloat(qEditForm.operational_cost.replace(",", ".")),
        },
      });
      setQEdit(null);
      await loadClientQuotations();
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function cancelClientQuotation(qid: number) {
    if (!window.confirm("¿Anular esta cotización pendiente?")) return;
    setErr(null);
    try {
      await api(`/quotations/${qid}`, { method: "PATCH", json: { status: "expired" } });
      await loadClientQuotations();
      if (co) {
        await loadClientInvoices();
        await loadTimeline(co.id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function respondClientQuotation(qid: number, accept: boolean) {
    if (!co) return;
    setErr(null);
    try {
      await api(`/quotations/${qid}/respond`, { method: "POST", json: { accept, comment: "" } });
      await loadClientQuotations();
      await loadClientInvoices();
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function saveGeneral() {
    setErr(null);
    setBusy(true);
    try {
      if (isNew) {
        const c = await api<{ id: number }>("/clients", {
          method: "POST",
          json: {
            legal_name: legal_name.trim(),
            trade_name: trade_name.trim() || null,
            tax_id: tax_id.trim(),
            contact_email: contact_email.trim(),
            phone: phone.trim() || null,
            contact_full_name: contact_full_name.trim(),
          },
        });
        nav(`/app/clientes/${c.id}`, { replace: true });
        return;
      }
      const routeId = parseRouteClientId(id);
      const fromCo = co != null && typeof co.id === "number" && co.id > 0 ? co.id : null;
      const clientId = fromCo ?? routeId;
      if (clientId == null) {
        setErr("No se pudo identificar el cliente para guardar cambios.");
        return;
      }
      const c = await api<ClientDetail>(`/clients/${clientId}`, {
        method: "PATCH",
        json: {
          legal_name: legal_name.trim(),
          trade_name: trade_name.trim() || null,
          tax_id: tax_id.trim(),
          contact_email: contact_email.trim(),
          phone: phone.trim() || null,
          contact_full_name: contact_full_name.trim(),
        },
      });
      await loadClient(c.id);
      await loadTimeline(c.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocType(docType: string, file: File | null): Promise<void> {
    if (!file || !co) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("document_type", docType);
      await api(`/clients/${co.id}/documents`, { method: "POST", formData: fd });
      await loadDocs(co.id);
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadUbo() {
    if (!co || !uboFile || !uboName.trim()) {
      setErr("Indique nombre completo del beneficiario final y el archivo de identidad.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const bo = await api<BeneficialOwnerRow>(`/clients/${co.id}/beneficial-owners`, {
        method: "POST",
        json: {
          full_name: uboName.trim(),
          national_id: uboNationalId.trim() || null,
        },
      });
      const fd = new FormData();
      fd.append("file", uboFile);
      fd.append("document_type", "identity");
      await api(`/clients/${co.id}/beneficial-owners/${bo.id}/documents`, { method: "POST", formData: fd });
      setUboFile(null);
      setUboName("");
      setUboNationalId("");
      await loadClient(co.id);
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const selectedBo = co?.beneficial_owners.find((b) => b.id === kycBoId) ?? null;

  async function requestScreening() {
    if (!co || kycBoId == null) {
      setErr("Seleccione un beneficiario final para la consulta en listas.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api<BeneficialOwnerRow>(`/clients/${co.id}/beneficial-owners/${kycBoId}/kyc-screening/request`, {
        method: "POST",
      });
      await loadClient(co.id);
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function setKycStatus(s: BeneficialOwnerRow["kyc_status"]) {
    if (!co || kycBoId == null) return;
    setBusy(true);
    setErr(null);
    try {
      const body: { kyc_status: string; kyc_notes?: string } = { kyc_status: s };
      if (s === "rejected") {
        if (!rejectNotes.trim()) {
          setErr("Indique el motivo del rechazo.");
          setBusy(false);
          return;
        }
        body.kyc_notes = rejectNotes.trim();
      }
      await api<BeneficialOwnerRow>(`/clients/${co.id}/beneficial-owners/${kycBoId}/kyc`, {
        method: "PATCH",
        json: body,
      });
      setRejectNotes("");
      await loadClient(co.id);
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (t: TabId, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      className={`rounded-xl px-4 py-2 text-sm font-medium border transition ${
        tab === t
          ? "bg-orange-50 border-orange-200 text-orange-900"
          : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
      }`}
    >
      {label}
    </button>
  );

  const docsByType = (t: string) => docs.filter((d) => d.document_type === t);

  return (
    <div className="f-page w-full min-w-0">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link to="/app/clientes" className="hover:text-orange-600">
          Clientes
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">{isNew ? "Nuevo cliente" : co?.legal_name ?? "…"}</span>
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 mt-2">
        {isNew ? "Alta de cliente" : "Ficha de cliente"}
      </h1>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

      <div className="flex flex-wrap gap-2 mt-4">
        {tabBtn("general", "Datos generales")}
        {tabBtn("docs", "Documentación")}
        {tabBtn("kyc", "KYC")}
        {co && !isNew && tabBtn("invoices", "Facturas")}
        {co && !isNew && tabBtn("quotations", "Cotizaciones")}
      </div>

      {tab === "general" && (
        <div className="mt-4 space-y-4 w-full min-w-0">
          <div className="f-panel w-full min-w-0 space-y-4">
            <p className="text-sm text-zinc-600">
              Datos del cliente. El RUC/RIF identifica al contribuyente; el contacto principal es la persona de
              referencia ante Finecta.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="min-w-0 sm:col-span-2 lg:col-span-2">
                <label className="text-xs text-zinc-500">Nombre de la empresa / razón social</label>
                <input className="f-input mt-1 w-full" value={legal_name} onChange={(e) => setLegalName(e.target.value)} required />
              </div>
              <div className="min-w-0">
                <label className="text-xs text-zinc-500">Nombre comercial (opcional)</label>
                <input className="f-input mt-1 w-full" value={trade_name} onChange={(e) => setTradeName(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className="text-xs text-zinc-500">RUC / RIF</label>
                <input className="f-input mt-1 w-full font-mono text-sm" value={tax_id} onChange={(e) => setTaxId(e.target.value)} required />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <label className="text-xs text-zinc-500">Nombre y apellidos del contacto principal</label>
                <input className="f-input mt-1 w-full" value={contact_full_name} onChange={(e) => setContactFullName(e.target.value)} required />
              </div>
              <div className="min-w-0">
                <label className="text-xs text-zinc-500">Teléfono</label>
                <input className="f-input mt-1 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <label className="text-xs text-zinc-500">Correo electrónico</label>
                <input className="f-input mt-1 w-full" type="email" value={contact_email} onChange={(e) => setContactEmail(e.target.value)} required />
              </div>
            </div>
            <button type="button" className="f-btn-primary text-sm" disabled={busy} onClick={() => void saveGeneral()}>
              {isNew ? "Crear cliente" : "Guardar cambios"}
            </button>
          </div>

          <div className="grid gap-4 w-full min-w-0 lg:grid-cols-2">
            <div className="f-panel w-full min-w-0">
              <h2 className="text-base font-semibold text-zinc-900">Documentos obligatorios del expediente</h2>
              <p className="text-xs text-zinc-500 mt-1 mb-3">
                Cargue aquí los archivos mínimos del expediente societario y legal.
              </p>
              {!co ? (
                <p className="text-sm text-zinc-500">Guarde primero los datos del cliente para habilitar la carga.</p>
              ) : (
                <div className="space-y-4">
                  {EXPEDIENTE_DOCS.map((spec) => (
                    <DocRow
                      key={`general-${spec.type}`}
                      label={spec.label}
                      docType={`general-${spec.type}`}
                      items={docsByType(spec.type)}
                      busy={busy}
                      onUpload={async (f) => {
                        await uploadDocType(spec.type, f);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="f-panel w-full min-w-0">
              <h2 className="text-base font-semibold text-zinc-900">Beneficiarios finales</h2>
              <p className="text-sm text-zinc-700 mt-1 leading-relaxed">
                Cada beneficiario final es una persona física con su propio KYC. Puede vincularse a más de un cliente.
              </p>
              {!co ? (
                <p className="text-sm text-zinc-500 mt-3">Guarde primero los datos del cliente para registrar beneficiarios.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  <input
                    className="f-input w-full"
                    placeholder="Nombre completo"
                    value={uboName}
                    onChange={(e) => setUboName(e.target.value)}
                  />
                  <input
                    className="f-input w-full font-mono text-sm"
                    placeholder="Cédula / ID (opcional)"
                    value={uboNationalId}
                    onChange={(e) => setUboNationalId(e.target.value)}
                  />
                  <FilePicker
                    accept="image/*,application/pdf"
                    value={uboFile}
                    onFileChange={setUboFile}
                    buttonLabel="Documento de identidad"
                    name="ubo-general"
                  />
                  <button
                    type="button"
                    className="f-btn-primary text-xs"
                    disabled={busy || !uboFile || !uboName.trim()}
                    onClick={() => void uploadUbo()}
                  >
                    Agregar
                  </button>

                  <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-50 text-zinc-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Nombre completo</th>
                          <th className="px-3 py-2 text-left font-medium">ID</th>
                          <th className="px-3 py-2 text-left font-medium">KYC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(co.beneficial_owners ?? []).map((b) => (
                          <tr key={b.id} className="border-t border-zinc-100">
                            <td className="px-3 py-2">{b.full_name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{b.national_id || "—"}</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={b.kyc_status} />
                            </td>
                          </tr>
                        ))}
                        {(co.beneficial_owners ?? []).length === 0 && (
                          <tr>
                            <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                              Aún no hay beneficiarios registrados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {co && !isNew && (
            <div className="f-panel w-full min-w-0">
              <h2 className="text-base font-semibold text-zinc-900">Línea de tiempo</h2>
              <p className="text-xs text-zinc-500 mt-1 mb-4">Actualizaciones y acciones registradas para este cliente.</p>
              <ul className="space-y-3">
                {[...timeline].reverse().map((ev) => (
                  <li key={ev.id} className="text-sm leading-relaxed">
                    <span className="font-medium text-blue-700 tabular-nums">{fmtDateShort(ev.created_at)}</span>
                    <span className="text-zinc-600"> {ev.message}</span>
                  </li>
                ))}
                {timeline.length === 0 && <li className="text-sm text-zinc-500">Sin eventos registrados.</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "docs" && !co && (
        <div className="f-panel mt-4 text-sm text-zinc-600 w-full min-w-0 max-w-xl">
          Guarde primero los <strong>datos generales</strong> para crear el cliente y poder adjuntar documentación.
        </div>
      )}

      {tab === "docs" && co && (
        <div className="f-panel mt-4 space-y-8 w-full min-w-0 max-w-none">
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-3 w-full min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-900">KYC — obligatorio</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-200 text-orange-950">Beneficiarios finales</span>
            </div>
            <p className="text-sm text-orange-950/90 leading-relaxed">
              Las <strong>personas físicas</strong> que Finecta debe investigar en listas y riesgo son los{" "}
              <strong>beneficiarios finales</strong> (UBO). Por cada uno indique el nombre completo y adjunte su
              identificación (cédula o pasaporte). Puede registrar varios.
            </p>
            <input
              className="f-input w-full max-w-md bg-white"
              placeholder="Nombre y apellidos del beneficiario final"
              value={uboName}
              onChange={(e) => setUboName(e.target.value)}
            />
            <input
              className="f-input w-full max-w-md bg-white font-mono text-sm"
              placeholder="Cédula / ID (opcional)"
              value={uboNationalId}
              onChange={(e) => setUboNationalId(e.target.value)}
            />
            <FilePicker accept="image/*,application/pdf" value={uboFile} onFileChange={setUboFile} buttonLabel="Identidad del beneficiario" name="ubo" />
            <button
              type="button"
              className="f-btn-primary text-xs"
              disabled={busy || !uboFile || !uboName.trim()}
              onClick={() => void uploadUbo()}
            >
              Registrar beneficiario final
            </button>
            <ul className="text-sm divide-y divide-orange-100 border border-orange-100 rounded-lg bg-white">
              {(co.beneficial_owners ?? []).map((b) => (
                <li key={b.id} className="px-3 py-2 flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-zinc-800">{b.full_name}</span>
                  <span className="text-zinc-500 text-xs">
                    <StatusBadge status={b.kyc_status} />
                  </span>
                </li>
              ))}
              {(co.beneficial_owners ?? []).length === 0 && (
                <li className="px-3 py-3 text-orange-900/70">Aún no hay beneficiarios finales registrados.</li>
              )}
            </ul>
          </div>

          <div className="border-t border-zinc-200 pt-6 space-y-4 w-full min-w-0">
            <h3 className="text-sm font-semibold text-zinc-800">Expediente societario y legal</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Documentación de la empresa y del representante; conviene tenerla completa para el expediente, aunque el
              núcleo del KYC ante listas son las personas UBO indicadas arriba.
            </p>
            {EXPEDIENTE_DOCS.map((spec) => (
              <DocRow
                key={spec.type}
                label={spec.label}
                docType={spec.type}
                items={docsByType(spec.type)}
                busy={busy}
                onUpload={async (f) => {
                  await uploadDocType(spec.type, f);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "kyc" && !co && (
        <div className="f-panel mt-4 text-sm text-zinc-600 w-full min-w-0 max-w-xl">
          Guarde primero los <strong>datos generales</strong> para crear el cliente y gestionar KYC.
        </div>
      )}

      {tab === "kyc" && co && (
        <div className="f-panel mt-4 space-y-4 w-full min-w-0 max-w-none">
          <div className="space-y-2">
            <label className="text-xs text-zinc-500">Beneficiario final (KYC por persona)</label>
            <select
              className="f-input max-w-md text-sm"
              value={kycBoId ?? ""}
              onChange={(e) => setKycBoId(e.target.value ? Number(e.target.value) : null)}
            >
              {(co.beneficial_owners ?? []).length === 0 && <option value="">— Sin beneficiarios —</option>}
              {(co.beneficial_owners ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.full_name}
                </option>
              ))}
            </select>
          </div>
          {selectedBo ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-zinc-600">Estado KYC del beneficiario:</span>
                <StatusBadge status={selectedBo.kyc_status} />
              </div>
              {selectedBo.kyc_notes && (
                <p className="text-sm text-amber-900 bg-amber-50 rounded-lg p-3 border border-amber-100">Nota: {selectedBo.kyc_notes}</p>
              )}
              <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/80 space-y-3 w-full min-w-0">
                <h3 className="text-sm font-semibold text-zinc-800">Consulta en listas (proveedor externo)</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  La solicitud se registra para el <strong>beneficiario seleccionado</strong>. Cuando exista integración,
                  el proveedor devolverá el resultado aquí.
                </p>
                <button type="button" className="f-btn-primary text-xs" disabled={busy || kycBoId == null} onClick={() => void requestScreening()}>
                  Solicitar consulta KYC en proveedor externo
                </button>
                {selectedBo.kyc_screening?.last_message && (
                  <p className="text-xs text-zinc-700 bg-white rounded-lg p-3 border border-zinc-200">{selectedBo.kyc_screening.last_message}</p>
                )}
                {selectedBo.kyc_screening?.last_request_reference && (
                  <p className="text-[11px] font-mono text-zinc-500">Ref. interna: {selectedBo.kyc_screening.last_request_reference}</p>
                )}
                {selectedBo.kyc_screening?.requests && selectedBo.kyc_screening.requests.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-orange-700 font-medium">Historial de solicitudes</summary>
                    <pre className="mt-2 p-3 bg-zinc-900 text-zinc-100 rounded-lg overflow-x-auto text-[11px]">
                      {JSON.stringify(selectedBo.kyc_screening.requests, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <div className="border-t border-zinc-200 pt-4 space-y-3 w-full min-w-0">
                <h3 className="text-sm font-semibold text-zinc-800">Revisión manual Finecta</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedBo.kyc_status !== "approved" && selectedBo.kyc_status !== "rejected" && (
                    <>
                      <button
                        type="button"
                        className="f-btn-primary text-xs bg-emerald-600 hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => void setKycStatus("approved")}
                      >
                        Aprobar KYC
                      </button>
                      <div className="w-full min-w-0 max-w-md flex flex-col gap-2 sm:flex-row sm:items-end">
                        <input
                          className="f-input flex-1 text-sm"
                          placeholder="Motivo si rechaza…"
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                        />
                        <button
                          type="button"
                          className="f-btn-ghost text-xs text-red-700 border border-red-200"
                          disabled={busy}
                          onClick={() => void setKycStatus("rejected")}
                        >
                          Rechazar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Registre al menos un beneficiario final en Documentación para gestionar KYC.</p>
          )}
        </div>
      )}

      {tab === "invoices" && co && (
        <div className="mt-4 space-y-4 w-full min-w-0">
          <div className="f-panel w-full min-w-0 space-y-3">
            <p className="text-sm text-zinc-600">
              Facturas de <strong>{co.legal_name}</strong>. Para el listado global con todos los filtros use el menú{" "}
              <Link className="text-orange-700 hover:underline font-medium" to={staff ? `/app/facturas?client_id=${co.id}` : "/app/facturas"}>
                Facturas
              </Link>
              .
            </p>
            {canUploadInvoice && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 space-y-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Cargar factura (PDF)</p>
                {staff && (
                  <div>
                    <label className="text-xs text-zinc-500">Pagador (opcional)</label>
                    <select
                      className="f-input mt-1 w-full text-sm"
                      value={uploadPayerId}
                      onChange={(e) => setUploadPayerId(e.target.value)}
                    >
                      <option value="">— Inferir del PDF —</option>
                      {payerCatalog.map((py) => (
                        <option key={py.id} value={String(py.id)}>
                          {py.legal_name} · {py.tax_id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <FilePicker
                  accept="application/pdf"
                  value={invFile}
                  onFileChange={setInvFile}
                  buttonLabel="Elegir PDF"
                  kindHint="Un solo archivo"
                  name="client_inv_pdf"
                />
                <button
                  type="button"
                  className="f-btn-primary text-xs"
                  disabled={busy || !invFile}
                  onClick={() => void uploadClientInvoice()}
                >
                  Subir y extraer datos
                </button>
              </div>
            )}
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-end">
              <input
                className="f-input min-w-0 flex-1 basis-[min(100%,18rem)]"
                placeholder="Buscar número, emisor, pagador…"
                value={invQ}
                onChange={(e) => setInvQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadClientInvoices()}
              />
              <select className="f-input w-full sm:w-44" value={invSt} onChange={(e) => setInvSt(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="draft">Borrador</option>
                <option value="uploaded">Cargada</option>
                <option value="in_quotation">En cotización</option>
                <option value="in_operation">En operación</option>
                <option value="in_collection">En cobro</option>
                <option value="paid">Pagada</option>
                <option value="closed">Cerrada</option>
                <option value="rejected">Rechazada</option>
              </select>
              <button type="button" className="f-btn-ghost text-xs" onClick={() => void loadClientInvoices()}>
                Filtrar
              </button>
            </div>
            <div className="f-data-shell -mx-1 sm:mx-0 rounded-lg overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm text-left">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200">
                    <th className="py-2 pr-2">Número</th>
                    <th className="py-2 pr-2">Emisor / Pagador</th>
                    <th className="py-2 pr-2">Monto</th>
                    <th className="py-2 pr-2">Vence</th>
                    <th className="py-2 pr-2">Estado</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {invRows.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-50/80">
                      <td className="py-2.5 pr-2 font-mono text-xs">{r.invoice_number}</td>
                      <td className="py-2.5 pr-2 text-zinc-700">
                        <div className="line-clamp-1">{r.issuer}</div>
                        <div className="text-xs text-zinc-500 line-clamp-1">{r.payer?.legal_name ?? "—"}</div>
                        {r.payer?.tax_id ? (
                          <div className="text-[10px] font-mono text-zinc-400">RNC: {r.payer.tax_id}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2 tabular-nums">{money(r.amount)}</td>
                      <td className="py-2.5 pr-2 text-xs text-zinc-500">{fmtDate(r.due_date)}</td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {r.pdf_path ? (
                          <button type="button" className="f-btn-ghost text-xs mr-1" onClick={() => void openInvoicePdf(r.id)}>
                            PDF
                          </button>
                        ) : null}
                        <button type="button" className="f-btn-ghost text-xs mr-1" onClick={() => setInvEdit(r)}>
                          Editar
                        </button>
                        <button type="button" className="f-btn-ghost text-xs text-red-700" onClick={() => void deleteClientInvoice(r.id)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invRows.length === 0 && <p className="text-sm text-zinc-500 py-4 px-1">Sin facturas para este cliente.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "quotations" && co && (
        <div className="mt-4 space-y-4 w-full min-w-0">
          <div className="f-panel w-full min-w-0 space-y-3">
            <p className="text-sm text-zinc-600">
              Cotizaciones de <strong>{co.legal_name}</strong>. Vista global en el menú{" "}
              <Link className="text-orange-700 hover:underline font-medium" to={staff ? `/app/cotizaciones?client_id=${co.id}` : "/app/cotizaciones"}>
                Cotizaciones
              </Link>
              .
            </p>
            {staff && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 space-y-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Nueva cotización</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-zinc-500">Factura</label>
                    <select className="f-input mt-1 w-full text-sm" value={qInvId} onChange={(e) => setQInvId(e.target.value)}>
                      <option value="">— Seleccione —</option>
                      {qInvOptions.map((inv) => (
                        <option key={inv.id} value={String(inv.id)}>
                          #{inv.id} · {inv.invoice_number} · {money(inv.amount)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Importe base</label>
                    <input className="f-input mt-1 w-full text-sm" value={qAmountBase} onChange={(e) => setQAmountBase(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Tasa comisión (0–1)</label>
                    <input className="f-input mt-1 w-full text-sm" value={qCommRate} onChange={(e) => setQCommRate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Coste operativo</label>
                    <input className="f-input mt-1 w-full text-sm" value={qOpCost} onChange={(e) => setQOpCost(e.target.value)} />
                  </div>
                </div>
                <button
                  type="button"
                  className="f-btn-primary text-xs"
                  disabled={busy || !qInvId}
                  onClick={() => void createClientQuotation()}
                >
                  Crear cotización
                </button>
              </div>
            )}
            <div className="f-data-shell -mx-1 sm:mx-0 rounded-lg overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 border-b">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Fact.</th>
                    <th className="py-2 pr-2">Base</th>
                    <th className="py-2 pr-2">Comisión</th>
                    <th className="py-2 pr-2">Coste op.</th>
                    <th className="py-2 pr-2">Estado</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {qRows.map((q) => (
                    <tr key={q.id}>
                      <td className="py-2.5 font-mono text-xs">#{q.id}</td>
                      <td className="py-2.5 font-mono text-xs text-zinc-600">{q.invoice_id ?? "—"}</td>
                      <td className="py-2.5 tabular-nums">{money(q.amount_base)}</td>
                      <td className="py-2.5 text-xs text-zinc-600">{money(q.commission)}</td>
                      <td className="py-2.5 text-xs text-zinc-600">{money(q.operational_cost)}</td>
                      <td className="py-2.5">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {staff && q.status === "pending" && (
                          <>
                            <button type="button" className="f-btn-ghost text-xs mr-1" onClick={() => setQEdit(q)}>
                              Editar
                            </button>
                            <button type="button" className="f-btn-ghost text-xs text-red-700" onClick={() => void cancelClientQuotation(q.id)}>
                              Anular
                            </button>
                          </>
                        )}
                        {user?.role === "client" && q.status === "pending" && (
                          <span className="inline-flex gap-1">
                            <button type="button" className="f-btn-ghost text-xs" onClick={() => void respondClientQuotation(q.id, true)}>
                              Aceptar
                            </button>
                            <button type="button" className="f-btn-ghost text-xs" onClick={() => void respondClientQuotation(q.id, false)}>
                              Rechazar
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {qRows.length === 0 && <p className="text-sm text-zinc-500 py-4">Sin cotizaciones para este cliente.</p>}
            </div>
          </div>
        </div>
      )}

      {invEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setInvEdit(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4 space-y-3 max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-zinc-900">Editar factura #{invEdit.id}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-500">Número</label>
                <input className="f-input mt-1 w-full text-sm" value={invEditForm.invoice_number} onChange={(e) => setInvEditForm((f) => ({ ...f, invoice_number: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-500">Emisor</label>
                <input className="f-input mt-1 w-full text-sm" value={invEditForm.issuer} onChange={(e) => setInvEditForm((f) => ({ ...f, issuer: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-zinc-500">Pagador (catálogo)</label>
                <select
                  className="f-input mt-1 w-full text-sm"
                  value={invEditForm.payer_id}
                  onChange={(e) => setInvEditForm((f) => ({ ...f, payer_id: e.target.value }))}
                >
                  {(() => {
                    const base = staff && payerCatalog.length > 0 ? payerCatalog : invoicePayerOpts;
                    const seen = new Set(base.map((p) => p.id));
                    const extra =
                      invEdit?.payer && !seen.has(invEdit.payer_id)
                        ? [
                            {
                              id: invEdit.payer.id,
                              legal_name: invEdit.payer.legal_name,
                              tax_id: invEdit.payer.tax_id,
                            },
                          ]
                        : [];
                    return [...base, ...extra];
                  })().map((py) => (
                    <option key={py.id} value={String(py.id)}>
                      {py.legal_name} · {py.tax_id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500">Monto</label>
                <input className="f-input mt-1 w-full text-sm tabular-nums" value={invEditForm.amount} onChange={(e) => setInvEditForm((f) => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Vence (AAAA-MM-DD)</label>
                <input className="f-input mt-1 w-full text-sm font-mono" value={invEditForm.due_date} onChange={(e) => setInvEditForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Estado</label>
                <select className="f-input mt-1 w-full text-sm" value={invEditForm.status} onChange={(e) => setInvEditForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="draft">Borrador</option>
                  <option value="uploaded">Cargada</option>
                  <option value="in_quotation">En cotización</option>
                  <option value="in_operation">En operación</option>
                  <option value="in_collection">En cobro</option>
                  <option value="paid">Pagada</option>
                  <option value="closed">Cerrada</option>
                  <option value="rejected">Rechazada</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" className="f-btn-ghost text-xs" onClick={() => setInvEdit(null)}>
                Cerrar
              </button>
              <button type="button" className="f-btn-primary text-xs" onClick={() => void saveInvoicePatch()}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {qEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => setQEdit(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-4 space-y-3"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-zinc-900">Editar cotización #{qEdit.id}</h2>
            <p className="text-xs text-zinc-500">Solo cotizaciones pendientes admiten cambio de importes.</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-zinc-500">Importe base</label>
                <input className="f-input mt-1 w-full text-sm" value={qEditForm.amount_base} onChange={(e) => setQEditForm((f) => ({ ...f, amount_base: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Comisión</label>
                <input className="f-input mt-1 w-full text-sm" value={qEditForm.commission} onChange={(e) => setQEditForm((f) => ({ ...f, commission: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Coste operativo</label>
                <input className="f-input mt-1 w-full text-sm" value={qEditForm.operational_cost} onChange={(e) => setQEditForm((f) => ({ ...f, operational_cost: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" className="f-btn-ghost text-xs" onClick={() => setQEdit(null)}>
                Cerrar
              </button>
              <button type="button" className="f-btn-primary text-xs" onClick={() => void saveQuotationPatch()}>
                Guardar importes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocRow({
  label,
  docType,
  items,
  busy,
  onUpload,
}: {
  label: string;
  docType: string;
  items: Doc[];
  busy: boolean;
  onUpload: (f: File) => Promise<void>;
}) {
  const [f, setF] = useState<File | null>(null);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-800">{label}</h3>
      <FilePicker accept="application/pdf,image/*" value={f} onFileChange={setF} buttonLabel="Elegir archivo" name={`doc-${docType}`} />
      <button
        type="button"
        className="f-btn-ghost text-xs"
        disabled={busy || !f}
        onClick={() => {
          if (!f) return;
          void (async () => {
            await onUpload(f);
            setF(null);
          })();
        }}
      >
        Subir
      </button>
      <ul className="text-xs text-zinc-600 space-y-1">
        {items.map((d) => (
          <li key={d.id} className="flex justify-between gap-2 border-b border-zinc-100 pb-1">
            <span className="truncate">{d.original_name}</span>
            <span className="text-zinc-400 shrink-0">{d.uploaded_at?.slice(0, 10)}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-zinc-400">Sin archivos</li>}
      </ul>
    </div>
  );
}
