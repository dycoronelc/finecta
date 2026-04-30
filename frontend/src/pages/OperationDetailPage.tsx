import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { money, fmtDate } from "../lib/format";
import { StatusBadge } from "../components/ui/StatusBadge";

type Op = {
  id: number;
  code: string;
  status: string;
  total_invoiced: string;
  created_at: string;
};

type Ev = {
  id: number;
  event_type: string;
  message: string;
  created_at: string;
};

type Inv = {
  id: number;
  invoice_number: string;
  issuer: string;
  amount: string;
  due_date: string | null;
  status: string;
};

export function OperationDetailPage() {
  const { id } = useParams();
  const [op, setOp] = useState<Op | null>(null);
  const [ev, setEv] = useState<Ev[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<Op>(`/operations/${id}`),
      api<Ev[]>(`/operations/${id}/timeline`),
      api<Inv[]>(`/operations/${id}/invoices`),
    ])
      .then(([o, e, i]) => {
        setOp(o);
        setEv(e);
        setInv(i);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [id]);

  return (
    <div className="f-page w-full min-w-0">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link to="/app/operaciones" className="hover:text-orange-600">Operaciones</Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium font-mono">{op?.code ?? "…"}</span>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {op && (
        <div className="f-panel flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Operación {op.code}</h1>
            <p className="text-sm text-zinc-500 mt-1">Total: {money(op.total_invoiced)}</p>
          </div>
          <StatusBadge status={op.status} />
        </div>
      )}

      <div className="grid w-full min-w-0 grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="f-panel">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Facturas vinculadas</h2>
          <ul className="space-y-2 text-sm">
            {inv.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 border-b border-zinc-100 pb-2">
                <div>
                  <p className="font-mono text-xs">{i.invoice_number}</p>
                  <p className="text-zinc-500 text-xs line-clamp-1">{i.issuer}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="tabular-nums font-medium">{money(i.amount)}</p>
                  <p className="text-zinc-500">{fmtDate(i.due_date)}</p>
                </div>
              </li>
            ))}
            {inv.length === 0 && <li className="text-zinc-500">Sin facturas en esta operación</li>}
          </ul>
        </div>
        <div className="f-panel">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Línea de tiempo</h2>
          <ol className="space-y-4 text-sm">
            {ev.map((e) => (
              <li key={e.id} className="relative pl-4 border-l border-zinc-200">
                <span className="absolute -left-1.5 top-1 h-2 w-2 rounded-full bg-orange-500" />
                <p className="text-zinc-800 font-medium text-xs uppercase tracking-wide">
                  {e.event_type}
                </p>
                <p className="text-zinc-600 mt-0.5">{e.message}</p>
                <p className="text-xs text-zinc-400 mt-1">{e.created_at?.replace("T", " ").slice(0, 19)}</p>
              </li>
            ))}
            {ev.length === 0 && <li className="text-zinc-500">Sin eventos aún</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}
