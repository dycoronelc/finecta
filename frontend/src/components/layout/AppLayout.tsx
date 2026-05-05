import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Bell,
  FileSpreadsheet,
  FileText,
  Home,
  Landmark,
  LayoutList,
  Building2,
  LogOut,
  Menu,
  Shield,
  UserCircle,
  Wallet,
  X,
} from "lucide-react";
import { useAuth, type Role } from "../../context/AuthContext";

const nav: { to: string; label: string; icon: ReactNode; roles: Role[]; end?: boolean }[] =
  [
    { to: "/app", label: "Panel", icon: <Home className="h-5 w-5" />, roles: ["admin", "analyst", "client", "fiduciary", "payer"], end: true },
    { to: "/app/onboarding", label: "Onboarding", icon: <UserCircle className="h-5 w-5" />, roles: ["client"] },
    { to: "/app/clientes", label: "Clientes", icon: <LayoutList className="h-5 w-5" />, roles: ["admin", "analyst"] },
    { to: "/app/pagadores", label: "Pagadores", icon: <Building2 className="h-5 w-5" />, roles: ["admin", "analyst"] },
    { to: "/app/facturas", label: "Facturas", icon: <FileText className="h-5 w-5" />, roles: ["admin", "analyst", "client"] },
    { to: "/app/cotizaciones", label: "Cotizaciones", icon: <Wallet className="h-5 w-5" />, roles: ["admin", "analyst", "client"] },
    { to: "/app/operaciones", label: "Operaciones", icon: <LayoutList className="h-5 w-5" />, roles: ["admin", "analyst", "client", "fiduciary"] },
    { to: "/app/contratos", label: "Contratos", icon: <FileText className="h-5 w-5" />, roles: ["admin", "analyst", "client"] },
    { to: "/app/validacion", label: "Validación (Excel)", icon: <FileSpreadsheet className="h-5 w-5" />, roles: ["admin", "analyst", "client", "payer"] },
    { to: "/app/fiduciario", label: "Fiduciario", icon: <Landmark className="h-5 w-5" />, roles: ["fiduciary", "admin"] },
  ];

const roleLabel: Record<Role, string> = {
  admin: "Administrador",
  analyst: "Analista",
  client: "Cliente",
  fiduciary: "Fiduciario",
  payer: "Pagador",
};

function NavItems({
  items,
  onNavigate,
  mobile = false,
}: {
  items: typeof nav;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  return (
    <>
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-white/10 text-white"
                : "text-zinc-300 hover:bg-white/5 hover:text-white"
            } ${mobile ? "w-full" : ""}`
          }
        >
          {i.icon}
          <span className="truncate">{i.label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const r = (user?.role ?? "client") as Role;
  const items = nav.filter((i) => i.roles.includes(r));

  return (
    <div className="min-h-screen w-full min-w-0 flex bg-zinc-100">
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 h-full min-h-screen w-64 shrink-0 flex flex-col bg-finecta-sidebar text-zinc-100 border-r border-zinc-800/50 transform transition-transform duration-200 ease-out md:static md:min-h-0 md:translate-x-0 md:h-auto ${
          menuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-zinc-800/60">
          <img
            src="/logo.png"
            alt="Finecta"
            className="h-9 w-auto object-contain rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">finecta</div>
            <div className="text-[10px] text-zinc-500 uppercase">Plataforma Financiera</div>
          </div>
        </div>
        <div className="md:hidden flex justify-end p-2 border-b border-zinc-800/60">
          <button
            type="button"
            className="p-2 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-2 space-y-1 flex-1 overflow-y-auto">
          <NavItems items={items} onNavigate={() => setMenuOpen(false)} mobile />
        </nav>
        <div className="mt-auto p-4 text-xs text-zinc-500 flex items-start gap-2 border-t border-zinc-800/50">
          <Shield className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Entorno seguro. Los datos de factoring son confidenciales.{" "}
            <a className="text-orange-400" href="https://www.figma.com" target="_blank" rel="noreferrer">
              Referencia de diseño
            </a>
            .
          </p>
        </div>
      </aside>

      <div className="flex-1 flex min-w-0 w-full flex-col md:pl-0">
        <header className="h-16 bg-white/90 backdrop-blur border-b border-zinc-200 flex items-center justify-between gap-3 px-4 sm:px-6 md:px-8 lg:px-10 2xl:px-12 shrink-0 w-full min-w-0">
          <button
            type="button"
            className="md:hidden p-2 -ml-1 rounded-xl text-zinc-600 hover:bg-zinc-100"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú de navegación"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-500">Bienvenido</p>
            <p className="text-sm font-semibold text-zinc-900 truncate">
              {user?.full_name} · {roleLabel[r as Role] ?? "Usuario"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative rounded-xl p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition"
              aria-label="notificaciones"
            >
              <Bell className="h-5 w-5" />
            </button>
            <Link to="/" className="f-btn-ghost" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 w-full min-w-0 p-4 sm:p-5 md:p-6 lg:px-8 lg:py-6 xl:px-10 xl:py-8 2xl:px-12">
          <div className="w-full min-w-0 max-w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
