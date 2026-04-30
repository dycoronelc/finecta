import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { money, fmtDate } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilePicker } from "../components/ui/FilePicker";

type Inv = {
  id: number;
  invoice_number: string;
  issuer: string;
  payer: string;
  amount: string;
  due_date: string | null;
  status: string;
  created_at: string;
};

export function InvoicesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Inv[]>([]);
  const [q, setQ] = useState("");
  const [st, setSt] = useState<string | "">("");
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const canUpload = user?.role === "client" || user?.role === "admin" || user?.role === "analyst";

  async function load() {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (st) p.set("status", st);
    setErr(null);
    const data = await api<Inv[]>(`/invoices?${p.toString()}`);
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setErr(null);
    try {
      await api<Inv>("/invoices", { method: "POST", formData: fd });
      setFile(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Facturas</h1>
      {canUpload && (
        <div className="f-panel flex flex-col gap-3 w-full min-w-0">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Cargar factura (PDF)
          </p>
          <FilePicker
            accept="application/pdf"
            value={file}
            onFileChange={setFile}
            buttonLabel="Elegir PDF"
            kindHint="Un solo archivo"
            name="factura_pdf"
          />
          <button type="button" className="f-btn-primary text-xs w-full sm:w-auto" onClick={upload} disabled={!file}>
            Subir y extraer datos
          </button>
        </div>
      )}
      <div className="f-panel space-y-3 w-full min-w-0">
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0">
          <input
            className="f-input min-w-0 flex-1 basis-[min(100%,20rem)]"
            placeholder="Buscar número, emisor, pagador…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <select
            className="f-input w-full min-[400px]:w-44 min-w-0"
            value={st}
            onChange={(e) => setSt(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="uploaded">Cargada</option>
            <option value="in_quotation">En cotización</option>
            <option value="in_operation">En operación</option>
            <option value="in_collection">En cobro</option>
            <option value="closed">Cerrada</option>
          </select>
          <button type="button" className="f-btn-ghost text-xs" onClick={() => load()}>
            Filtrar
          </button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="f-data-shell -mx-1 sm:mx-0 rounded-lg">
          <table className="w-full min-w-[640px] text-sm text-left">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200">
                <th className="py-2 pr-3">Número</th>
                <th className="py-2 pr-3">Emisor / Pagador</th>
                <th className="py-2 pr-3">Monto</th>
                <th className="py-2 pr-3">Vence</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-50/80">
                  <td className="py-2.5 pr-3 font-mono text-xs">{r.invoice_number}</td>
                  <td className="py-2.5 pr-3 text-zinc-700">
                    <div className="line-clamp-1">{r.issuer}</div>
                    <div className="text-xs text-zinc-500 line-clamp-1">{r.payer}</div>
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{money(r.amount)}</td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-500">{fmtDate(r.due_date)}</td>
                  <td className="py-2.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-zinc-500 py-6">Sin resultados</p>}
        </div>
      </div>
    </div>
  );
}
