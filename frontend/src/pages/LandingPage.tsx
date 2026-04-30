import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="min-h-screen w-full min-w-0 flex flex-col bg-zinc-950 text-white">
      <header className="h-16 shrink-0 w-full flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-white/10">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Finecta" className="h-8 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="font-semibold">finecta</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to="/registro" className="f-btn-ghost !text-zinc-200 !hover:bg-white/5 text-sm">Crear cuenta</Link>
          <Link to="/login" className="f-btn rounded-xl px-4 py-2 bg-[#F97316] text-white text-sm font-medium hover:bg-[#ea580c]">Entrar</Link>
        </div>
      </header>
      <section className="flex-1 w-full min-w-0 flex items-center justify-center">
        <div className="w-full max-w-4xl min-w-0 mx-auto px-4 sm:px-6 py-12 md:py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-orange-300 via-amber-200 to-white bg-clip-text text-transparent">
            Factoring con control total del ciclo
          </h1>
          <p className="mt-6 text-zinc-300 text-sm md:text-base leading-relaxed max-w-2xl mx-auto">
            Onboarding, contratos, facturas, desembolsos y cobros en un entorno
            con roles y auditoría — preparado para integrar ERP, ViaFirma y
            n8n.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className="f-btn rounded-xl px-5 py-3 bg-[#F97316] text-sm font-medium hover:bg-[#ea580c]">
              Acceder al panel
            </Link>
            <a href="/docs" className="text-sm text-zinc-400 hover:text-zinc-200" target="_blank" rel="noreferrer">
              API (backend /docs) →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
