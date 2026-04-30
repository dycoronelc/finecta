import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";

type Q = {
  id: number;
  amount_base: string;
  commission: string;
  operational_cost: string;
  status: string;
  client_comment: string | null;
};

export function QuotationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Q[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const d = await api<Q[]>("/quotations");
    setRows(d);
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

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
        <div className="f-data-shell -mx-1 sm:mx-0">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b">
              <th className="py-2 pr-2">#</th>
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
                <td className="py-2.5 tabular-nums">{money(q.amount_base)}</td>
                <td className="py-2.5 text-xs text-zinc-600">{money(q.commission)}</td>
                <td className="py-2.5 text-xs text-zinc-600">{money(q.operational_cost)}</td>
                <td className="py-2.5"><StatusBadge status={q.status} /></td>
                <td className="py-2.5 text-right">
                  {user?.role === "client" && q.status === "pending" && (
                    <div className="inline-flex gap-1">
                      <button type="button" className="f-btn-ghost text-xs" onClick={() => respond(q.id, true)}>Aceptar</button>
                      <button type="button" className="f-btn-ghost text-xs" onClick={() => respond(q.id, false)}>Rechazar</button>
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
