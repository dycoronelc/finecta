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
  uploaded_at: string;
};

export function OnboardingPage() {
  const { user, refreshMe } = useAuth();
  const [co, setCo] = useState<Company | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;
    api<Company>("/companies/mine")
      .then((c) => {
        setCo(c);
        return api<Doc[]>(`/companies/${c.id}/documents`);
      })
      .then(setDocs)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [user?.company_id]);

  async function upload() {
    if (!co || !file) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    const q = new URLSearchParams({ document_type: "rnc" });
    try {
      await api(`/companies/${co.id}/documents?${q.toString()}`, { method: "POST", formData: fd });
      setFile(null);
      const d = await api<Doc[]>(`/companies/${co.id}/documents`);
      setDocs(d);
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
          <p><span className="text-zinc-500">Razón social</span> — {co.legal_name}</p>
          <p>
            <span className="text-zinc-500">Estado KYC</span> — <StatusBadge status={co.kyc_status} />
          </p>
        </div>
      )}

      {co && step === 1 && (
        <div className="f-panel space-y-3">
          <p className="text-sm text-zinc-600">
            Suba documento RNC, estados bancarios u otros soportes (PDF, imágenes u Office).
          </p>
          <FilePicker
            value={file}
            onFileChange={setFile}
            buttonLabel="Elegir documento"
            kindHint="PDF, imagen, etc."
            name="documento_kyc"
          />
          <button type="button" onClick={upload} disabled={!file} className="f-btn-primary text-xs w-full sm:w-auto">
            Enviar documento
          </button>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <ul className="divide-y divide-zinc-100 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="py-2 flex justify-between gap-2">
                <span className="truncate">{d.original_name}</span>
                <span className="text-zinc-400 text-xs shrink-0">{d.document_type}</span>
              </li>
            ))}
            {docs.length === 0 && <li className="py-3 text-zinc-500">Sin documentos aún</li>}
          </ul>
        </div>
      )}

      {co && step === 2 && (
        <div className="f-panel text-sm text-zinc-700 space-y-2">
          <p>El equipo de Finecta validará su expediente. Recibirá notificación al aprobarse KYC.</p>
          {co.kyc_notes && <p className="text-amber-800 bg-amber-50 rounded-lg p-3">Nota: {co.kyc_notes}</p>}
        </div>
      )}
    </div>
  );
}
