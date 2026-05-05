import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";

type PayerDetail = {
  id: number;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  contact_email: string;
  phone: string | null;
  contact_full_name: string;
  created_at: string;
};

function parseRoutePayerId(param: string | undefined): number | null {
  if (param == null) return null;
  const t = param.trim();
  if (t === "" || t === "nuevo" || t === "undefined") return null;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function PayerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const isNew = !id || id === "nuevo";
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [py, setPy] = useState<PayerDetail | null>(null);

  const [legal_name, setLegalName] = useState("");
  const [trade_name, setTradeName] = useState("");
  const [tax_id, setTaxId] = useState("");
  const [contact_email, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contact_full_name, setContactFullName] = useState("");

  const loadPayer = useCallback(async (payerId: number) => {
    const p = await api<PayerDetail>(`/payers/${payerId}`);
    setPy(p);
    setLegalName(p.legal_name);
    setTradeName(p.trade_name ?? "");
    setTaxId(p.tax_id);
    setContactEmail(p.contact_email);
    setPhone(p.phone ?? "");
    setContactFullName(p.contact_full_name ?? "");
    return p;
  }, []);

  useEffect(() => {
    if (isNew || !id) {
      setPy(null);
      setLegalName("");
      setTradeName("");
      setTaxId("");
      setContactEmail("");
      setPhone("");
      setContactFullName("");
      return;
    }
    const pid = parseRoutePayerId(id);
    if (pid == null) {
      setErr("Identificador inválido");
      return;
    }
    setErr(null);
    loadPayer(pid).catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [id, isNew, loadPayer]);

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      if (isNew) {
        const p = await api<{ id: number }>("/payers", {
          method: "POST",
          json: {
            legal_name: legal_name.trim(),
            trade_name: trade_name.trim() || null,
            tax_id: tax_id.trim(),
            contact_email: contact_email.trim(),
            phone: phone.trim() || null,
            contact_full_name: contact_full_name.trim(),
          },
        });
        nav(`/app/pagadores/${p.id}`, { replace: true });
        return;
      }
      const routeId = parseRoutePayerId(id);
      const fromPy = py != null && typeof py.id === "number" && py.id > 0 ? py.id : null;
      const payerId = fromPy ?? routeId;
      if (payerId == null) {
        setErr("No se pudo identificar el pagador para guardar cambios.");
        return;
      }
      const p = await api<PayerDetail>(`/payers/${payerId}`, {
        method: "PATCH",
        json: {
          legal_name: legal_name.trim(),
          trade_name: trade_name.trim() || null,
          tax_id: tax_id.trim(),
          contact_email: contact_email.trim(),
          phone: phone.trim() || null,
          contact_full_name: contact_full_name.trim(),
        },
      });
      await loadPayer(p.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="f-page w-full min-w-0">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link to="/app/pagadores" className="hover:text-orange-600">
          Pagadores
        </Link>
        <span>/</span>
        <span className="text-zinc-800 font-medium">{isNew ? "Nuevo pagador" : py?.legal_name ?? "…"}</span>
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 mt-2">
        {isNew ? "Alta de pagador" : "Ficha de pagador"}
      </h1>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}

      <div className="mt-4 f-panel w-full min-w-0 space-y-4">
        <p className="text-sm text-zinc-600">
          Datos del pagador / deudor. El RUC/RIF identifica al contribuyente; el contacto principal es la referencia ante
          Finecta para este catálogo.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 sm:col-span-2 lg:col-span-2">
            <label className="text-xs text-zinc-500">Nombre de la empresa / razón social</label>
            <input className="f-input mt-1 w-full" value={legal_name} onChange={(e) => setLegalName(e.target.value)} required />
          </div>
          <div className="min-w-0">
            <label className="text-xs text-zinc-500">Nombre comercial (opcional)</label>
            <input className="f-input mt-1 w-full" value={trade_name} onChange={(e) => setTradeName(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="text-xs text-zinc-500">RUC / RIF</label>
            <input className="f-input mt-1 w-full font-mono text-sm" value={tax_id} onChange={(e) => setTaxId(e.target.value)} required />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className="text-xs text-zinc-500">Nombre y apellidos del contacto principal</label>
            <input className="f-input mt-1 w-full" value={contact_full_name} onChange={(e) => setContactFullName(e.target.value)} required />
          </div>
          <div className="min-w-0">
            <label className="text-xs text-zinc-500">Teléfono</label>
            <input className="f-input mt-1 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label className="text-xs text-zinc-500">Correo electrónico</label>
            <input className="f-input mt-1 w-full" type="email" value={contact_email} onChange={(e) => setContactEmail(e.target.value)} required />
          </div>
        </div>
        <button type="button" className="f-btn-primary text-sm" disabled={busy} onClick={() => void save()}>
          {isNew ? "Crear pagador" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
