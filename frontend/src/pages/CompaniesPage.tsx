import { useEffect, useState } from "react";
import { api } from "../api/client";
import { StatusBadge } from "../components/ui/StatusBadge";

type C = {
  id: number;
  legal_name: string;
  tax_id: string;
  kyc_status: string;
  contact_email: string;
  created_at: string;
};

export function CompaniesPage() {
  const [rows, setRows] = useState<C[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [kyc, setKyc] = useState<"" | "submitted" | "in_review" | "approved" | "rejected">("");

  async function load() {
    const p = kyc ? `?kyc=${kyc}` : "";
    setRows(await api<C[]>(`/companies${p}`));
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [kyc]);

  async function setStatus(id: number, s: C["kyc_status"]) {
    setErr(null);
    try {
      await api<C>(`/companies/${id}/kyc`, { method: "PATCH", json: { kyc_status: s } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold">Empresas (KYC)</h1>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap items-center gap-2 w-full min-w-0">
        <select
          className="f-input w-full min-[420px]:w-48 min-w-0"
          value={kyc}
          onChange={(e) => setKyc(e.target.value as never)}
        >
          <option value="">Todos</option>
          <option value="submitted">Enviada</option>
          <option value="in_review">En revisión</option>
          <option value="approved">Aprobada</option>
          <option value="rejected">Rechazada</option>
        </select>
        <button type="button" className="f-btn-ghost text-xs" onClick={() => load()}>
          Actualizar
        </button>
      </div>
      <div className="f-panel w-full min-w-0">
        <div className="f-data-shell -mx-1 sm:mx-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b">
              <th className="py-2 pr-2">Empresa</th>
              <th className="py-2 pr-2">RNC</th>
              <th className="py-2 pr-2">KYC</th>
              <th className="py-2">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="py-2.5 pr-2"><div className="font-medium">{c.legal_name}</div><div className="text-xs text-zinc-500">{c.contact_email}</div></td>
                <td className="py-2.5 pr-2 font-mono text-xs">{c.tax_id}</td>
                <td className="py-2.5 pr-2"><StatusBadge status={c.kyc_status} /></td>
                <td className="py-2.5 text-xs">
                  {c.kyc_status !== "approved" && (
                    <button type="button" className="text-emerald-700 font-medium" onClick={() => setStatus(c.id, "approved")}>Aprobar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-zinc-500 py-4">No hay resultados</p>}
        </div>
      </div>
    </div>
  );
}
