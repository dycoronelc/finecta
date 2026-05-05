import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";

type Q = {
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

export function QuotationsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const staff = user?.role === "admin" || user?.role === "analyst";
  const [staffClientId, setStaffClientId] = useState("");
  const [rows, setRows] = useState<Q[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("client_id");
    if (!staff || !fromUrl) return;
    if (/^\d+$/.test(fromUrl)) setStaffClientId(fromUrl);
  }, [staff, searchParams]);

  async function load() {
    const p = new URLSearchParams();
    if (staff && staffClientId) p.set("client_id", staffClientId);
    const qs = p.toString();
    const d = await api<Q[]>(`/quotations${qs ? `?${qs}` : ""}`);
    setRows(d);
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffClientId, staff, user?.client_id]);

  async function respond(id: number, accept: boolean) {
    setErr(null);
    try {
      await api<Q>(`/quotations/${id}/respond`, { method: "POST", json: { accept, comment: "" } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Cotizaciones</h1>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="f-panel w-full min-w-0">
        {staff && (
          <div className="mb-3 max-w-xs">
            <p className="text-xs text-zinc-500 mb-1">Filtrar por cliente (opcional)</p>
            <input
              className="f-input w-full text-sm"
              placeholder="ID de cliente"
              value={staffClientId}
              onChange={(e) => setStaffClientId(e.target.value.replace(/\D/g, ""))}
            />
            <button type="button" className="f-btn-ghost text-xs mt-2" onClick={() => void load()}>
              Aplicar filtro
            </button>
          </div>
        )}
        <div className="f-data-shell -mx-1 sm:mx-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b">
              <th className="py-2 pr-2">#</th>
              {!staffClientId && staff && <th className="py-2 pr-2">Cliente</th>}
              <th className="py-2 pr-2">Fact.</th>
              <th className="py-2 pr-2">Base</th>
              <th className="py-2 pr-2">Comisión</th>
              <th className="py-2 pr-2">Coste op.</th>
              <th className="py-2 pr-2">Estado</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((q) => (
              <tr key={q.id}>
                <td className="py-2.5 font-mono text-xs">#{q.id}</td>
                {!staffClientId && staff && (
                  <td className="py-2.5 font-mono text-xs text-zinc-600">#{q.client_id}</td>
                )}
                <td className="py-2.5 font-mono text-xs text-zinc-600">{q.invoice_id ?? "—"}</td>
                <td className="py-2.5 tabular-nums">{money(q.amount_base)}</td>
                <td className="py-2.5 text-xs text-zinc-600">{money(q.commission)}</td>
                <td className="py-2.5 text-xs text-zinc-600">{money(q.operational_cost)}</td>
                <td className="py-2.5"><StatusBadge status={q.status} /></td>
                <td className="py-2.5 text-right">
                  {user?.role === "client" && q.status === "pending" && (
                    <div className="inline-flex gap-1">
                      <button type="button" className="f-btn-ghost text-xs" onClick={() => void respond(q.id, true)}>Aceptar</button>
                      <button type="button" className="f-btn-ghost text-xs" onClick={() => void respond(q.id, false)}>Rechazar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-zinc-500 py-4">Sin cotizaciones</p>}
        </div>
      </div>
    </div>
  );
}
