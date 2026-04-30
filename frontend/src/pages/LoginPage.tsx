import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("cliente@demo.com");
  const [password, setPassword] = useState("Cliente123!");
  const [err, setErr] = useState<string | null>(null);
  const [load, setLoad] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoad(true);
    try {
      await login(email, password);
      nav("/app");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Error de inicio de sesión");
    } finally {
      setLoad(false);
    }
  }

  return (
    <div className="min-h-screen w-full min-w-0 flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 min-h-0 bg-gradient-to-br from-violet-900 via-zinc-900 to-black p-8 lg:p-12 text-white flex-col justify-between">
        <div>
          <img src="/logo.png" alt="" className="h-10 w-auto mb-8 opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <h1 className="text-3xl font-bold tracking-tight">Factoring seguro y transparente</h1>
          <p className="mt-4 text-zinc-300 max-w-md text-sm leading-relaxed">
            Digitalice el ciclo de cesión de facturas, contratos y cobros con un panel
            construido para equipos financieros.
          </p>
        </div>
        <p className="text-xs text-zinc-500">Finecta — Plataforma Financiera</p>
      </div>
      <div className="flex-1 w-full min-w-0 flex items-center justify-center p-4 sm:p-6 bg-zinc-100">
        <div className="w-full max-w-md min-w-0 f-panel">
          <h2 className="text-lg font-semibold text-zinc-900">Iniciar sesión</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Accede con tu cuenta corporativa
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs text-zinc-500">Correo</label>
              <input
                className="f-input mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Contraseña</label>
              <input
                className="f-input mt-1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {err && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {err}
              </p>
            )}
            <button type="submit" className="f-btn-primary w-full" disabled={load}>
              {load ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <p className="text-center text-sm text-zinc-500 mt-4">
            ¿Nueva empresa?{" "}
            <Link to="/registro" className="text-orange-600 font-medium hover:underline">
              Registrarse
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
