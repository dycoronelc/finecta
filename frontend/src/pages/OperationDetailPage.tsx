import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
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
  payer: string;
  payer_tax_id?: string | null;
  amount: string;
  due_date: string | null;
  status: string;
};

type Disb = {
  id: number;
  operation_id: number;
  amount: string;
  status: string;
  reference: string | null;
  created_at: string;
  completed_at: string | null;
};

type Pay = {
  id: number;
  operation_id: number;
  payer: string;
  amount: string;
  status: string;
  received_at: string | null;
  notes: string | null;
  created_at: string;
};

export function OperationDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "analyst";
  const [op, setOp] = useState<Op | null>(null);
  const [ev, setEv] = useState<Ev[]>([]);
  const [inv, setInv] = useState<Inv[]>([]);
  const [disb, setDisb] = useState<Disb[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dAmount, setDAmount] = useState("");
  const [dRef, setDRef] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pPayer, setPPayer] = useState("");
  const [pNotes, setPNotes] = useState("");
  const defaultPayerDone = useRef(false);

  useEffect(() => {
    defaultPayerDone.current = false;
  }, [id]);

  const payerSuggestions = useMemo(() => {
    const s = new Set<string>();
    for (const i of inv) {
      if (i.payer && i.payer !== "—") s.add(i.payer);
    }
    return [...s].sort();
  }, [inv]);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setErr(null);
    const [o, e, i, ds, ps] = await Promise.all([
      api<Op>(`/operations/${id}`),
      api<Ev[]>(`/operations/${id}/timeline`),
      api<Inv[]>(`/operations/${id}/invoices`),
      api<Disb[]>(`/disbursements?operation_id=${id}`),
      api<Pay[]>(`/collections/payments?operation_id=${id}`),
    ]);
    setOp(o);
    setEv(e);
    setInv(i);
    setDisb(ds);
    setPays(ps);
  }, [id]);

  useEffect(() => {
    loadAll().catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [loadAll]);

  useEffect(() => {
    if (defaultPayerDone.current || !inv.length) return;
    const first = inv.find((x) => x.payer && x.payer !== "—");
    if (first) {
      setPPayer(first.payer);
      defaultPayerDone.current = true;
    }
  }, [inv]);

  async function submitDisbursement() {
    if (!id || !dAmount) return;
    setBusy(true);
    setErr(null);
    try {
      await api<Disb>(`/disbursements/${id}`, {
        method: "POST",
        json: { amount: dAmount, reference: dRef || null },
      });
      setDAmount("");
      setDRef("");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment() {
    if (!id || !pAmount || !pPayer.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api<Pay>(`/collections/payments/${id}`, {
        method: "POST",
        json: {
          amount: pAmount,
          payer: pPayer.trim(),
          status: "received",
          notes: pNotes || null,
        },
      });
      setPAmount("");
      setPNotes("");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function closeOp() {
    if (!id) return;
    if (!window.confirm("¿Cerrar esta operación? Debe haber completado cobros y desembolsos según su proceso interno.")) return;
    setBusy(true);
    setErr(null);
    try {
      await api<Op>(`/collections/operations/${id}/close`, { method: "POST" });
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const canCashFlow =
    staff && op && !["closed", "cancelled", "draft"].includes(op.status);

  return (
    <div className="f-page w-full min-w-0">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link to="/app/operaciones" className="hover:text-orange-600">
          Operaciones
        </Link>
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

      {staff && canCashFlow && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full min-w-0">
          <div className="f-panel space-y-3">
            <h2 className="text-sm font-semibold text-zinc-800">Registrar desembolso</h2>
            <p className="text-xs text-zinc-500">Abono al cliente por la compra de cartera en esta operación.</p>
            <input
              className="f-input w-full text-sm"
              type="text"
              inputMode="decimal"
              placeholder="Monto (ej. 150000.50)"
              value={dAmount}
              onChange={(e) => setDAmount(e.target.value)}
            />
            <input
              className="f-input w-full text-sm"
              placeholder="Referencia bancaria (opcional)"
              value={dRef}
              onChange={(e) => setDRef(e.target.value)}
            />
            <button
              type="button"
              className="f-btn-primary text-xs w-full"
              disabled={busy || !dAmount}
              onClick={() => void submitDisbursement()}
            >
              Registrar desembolso
            </button>
          </div>
          <div className="f-panel space-y-3">
            <h2 className="text-sm font-semibold text-zinc-800">Registrar cobro del pagador</h2>
            <p className="text-xs text-zinc-500">
              Indique el pagador de la factura (puede haber varios en una misma operación).
            </p>
            <input
              className="f-input w-full text-sm"
              list="payer-suggestions"
              placeholder="Pagador"
              value={pPayer}
              onChange={(e) => setPPayer(e.target.value)}
            />
            <datalist id="payer-suggestions">
              {payerSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <input
              className="f-input w-full text-sm"
              type="text"
              inputMode="decimal"
              placeholder="Monto recibido"
              value={pAmount}
              onChange={(e) => setPAmount(e.target.value)}
            />
            <input
              className="f-input w-full text-sm"
              placeholder="Notas (opcional)"
              value={pNotes}
              onChange={(e) => setPNotes(e.target.value)}
            />
            <button
              type="button"
              className="f-btn-primary text-xs w-full"
              disabled={busy || !pAmount || !pPayer.trim()}
              onClick={() => void submitPayment()}
            >
              Registrar cobro
            </button>
          </div>
          <div className="f-panel space-y-3 flex flex-col">
            <h2 className="text-sm font-semibold text-zinc-800">Cierre</h2>
            <p className="text-xs text-zinc-500 flex-1">
              Marca la operación como cerrada cuando el ciclo de cobro haya finalizado.
            </p>
            <button
              type="button"
              className="f-btn-ghost text-xs border border-zinc-200 w-full"
              disabled={busy}
              onClick={() => void closeOp()}
            >
              Cerrar operación
            </button>
          </div>
        </div>
      )}

      {op && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full min-w-0">
          <div className="f-panel">
            <h2 className="text-sm font-semibold text-zinc-800 mb-2">Desembolsos</h2>
            <ul className="text-sm space-y-2 divide-y divide-zinc-100">
              {disb.map((d) => (
                <li key={d.id} className="pt-2 first:pt-0 flex justify-between gap-2">
                  <div>
                    <p className="tabular-nums font-medium">{money(d.amount)}</p>
                    <p className="text-xs text-zinc-500">{d.reference || "—"}</p>
                  </div>
                  <StatusBadge status={d.status} />
                </li>
              ))}
              {disb.length === 0 && <li className="text-zinc-500 py-2">Sin desembolsos registrados</li>}
            </ul>
          </div>
          <div className="f-panel">
            <h2 className="text-sm font-semibold text-zinc-800 mb-2">Cobros registrados</h2>
            <ul className="text-sm space-y-2 divide-y divide-zinc-100">
              {pays.map((p) => (
                <li key={p.id} className="pt-2 first:pt-0 flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-800 truncate">{p.payer}</p>
                    <p className="tabular-nums text-zinc-700">{money(p.amount)}</p>
                    {p.notes && <p className="text-xs text-zinc-500 line-clamp-2">{p.notes}</p>}
                  </div>
                  <StatusBadge status={p.status} />
                </li>
              ))}
              {pays.length === 0 && <li className="text-zinc-500 py-2">Sin cobros registrados</li>}
            </ul>
          </div>
        </div>
      )}

      <div className="grid w-full min-w-0 grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="f-panel">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Facturas vinculadas</h2>
          <ul className="space-y-2 text-sm">
            {inv.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 border-b border-zinc-100 pb-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs">{i.invoice_number}</p>
                  <p className="text-zinc-500 text-xs line-clamp-1">Pagador: {i.payer}</p>
                  {i.payer_tax_id && (
                    <p className="text-zinc-400 text-[10px] font-mono">RNC pagador: {i.payer_tax_id}</p>
                  )}
                </div>
                <div className="text-right text-xs shrink-0">
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
                <p className="text-xs text-zinc-400 mt-1">
                  {e.created_at?.replace("T", " ").slice(0, 19)}
                </p>
              </li>
            ))}
            {ev.length === 0 && <li className="text-zinc-500">Sin eventos aún</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}
