import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    legal_name: "",
    tax_id: "",
    contact_email: "",
    phone: "",
    contact_full_name: "",
    admin_email: "",
    admin_name: "",
    password: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [load, setLoad] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoad(true);
    try {
      await register({ ...form });
      nav("/app");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Error al registrar");
    } finally {
      setLoad(false);
    }
  }

  return (
    <div className="min-h-screen w-full min-w-0 flex items-center justify-center p-4 sm:p-6 bg-zinc-100">
      <div className="w-full max-w-2xl min-w-0 f-panel">
        <h1 className="text-lg font-semibold">Alta de empresa</h1>
        <p className="text-sm text-zinc-500 mt-1">Paso 1 — Datos básicos y administrador</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-zinc-500">Razón social</label>
              <input className="f-input mt-1" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">RNC / ID fiscal</label>
              <input className="f-input mt-1" value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Teléfono</label>
              <input className="f-input mt-1" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-zinc-500">Correo de contacto</label>
              <input className="f-input mt-1" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-zinc-500">Nombre y apellidos del contacto principal</label>
              <input
                className="f-input mt-1"
                value={form.contact_full_name}
                onChange={(e) => set("contact_full_name", e.target.value)}
                placeholder="Si lo deja vacío, se usará el nombre del administrador"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Nombre del administrador</label>
              <input className="f-input mt-1" value={form.admin_name} onChange={(e) => set("admin_name", e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Correo de acceso</label>
              <input className="f-input mt-1" type="email" value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} required />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-zinc-500">Contraseña</label>
              <input className="f-input mt-1" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={6} />
            </div>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" className="f-btn-primary w-full" disabled={load}>
            {load ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        <p className="text-center text-sm text-zinc-500 mt-4">
          <Link to="/login" className="text-orange-600 font-medium">Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
