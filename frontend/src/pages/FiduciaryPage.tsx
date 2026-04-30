import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { money } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";

type Op = {
  id: number;
  code: string;
  status: string;
  total_invoiced: string;
  invoice_count: number;
};

export function FiduciaryPage() {
  const [rows, setRows] = useState<Op[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Op[]>("/fiduciary/operations")
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  async function val(id: number) {
    try {
      await api<{ custody_status: string }>(`/fiduciary/operations/${id}/validate`, { method: "POST" });
      setRows((r) => [...r]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold">Fiduciario</h1>
      <p className="text-sm text-zinc-600 max-w-4xl">Vista de operaciones en custodia (integraciones futuras).</p>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="f-panel w-full min-w-0">
        <div className="f-data-shell -mx-1 sm:mx-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b">
              <th className="py-2 pr-2">Código</th>
              <th className="py-2 pr-2">Monto</th>
              <th className="py-2 pr-2">Estado</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="py-2.5 font-mono text-xs font-semibold">{o.code}</td>
                <td className="py-2.5 tabular-nums">{money(o.total_invoiced)}</td>
                <td className="py-2.5"><StatusBadge status={o.status} /></td>
                <td className="py-2.5 text-right text-xs">
                  <button type="button" className="f-btn-ghost" onClick={() => val(o.id)}>Validar (demo)</button>
                  <Link to={`/app/operaciones/${o.id}`} className="ml-2 text-orange-600">Ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-zinc-500 py-4">Sin operaciones</p>}
        </div>
      </div>
    </div>
  );
}
