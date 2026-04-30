import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import {
  PortfolioAnalyticsBlock,
  type PortfolioAnalytics,
} from "../components/dashboard/PortfolioAnalyticsBlock";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/format";

type Kpi = {
  kyc_pending?: number;
  open_operations?: number;
  total_disbursed?: string;
  in_collection?: number;
  my_invoices?: number;
  my_operations?: number;
  open_quotations?: number;
};

export function DashboardPage() {
  const { user } = useAuth();
  const [k, setK] = useState<Kpi | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [analyticsErr, setAnalyticsErr] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    api<Kpi>("/dashboard/kpis")
      .then(setK)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);

  useEffect(() => {
    setAnalyticsLoading(true);
    setAnalyticsErr(null);
    api<PortfolioAnalytics>("/dashboard/analytics")
      .then((d) => {
        setAnalytics(d);
        setAnalyticsLoading(false);
      })
      .catch((e) => {
        setAnalyticsErr(e instanceof Error ? e.message : "Error");
        setAnalyticsLoading(false);
      });
  }, []);

  const isStaff = user?.role === "admin" || user?.role === "analyst";

  return (
    <div className="f-page">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Panel de control</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Resumen de su actividad en la plataforma
        </p>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {isStaff && (
        <div className="f-kpi-grid">
          <KpiCard title="KYC pendiente" value={k?.kyc_pending ?? 0} hint="Empresas en revisión" />
          <KpiCard title="Operaciones abiertas" value={k?.open_operations ?? 0} />
          <KpiCard
            title="Desembolsos (total)"
            value={money(k?.total_disbursed ?? "0")}
          />
          <KpiCard title="En cobro" value={k?.in_collection ?? 0} />
          <KpiCard title="Cotizaciones abiertas" value={k?.open_quotations ?? 0} />
        </div>
      )}

      {!isStaff && (
        <>
          <div className="f-kpi-grid">
            <KpiCard title="Mis facturas" value={k?.my_invoices ?? 0} />
            <KpiCard title="Mis operaciones" value={k?.my_operations ?? 0} />
            <KpiCard title="Cotizaciones pendientes" value={k?.open_quotations ?? 0} />
          </div>
          <div className="f-panel w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-zinc-600 max-w-3xl">
              Complete el onboarding, cargue facturas y revise cotizaciones para iniciar
              el ciclo de factoring.
            </p>
            <Link
              to="/app/onboarding"
              className="f-btn-primary shrink-0 w-full sm:w-auto text-xs py-2.5 px-4"
            >
              Ir a onboarding
            </Link>
          </div>
        </>
      )}

      <PortfolioAnalyticsBlock
        data={analytics}
        error={analyticsErr}
        loading={analyticsLoading}
      />
    </div>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: string | number; hint?: string }) {
  return (
    <div className="f-panel">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
        {value}
      </p>
      {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
