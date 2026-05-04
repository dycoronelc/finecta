import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilePicker } from "../components/ui/FilePicker";

type Company = {
  id: number;
  legal_name: string;
  kyc_status: string;
  kyc_notes: string | null;
};

type Doc = {
  id: number;
  original_name: string;
  document_type: string;
  party_name: string | null;
  uploaded_at: string;
};

function hasUboRegistered(docs: Doc[]): boolean {
  return docs.some((d) => d.document_type === "ubo_identidad" && (d.party_name || "").trim().length > 0);
}

export function OnboardingPage() {
  const { user, refreshMe } = useAuth();
  const [co, setCo] = useState<Company | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uboName, setUboName] = useState("");
  const [uboFile, setUboFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reloadDocs(companyId: number) {
    const d = await api<Doc[]>(`/companies/${companyId}/documents`);
    setDocs(d);
  }

  useEffect(() => {
    if (!user?.company_id) return;
    api<Company>("/companies/mine")
      .then((c) => {
        setCo(c);
        return reloadDocs(c.id);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [user?.company_id]);

  async function submitForReview() {
    if (!co) return;
    setErr(null);
    try {
      const updated = await api<Company>("/companies/mine/submit-for-review", { method: "POST" });
      setCo(updated);
      await refreshMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  async function uploadGeneral() {
    if (!co || !file) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("document_type", "rnc");
    try {
      await api(`/companies/${co.id}/documents`, { method: "POST", formData: fd });
      setFile(null);
      await reloadDocs(co.id);
      await refreshMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir");
    }
  }

  async function uploadUbo() {
    if (!co || !uboFile || !uboName.trim()) {
      setErr("Indique nombre completo del beneficiario final y el documento de identidad.");
      return;
    }
    setErr(null);
    const fd = new FormData();
    fd.append("file", uboFile);
    fd.append("document_type", "ubo_identidad");
    fd.append("party_name", uboName.trim());
    try {
      await api(`/companies/${co.id}/documents`, { method: "POST", formData: fd });
      setUboFile(null);
      setUboName("");
      await reloadDocs(co.id);
      await refreshMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir");
    }
  }

  if (!user?.company_id) {
    return (
      <p className="text-sm text-zinc-500 w-full min-w-0">
        Sin empresa vinculada. Inicie el registro desde <a className="text-orange-600" href="/registro">aquí</a>.
      </p>
    );
  }

  const uboOk = hasUboRegistered(docs);

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Onboarding</h1>
      <div className="grid grid-cols-1 min-[400px]:grid-cols-3 gap-2 w-full">
        {["Datos", "Documentos", "Estado KYC"].map((l, i) => (
          <button
            key={l}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-xl px-3 py-2 text-sm font-medium border ${
              step === i
                ? "bg-orange-50 border-orange-200 text-orange-900"
                : "bg-white border-zinc-200 text-zinc-600"
            }`}
          >
            {i + 1}. {l}
          </button>
        ))}
      </div>

      {co && step === 0 && (
        <div className="f-panel space-y-2 text-sm text-zinc-700">
          <p>
            <span className="text-zinc-500">Razón social</span> — {co.legal_name}
          </p>
          <p>
            <span className="text-zinc-500">Estado KYC</span> — <StatusBadge status={co.kyc_status} />
          </p>
        </div>
      )}

      {co && step === 1 && (
        <div className="f-panel space-y-6">
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-900">Beneficiarios finales (obligatorio para KYC)</p>
            <p className="text-sm text-orange-950/90 leading-relaxed">
              Son las <strong>personas físicas</strong> que debemos investigar. Por cada beneficiario final indique su
              nombre completo y adjunte cédula o pasaporte.
            </p>
            <input
              className="f-input w-full max-w-md bg-white"
              placeholder="Nombre y apellidos del beneficiario final"
              value={uboName}
              onChange={(e) => setUboName(e.target.value)}
            />
            <FilePicker
              accept="image/*,application/pdf"
              value={uboFile}
              onFileChange={setUboFile}
              buttonLabel="Identidad del beneficiario"
              name="ubo_onboarding"
            />
            <button
              type="button"
              onClick={() => void uploadUbo()}
              disabled={!uboFile || !uboName.trim()}
              className="f-btn-primary text-xs w-full sm:w-auto"
            >
              Registrar beneficiario final
            </button>
            <ul className="text-sm divide-y divide-orange-100 border border-orange-100 rounded-lg bg-white">
              {docs
                .filter((d) => d.document_type === "ubo_identidad")
                .map((d) => (
                  <li key={d.id} className="px-3 py-2 flex justify-between gap-2">
                    <span className="font-medium text-zinc-800">{d.party_name || "—"}</span>
                    <span className="text-zinc-400 text-xs truncate">{d.original_name}</span>
                  </li>
                ))}
              {!docs.some((d) => d.document_type === "ubo_identidad") && (
                <li className="px-3 py-3 text-orange-900/70">Sin beneficiarios finales aún.</li>
              )}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800">Otros documentos del expediente</p>
            <p className="text-xs text-zinc-500">
              RNC, estados u otros soportes (opcionales aquí; el envío a revisión KYC exige al menos un UBO arriba).
            </p>
            <FilePicker
              value={file}
              onFileChange={setFile}
              buttonLabel="Elegir documento"
              kindHint="PDF, imagen, etc."
              name="documento_kyc"
            />
            <button type="button" onClick={() => void uploadGeneral()} disabled={!file} className="f-btn-ghost text-xs border border-zinc-200">
              Subir como documento general
            </button>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
          <ul className="divide-y divide-zinc-100 text-sm border border-zinc-100 rounded-lg">
            {docs.map((d) => (
              <li key={d.id} className="py-2 px-3 flex justify-between gap-2">
                <span className="truncate">
                  {d.document_type === "ubo_identidad" && d.party_name ? (
                    <span className="text-zinc-800">{d.party_name}</span>
                  ) : (
                    <span className="truncate">{d.original_name}</span>
                  )}
                </span>
                <span className="text-zinc-400 text-xs shrink-0">{d.document_type}</span>
              </li>
            ))}
            {docs.length === 0 && <li className="py-3 px-3 text-zinc-500">Sin documentos aún</li>}
          </ul>
        </div>
      )}

      {co && step === 2 && (
        <div className="f-panel text-sm text-zinc-700 space-y-3">
          <p>El equipo de Finecta revisará su expediente. El requisito principal del KYC es tener registrados los beneficiarios finales a investigar.</p>
          {co.kyc_status === "draft" && uboOk && (
            <button type="button" className="f-btn-primary text-xs" onClick={() => void submitForReview()}>
              Enviar expediente a revisión
            </button>
          )}
          {co.kyc_status === "draft" && !uboOk && (
            <p className="text-zinc-500 text-xs">
              En el paso <strong>Documentos</strong> registre al menos un beneficiario final con nombre completo e identificación antes de enviar a revisión KYC.
            </p>
          )}
          {co.kyc_notes && <p className="text-amber-800 bg-amber-50 rounded-lg p-3">Nota: {co.kyc_notes}</p>}
        </div>
      )}
    </div>
  );
}
