import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { FilePicker } from "../components/ui/FilePicker";
import { StatusBadge } from "../components/ui/StatusBadge";
import { fmtDateShort } from "../lib/format";

type Company = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  contact_email: string;
  phone: string | null;
  contact_full_name: string;
  kyc_status: string;
  kyc_notes: string | null;
  kyc_screening: {
    requests?: Array<Record<string, unknown>>;
    last_status?: string;
    last_message?: string;
    last_request_reference?: string;
  } | null;
  approved_at: string | null;
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

/** Expediente societario / legal — recomendado; el KYC en listas se centra en los UBO. */
const EXPEDIENTE_DOCS: { type: string; label: string }[] = [
  { type: "registro_mercantil", label: "Certificado de Registro Mercantil" },
  { type: "rnc_documento", label: "RNC" },
  { type: "acta_asamblea", label: "Acta de asamblea (representante legal y atribuciones)" },
  { type: "cedula_representante", label: "Cédula o pasaporte del representante legal del acta" },
];

type TabId = "general" | "docs" | "kyc";

export function ClientDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = id === "nuevo";
  const [tab, setTab] = useState<TabId>("general");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [co, setCo] = useState<Company | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [timeline, setTimeline] = useState<TimelineEv[]>([]);

  const [legal_name, setLegalName] = useState("");
  const [trade_name, setTradeName] = useState("");
  const [tax_id, setTaxId] = useState("");
  const [contact_email, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contact_full_name, setContactFullName] = useState("");

  const [uboName, setUboName] = useState("");
  const [uboFile, setUboFile] = useState<File | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  const loadDocs = useCallback(async (companyId: number) => {
    const d = await api<Doc[]>(`/companies/${companyId}/documents`);
    setDocs(d);
  }, []);

  const loadTimeline = useCallback(async (companyId: number) => {
    try {
      const t = await api<TimelineEv[]>(`/companies/${companyId}/timeline`);
      setTimeline(t);
    } catch {
      setTimeline([]);
    }
  }, []);

  const applyCompany = useCallback((c: Company) => {
    setCo(c);
    setLegalName(c.legal_name);
    setTradeName(c.trade_name ?? "");
    setTaxId(c.tax_id);
    setContactEmail(c.contact_email);
    setPhone(c.phone ?? "");
    setContactFullName(c.contact_full_name ?? "");
  }, []);

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
      return;
    }
    const cid = Number(id);
    if (Number.isNaN(cid)) {
      setErr("Identificador inválido");
      return;
    }
    setErr(null);
    Promise.all([
      api<Company>(`/companies/${cid}`),
      api<Doc[]>(`/companies/${cid}/documents`),
      api<TimelineEv[]>(`/companies/${cid}/timeline`),
    ])
      .then(([c, d, t]) => {
        applyCompany(c);
        setDocs(d);
        setTimeline(t);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [id, isNew, applyCompany]);

  async function saveGeneral() {
    setErr(null);
    setBusy(true);
    try {
      if (isNew) {
        const c = await api<Company>("/companies", {
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
      if (!co) return;
      const c = await api<Company>(`/companies/${co.id}`, {
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
      applyCompany(c);
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
      await api(`/companies/${co.id}/documents`, { method: "POST", formData: fd });
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
      const fd = new FormData();
      fd.append("file", uboFile);
      fd.append("document_type", "ubo_identidad");
      fd.append("party_name", uboName.trim());
      await api(`/companies/${co.id}/documents`, { method: "POST", formData: fd });
      setUboFile(null);
      setUboName("");
      await loadDocs(co.id);
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function requestScreening() {
    if (!co) return;
    setBusy(true);
    setErr(null);
    try {
      const c = await api<Company>(`/companies/${co.id}/kyc-screening/request`, { method: "POST" });
      applyCompany(c);
      await loadTimeline(co.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function setKycStatus(s: Company["kyc_status"]) {
    if (!co) return;
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
      const c = await api<Company>(`/companies/${co.id}/kyc`, { method: "PATCH", json: body });
      applyCompany(c);
      setRejectNotes("");
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
  const uboDocs = docs.filter((d) => d.document_type === "ubo_identidad");

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
                Debe solicitarse por <strong>cada beneficiario final</strong>:
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
                          <th className="px-3 py-2 text-left font-medium">Documento de identidad</th>
                          <th className="px-3 py-2 text-left font-medium">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uboDocs.map((d) => (
                          <tr key={d.id} className="border-t border-zinc-100">
                            <td className="px-3 py-2">{d.party_name || "—"}</td>
                            <td className="px-3 py-2">{d.original_name}</td>
                            <td className="px-3 py-2 text-zinc-500">{d.uploaded_at?.slice(0, 10)}</td>
                          </tr>
                        ))}
                        {uboDocs.length === 0 && (
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
              {uboDocs.map((d) => (
                <li key={d.id} className="px-3 py-2 flex justify-between gap-2">
                  <span className="font-medium text-zinc-800">{d.party_name || "—"}</span>
                  <span className="text-zinc-500 text-xs truncate">{d.original_name}</span>
                </li>
              ))}
              {uboDocs.length === 0 && (
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
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-600">Estado actual:</span>
            <StatusBadge status={co.kyc_status} />
          </div>
          {co.kyc_notes && (
            <p className="text-sm text-amber-900 bg-amber-50 rounded-lg p-3 border border-amber-100">Nota: {co.kyc_notes}</p>
          )}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/80 space-y-3 w-full min-w-0">
            <h3 className="text-sm font-semibold text-zinc-800">Consulta en listas (proveedor externo)</h3>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Las búsquedas se harán sobre los <strong>beneficiarios finales</strong> registrados en la pestaña
              Documentación. Use el botón para registrar una solicitud; cuando exista integración, el proveedor
              devolverá el resultado aquí.
            </p>
            <button type="button" className="f-btn-primary text-xs" disabled={busy} onClick={() => void requestScreening()}>
              Solicitar consulta KYC en proveedor externo
            </button>
            {co.kyc_screening?.last_message && (
              <p className="text-xs text-zinc-700 bg-white rounded-lg p-3 border border-zinc-200">{co.kyc_screening.last_message}</p>
            )}
            {co.kyc_screening?.last_request_reference && (
              <p className="text-[11px] font-mono text-zinc-500">Ref. interna: {co.kyc_screening.last_request_reference}</p>
            )}
            {co.kyc_screening?.requests && co.kyc_screening.requests.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-orange-700 font-medium">Historial de solicitudes</summary>
                <pre className="mt-2 p-3 bg-zinc-900 text-zinc-100 rounded-lg overflow-x-auto text-[11px]">
                  {JSON.stringify(co.kyc_screening.requests, null, 2)}
                </pre>
              </details>
            )}
          </div>
          <div className="border-t border-zinc-200 pt-4 space-y-3 w-full min-w-0">
            <h3 className="text-sm font-semibold text-zinc-800">Revisión manual Finecta</h3>
            <div className="flex flex-wrap gap-2">
              {co.kyc_status !== "approved" && co.kyc_status !== "rejected" && (
                <>
                  <button type="button" className="f-btn-primary text-xs bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => void setKycStatus("approved")}>
                    Aprobar KYC
                  </button>
                  <div className="w-full min-w-0 max-w-md flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input
                      className="f-input flex-1 text-sm"
                      placeholder="Motivo si rechaza…"
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                    />
                    <button type="button" className="f-btn-ghost text-xs text-red-700 border border-red-200" disabled={busy} onClick={() => void setKycStatus("rejected")}>
                      Rechazar
                    </button>
                  </div>
                </>
              )}
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
