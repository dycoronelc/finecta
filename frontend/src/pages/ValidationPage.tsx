import { useEffect, useState } from "react";
import { api } from "../api/client";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilePicker } from "../components/ui/FilePicker";

type Batch = {
  id: number;
  original_name: string;
  status: string;
  results: {
    items?: { kind: string; message: string }[];
    error?: string;
  } | null;
  created_at: string;
};

export function ValidationPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const b = await api<Batch[]>("/payer-validation/batches");
    setBatches(b);
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  async function upload() {
    if (!file) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api<Batch>("/payer-validation/upload", { method: "POST", formData: fd });
      setFile(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Validación de pagador</h1>
      <p className="text-sm text-zinc-600 w-full max-w-4xl">
        Cargue un Excel exportado del pagador con columnas de factura y monto. Se comparará con las
        facturas registradas y se marcarán discrepancias.
      </p>
      <div className="f-panel flex flex-col gap-3 w-full min-w-0">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Archivo del pagador
        </p>
        <FilePicker
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          value={file}
          onFileChange={setFile}
          buttonLabel="Elegir hoja de cálculo"
          kindHint="XLSX"
          name="excel_pagador"
        />
        <button type="button" className="f-btn-primary text-xs w-full sm:w-auto" onClick={upload} disabled={!file}>
          Procesar conciliación
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="f-panel">
        <h2 className="text-sm font-semibold mb-3">Historial</h2>
        <ul className="space-y-3">
          {batches.map((b) => (
            <li key={b.id} className="border border-zinc-200 rounded-xl p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-zinc-800 truncate">{b.original_name}</p>
                <StatusBadge status={b.status} />
              </div>
              {b.results?.error && <p className="text-red-600 text-xs mt-2">{b.results.error}</p>}
              {b.results?.items && b.results.items.length > 0 && (
                <ul className="mt-2 text-xs text-zinc-600 space-y-1">
                  {b.results.items.map((i, j) => (
                    <li key={j}><span className="text-zinc-500">{i.kind}:</span> {i.message}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {batches.length === 0 && <p className="text-sm text-zinc-500">Aún no hay lotes de validación</p>}
      </div>
    </div>
  );
}
