import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import loginFondoUrl from "../assets/fondoFinecta.png";

const DEMO_ACCOUNTS: { email: string; password: string; role: string }[] = [
  { email: "admin@finecta.com", password: "Admin123!", role: "Admin" },
  { email: "analista@finecta.com", password: "Analista123!", role: "Analista" },
  { email: "cliente@demo.com", password: "Cliente123!", role: "Cliente (demo)" },
  { email: "fiduciario@finecta.com", password: "Fiduciario123!", role: "Fiduciario" },
  { email: "pagador@empresa.com", password: "Pagador123!", role: "Pagador" },
  {
    email: "cliente@ritmo.com",
    password: "Ritmo2026!",
    role: "Cliente Ritmo (tras importar Excel)",
  },
];

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("cliente@demo.com");
  const [password, setPassword] = useState("Cliente123!");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [load, setLoad] = useState(false);

  function applyDemo(account: (typeof DEMO_ACCOUNTS)[0]) {
    setEmail(account.email);
    setPassword(account.password);
    setErr(null);
  }

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
      <div className="hidden lg:flex lg:w-1/2 lg:min-h-screen min-h-0 relative overflow-hidden flex-col self-stretch">
        <img
          src={loginFondoUrl}
          alt=""
          decoding="async"
          fetchPriority="low"
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center select-none"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-br from-violet-900/45 via-zinc-900/50 to-black/70"
          aria-hidden
        />
        <div className="relative z-10 flex flex-1 flex-col justify-between p-8 lg:p-12 text-white min-h-0">
          <div>
            <img src="/logo.png" alt="" className="h-10 w-auto mb-8 opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <h1 className="text-3xl font-bold tracking-tight drop-shadow-sm">Factoring seguro y transparente</h1>
            <p className="mt-4 text-zinc-200 max-w-md text-sm leading-relaxed drop-shadow-sm">
              Digitalice el ciclo de cesión de facturas, contratos y cobros con un panel
              construido para equipos financieros.
            </p>
          </div>
          <p className="text-xs text-zinc-400 drop-shadow-sm">Finecta — Plataforma Financiera</p>
        </div>
      </div>
      <div className="flex-1 w-full min-w-0 flex items-center justify-center p-4 sm:p-6 bg-zinc-100">
        <div className="w-full max-w-md min-w-0 space-y-4">
          <div className="f-panel">
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
                <div className="flex items-center justify-between gap-2 mt-1">
                  <label className="text-xs text-zinc-500">Contraseña</label>
                  <Link
                    to="/recuperar-contrasena"
                    className="text-xs font-medium text-orange-600 hover:underline shrink-0"
                  >
                    Recuperar contraseña
                  </Link>
                </div>
                <div className="relative mt-1">
                  <input
                    className="f-input pr-11"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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

          <div className="f-panel border-dashed">
            <h3 className="text-sm font-semibold text-zinc-800">Cuentas de demostración</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Pulse una fila para rellenar correo y contraseña. Cambie estas claves en producción.
            </p>
            <div className="mt-3 rounded-xl border border-zinc-200 overflow-x-auto text-xs">
              <table className="w-full min-w-[320px] text-left">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
                    <th className="px-2 py-2 font-medium whitespace-nowrap">Rol</th>
                    <th className="px-2 py-2 font-medium">Usuario</th>
                    <th className="px-2 py-2 font-medium whitespace-nowrap">Contraseña</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_ACCOUNTS.map((row) => (
                    <tr
                      key={row.email}
                      className="border-b border-zinc-100 last:border-0 hover:bg-orange-50/60 cursor-pointer transition-colors"
                      onClick={() => applyDemo(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          applyDemo(row);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Usar cuenta ${row.email}`}
                    >
                      <td className="px-2 py-2 text-zinc-700 whitespace-nowrap align-top">{row.role}</td>
                      <td className="px-2 py-2 text-zinc-900 break-all align-top">{row.email}</td>
                      <td className="px-2 py-2 text-zinc-600 font-mono whitespace-nowrap align-top">
                        {row.password}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
