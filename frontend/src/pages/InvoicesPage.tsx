import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { money, fmtDate } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";
import { FilePicker } from "../components/ui/FilePicker";

type InvPayer = { id: number; legal_name: string; tax_id: string };

type Inv = {
  id: number;
  invoice_number: string;
  issuer: string;
  payer_id: number;
  payer: InvPayer;
  amount: string;
  due_date: string | null;
  status: string;
  created_at: string;
};

type Co = { id: number; legal_name: string };

type PayerOpt = { id: number; legal_name: string; tax_id: string };

export function InvoicesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const staff = user?.role === "admin" || user?.role === "analyst";
  const [rows, setRows] = useState<Inv[]>([]);
  const [clients, setClients] = useState<Co[]>([]);
  const [allPayers, setAllPayers] = useState<PayerOpt[]>([]);
  const [clientId, setClientId] = useState("");
  const [payerOpts, setPayerOpts] = useState<PayerOpt[]>([]);
  const [payerPick, setPayerPick] = useState("");
  const [uploadPayerId, setUploadPayerId] = useState("");
  const [q, setQ] = useState("");
  const [st, setSt] = useState<string | "">("");
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const canUpload = user?.role === "client" || user?.role === "admin" || user?.role === "analyst";

  useEffect(() => {
    if (!staff) return;
    api<Co[]>("/clients")
      .then(setClients)
      .catch(() => setClients([]));
  }, [staff]);

  useEffect(() => {
    if (!staff) return;
    api<PayerOpt[]>("/payers")
      .then(setAllPayers)
      .catch(() => setAllPayers([]));
  }, [staff]);

  useEffect(() => {
    const fromUrl = searchParams.get("client_id");
    if (!staff || !fromUrl) return;
    if (/^\d+$/.test(fromUrl)) setClientId(fromUrl);
  }, [staff, searchParams]);

  useEffect(() => {
    const run = async () => {
      if (staff && !clientId) {
        setPayerOpts(allPayers);
        return;
      }
      try {
        const path =
          staff && clientId
            ? `/invoices/payer-options?client_id=${encodeURIComponent(clientId)}`
            : "/invoices/payer-options";
        const opts = await api<PayerOpt[]>(path);
        setPayerOpts(opts);
      } catch {
        setPayerOpts([]);
      }
    };
    void run();
  }, [staff, clientId, user?.client_id, allPayers]);

  async function load() {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (st) p.set("status", st);
    if (staff && clientId) p.set("client_id", clientId);
    if (payerPick) p.set("payer_id", payerPick);
    setErr(null);
    const data = await api<Inv[]>(`/invoices?${p.toString()}`);
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, clientId, staff, user?.client_id, payerPick]);

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setErr(null);
    try {
      const p = new URLSearchParams();
      if (staff && clientId) p.set("client_id", clientId);
      if (staff && uploadPayerId) p.set("payer_id", uploadPayerId);
      const qs = p.toString();
      await api<Inv>(`/invoices${qs ? `?${qs}` : ""}`, { method: "POST", formData: fd });
      setFile(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al subir");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Facturas</h1>
      <p className="text-sm text-zinc-600 max-w-3xl mt-1">
        Cada factura tiene un pagador del catálogo; un mismo cliente puede tener cartera con varios pagadores.
        Use el filtro por empresa (Finecta) y por pagador para revisar bloques de riesgo.
      </p>
      {canUpload && (
        <div className="f-panel flex flex-col gap-3 w-full min-w-0">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Cargar factura (PDF)
          </p>
          {staff && (
            <div className="w-full max-w-md">
              <p className="text-xs text-zinc-500 mb-1">Empresa destino (staff)</p>
              <select
                className="f-input w-full text-sm"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Empresa del usuario (subir como cliente no aplica)</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.legal_name} (#{c.id})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">
                Si no elige empresa, la factura se asocia a la suya solo en rol cliente; en staff debe elegir empresa.
              </p>
            </div>
          )}
          {staff && clientId && (
            <div className="w-full max-w-md">
              <p className="text-xs text-zinc-500 mb-1">Pagador (opcional; si no elige, se infiere del PDF)</p>
              <select
                className="f-input w-full text-sm"
                value={uploadPayerId}
                onChange={(e) => setUploadPayerId(e.target.value)}
              >
                <option value="">— Inferir del PDF / catálogo —</option>
                {allPayers.map((py) => (
                  <option key={py.id} value={String(py.id)}>
                    {py.legal_name} · {py.tax_id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <FilePicker
            accept="application/pdf"
            value={file}
            onFileChange={setFile}
            buttonLabel="Elegir PDF"
            kindHint="Un solo archivo"
            name="factura_pdf"
          />
          <button
            type="button"
            className="f-btn-primary text-xs w-full sm:w-auto"
            onClick={() => void upload()}
            disabled={!file || (staff && !clientId)}
          >
            Subir y extraer datos
          </button>
        </div>
      )}
      <div className="f-panel space-y-3 w-full min-w-0">
        <div className="flex flex-col gap-2 w-full min-w-0">
          {staff && (
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <p className="text-xs text-zinc-500 mb-1">Empresa</p>
                <select
                  className="f-input w-full text-sm"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setPayerPick("");
                  }}
                >
                  <option value="">Todas las empresas</option>
                  {clients.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.legal_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <p className="text-xs text-zinc-500 mb-1">Pagador</p>
                <select
                  className="f-input w-full text-sm"
                  value={payerPick}
                  onChange={(e) => setPayerPick(e.target.value)}
                >
                  <option value="">Todos los pagadores</option>
                  {payerOpts.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      {o.legal_name}
                      {o.tax_id ? ` · RNC ${o.tax_id}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {!staff && (
            <div className="min-w-0 max-w-md">
              <p className="text-xs text-zinc-500 mb-1">Filtrar por pagador</p>
              <select
                className="f-input w-full text-sm"
                value={payerPick}
                onChange={(e) => setPayerPick(e.target.value)}
              >
                <option value="">Todos los pagadores</option>
                {payerOpts.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.legal_name}
                    {o.tax_id ? ` · RNC ${o.tax_id}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0">
            <input
              className="f-input min-w-0 flex-1 basis-[min(100%,20rem)]"
              placeholder="Buscar número, emisor, pagador, RNC…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
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
            <button type="button" className="f-btn-ghost text-xs" onClick={() => void load()}>
              Filtrar
            </button>
          </div>
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
                    <div className="text-xs text-zinc-500 line-clamp-1">{r.payer?.legal_name ?? "—"}</div>
                    {r.payer?.tax_id && (
                      <div className="text-[10px] font-mono text-zinc-400">RNC pagador: {r.payer.tax_id}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">{money(r.amount)}</td>
                  <td className="py-2.5 pr-3 text-xs text-zinc-500">{fmtDate(r.due_date)}</td>
                  <td className="py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
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
