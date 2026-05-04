import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";

type Op = {
  id: number;
  code: string;
  company_id: number;
  status: string;
  total_invoiced: string;
  total_disbursed: string | null;
  created_at: string;
  invoice_count: number;
};

type Co = { id: number; legal_name: string };

export function OperationsPage() {
  const { user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "analyst";
  const [rows, setRows] = useState<Op[]>([]);
  const [companies, setCompanies] = useState<Co[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!staff) return;
    api<Co[]>("/companies")
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, [staff]);

  useEffect(() => {
    const q = companyId ? `?company_id=${encodeURIComponent(companyId)}` : "";
    api<Op[]>(`/operations${q}`)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [companyId]);

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Operaciones</h1>
      {staff && (
        <div className="flex flex-wrap items-end gap-2 max-w-md">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-500 mb-1">Empresa</p>
            <select
              className="f-input w-full text-sm"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Todas</option>
              {companies.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.legal_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="f-panel w-full min-w-0">
        <div className="f-data-shell -mx-1 sm:mx-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200">
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Total facturado</th>
              <th className="py-2 pr-3">Desembolsos</th>
              <th className="py-2 pr-3">Fact.</th>
              <th className="py-2 pr-3">Creada</th>
              <th className="py-2">Estado</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50/80">
                <td className="py-2.5 pr-3 font-mono text-xs font-semibold">{r.code}</td>
                <td className="py-2.5 pr-3 tabular-nums">{money(r.total_invoiced)}</td>
                <td className="py-2.5 pr-3 text-xs text-zinc-600">{r.total_disbursed ? money(r.total_disbursed) : "—"}</td>
                <td className="py-2.5 pr-3 tabular-nums">{r.invoice_count}</td>
                <td className="py-2.5 pr-3 text-xs text-zinc-500">{r.created_at?.slice(0, 10)}</td>
                <td className="py-2.5 pr-2"><StatusBadge status={r.status} /></td>
                <td className="py-2.5 text-right">
                  <Link to={`/app/operaciones/${r.id}`} className="text-orange-600 text-xs font-medium hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-zinc-500 py-6">Sin operaciones aún</p>}
        </div>
      </div>
    </div>
  );
}
