import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/ui/StatusBadge";

type C = {
  id: number;
  title: string;
  contract_type: string;
  signature_status: string;
  created_at: string;
};

export function ContractsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<C[]>([]);
  const [cid, setCid] = useState("1");
  const [ct, setCt] = useState<"marco" | "cession" | "confirmation">("marco");
  const [err, setErr] = useState<string | null>(null);
  const staff = user?.role === "admin" || user?.role === "analyst";

  useEffect(() => {
    if (user?.company_id) setCid(String(user.company_id));
    api<C[]>("/contracts")
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [user?.company_id]);

  async function gen() {
    setErr(null);
    try {
      const q = new URLSearchParams({ company_id: cid, contract_type: ct });
      await api<C>(`/contracts/generate?${q.toString()}`, { method: "POST" });
      const n = await api<C[]>("/contracts?company_id=" + cid);
      setRows(n);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <h1 className="text-2xl font-bold text-zinc-900">Contratos</h1>
      {staff && (
        <div className="f-panel flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end w-full min-w-0">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">Empresa ID</p>
            <input className="f-input w-full min-[400px]:w-28 text-xs" value={cid} onChange={(e) => setCid(e.target.value)} />
          </div>
          <div className="min-w-0 flex-1 sm:flex-initial sm:min-w-[14rem]">
            <p className="text-xs text-zinc-500">Tipo</p>
            <select
              className="f-input w-full text-xs"
              value={ct}
              onChange={(e) =>
                setCt(e.target.value as "marco" | "cession" | "confirmation")
              }
            >
              <option value="marco">Contrato Marco</option>
              <option value="cession">Contrato de Cesión</option>
              <option value="confirmation">Confirmación de Operación</option>
            </select>
          </div>
          <button type="button" className="f-btn-primary text-xs" onClick={gen}>
            Generar (demo)
          </button>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="f-panel w-full min-w-0">
        <div className="f-data-shell -mx-1 sm:mx-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b">
              <th className="py-2 pr-3">Título</th>
              <th className="py-2 pr-3">Tipo</th>
              <th className="py-2 pr-3">Firma</th>
              <th className="py-2">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2.5 pr-3">{r.title}</td>
                <td className="py-2.5 pr-3 text-xs font-mono">{r.contract_type}</td>
                <td className="py-2.5 pr-3"><StatusBadge status={r.signature_status} /></td>
                <td className="py-2.5 text-xs text-zinc-500">{r.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-sm text-zinc-500 py-4">Sin contratos</p>}
        </div>
      </div>
    </div>
  );
}
