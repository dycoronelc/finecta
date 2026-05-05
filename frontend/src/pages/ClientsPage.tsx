import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type ClientRow = {
  id: number;
  legal_name: string;
  tax_id: string;
  contact_full_name: string;
  phone: string | null;
  contact_email: string;
};

export function ClientsPage() {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setRows(await api<ClientRow[]>("/clients"));
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  return (
    <div className="f-page w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full min-w-0">
        <h1 className="text-2xl font-bold text-zinc-900">Clientes</h1>
        <Link to="/app/clientes/nuevo" className="f-btn-primary text-xs w-full sm:w-auto text-center shrink-0">
          Nuevo cliente
        </Link>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex flex-wrap items-center gap-2 w-full min-w-0 mt-3">
        <button type="button" className="f-btn-ghost text-xs" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      <div className="f-panel w-full min-w-0 mt-4">
        <div className="f-data-shell -mx-1 sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-200">
                <th className="py-2 pr-2">Nombre de la empresa</th>
                <th className="py-2 pr-2">RUC / RIF</th>
                <th className="py-2 pr-2">Contacto principal</th>
                <th className="py-2 pr-2">Teléfono</th>
                <th className="py-2 pr-2">Correo</th>
                <th className="py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50/80">
                  <td className="py-2.5 pr-2 font-medium text-zinc-900">{c.legal_name}</td>
                  <td className="py-2.5 pr-2 font-mono text-xs">{c.tax_id}</td>
                  <td className="py-2.5 pr-2 text-zinc-700">{c.contact_full_name || "—"}</td>
                  <td className="py-2.5 pr-2 text-xs text-zinc-600">{c.phone || "—"}</td>
                  <td className="py-2.5 pr-2 text-xs text-zinc-600 break-all">{c.contact_email}</td>
                  <td className="py-2.5 text-right">
                    <Link
                      to={`/app/clientes/${c.id}`}
                      className="text-orange-600 text-xs font-medium hover:underline"
                    >
                      Ver / editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-zinc-500 py-6">No hay clientes registrados.</p>}
        </div>
      </div>
    </div>
  );
}
