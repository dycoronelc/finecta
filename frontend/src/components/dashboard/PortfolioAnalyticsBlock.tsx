import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "../../lib/format";

const PIE_COLORS = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#eab308",
  "#ef4444",
  "#14b8a6",
  "#6366f1",
];

export type PortfolioAnalytics = {
  has_data: boolean;
  scope: string;
  company_id: number | null;
  summary: {
    invoices?: number;
    total_amount?: string;
    unique_issuers?: number;
    avg_ticket?: string;
    date_from?: string | null;
    date_to?: string | null;
  };
  volume_by_company: {
    company_id: number;
    legal_name: string;
    invoice_count: number;
    total_amount: string;
    share_percent: number;
  }[];
  monthly_trend: {
    month: string;
    label: string;
    amount: string;
    invoice_count: number;
  }[];
  top_issuers: { issuer: string; amount: string; invoice_count: number }[];
  rfm_issuers: {
    issuer: string;
    recency_days: number;
    frequency: number;
    monetary: string;
    r_score: number;
    f_score: number;
    m_score: number;
    segment: string;
  }[];
  rfm_segments: { segment: string; count: number; key: string }[];
  clusters: { cluster_id: number; label: string; count: number }[];
  cluster_assignments: {
    issuer: string;
    cluster_id: number;
    label: string;
    rfm_score: string;
  }[];
};

type Props = {
  data: PortfolioAnalytics | null;
  error: string | null;
  loading: boolean;
};

function parseAmount(s: string | undefined): number {
  if (s == null || s === "") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function PortfolioAnalyticsBlock({ data, error, loading }: Props) {
  if (loading) {
    return (
      <div className="f-panel">
        <p className="text-sm text-zinc-500">Cargando analítica de cartera…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="f-panel border-red-200 bg-red-50/50">
        <p className="text-sm text-red-700">No se pudo cargar la analítica: {error}</p>
      </div>
    );
  }
  if (!data || !data.has_data) {
    return (
      <div className="f-panel">
        <h2 className="text-base font-semibold text-zinc-900">Analítica de cartera</h2>
        <p className="text-sm text-zinc-500 mt-1">
          No hay facturas asociadas a su cuenta aún, o vincule una empresa en onboarding para ver
          tendencias y RFM.
        </p>
      </div>
    );
  }

  const s = data.summary;
  const trendData = data.monthly_trend.map((m) => ({
    ...m,
    amountNum: parseAmount(m.amount),
  }));
  const volData = data.volume_by_company.map((v) => ({
    name: v.legal_name.length > 32 ? `${v.legal_name.slice(0, 30)}…` : v.legal_name,
    fullName: v.legal_name,
    amountNum: parseAmount(v.total_amount),
    share: v.share_percent,
    invoices: v.invoice_count,
  }));
  const topIss = data.top_issuers.map((r) => ({
    name: r.issuer.length > 36 ? `${r.issuer.slice(0, 34)}…` : r.issuer,
    fullName: r.issuer,
    amountNum: parseAmount(r.amount),
    invoices: r.invoice_count,
  }));
  const rfmPie = data.rfm_segments.map((x) => ({
    name: x.segment,
    value: x.count,
    key: x.key,
  }));
  const clusterBars = data.clusters.map((c) => ({
    name: c.label.length > 28 ? `${c.label.slice(0, 26)}…` : c.label,
    fullLabel: c.label,
    count: c.count,
  }));

  const scopeLabel = data.scope === "platform" ? "Toda la plataforma" : "Su empresa";

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Analítica de cartera</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Tendencias, volumen por cliente, RFM por emisor (proveedor) y clústeres
          </p>
        </div>
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide shrink-0">
          Alcance: {scopeLabel}
        </span>
      </div>

      <div className="f-kpi-grid">
        <div className="f-panel">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Facturas</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {s.invoices ?? 0}
          </p>
        </div>
        <div className="f-panel">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Monto total</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {money(s.total_amount ?? "0")}
          </p>
        </div>
        <div className="f-panel">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Emisores</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {s.unique_issuers ?? 0}
          </p>
        </div>
        <div className="f-panel">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Ticket medio</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {money(s.avg_ticket ?? "0")}
          </p>
        </div>
        <div className="f-panel sm:col-span-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Rango de fechas</p>
          <p className="mt-2 text-sm font-medium text-zinc-800">
            {s.date_from && s.date_to
              ? `${new Date(s.date_from).toLocaleDateString("es-AR")} – ${new Date(
                  s.date_to
                ).toLocaleDateString("es-AR")}`
              : "—"}
          </p>
        </div>
      </div>

      {volData.length > 0 && (
        <div className="f-panel">
          <h3 className="text-sm font-semibold text-zinc-900">Volumen por cliente (empresa)</h3>
          <p className="text-xs text-zinc-500 mt-1">Participación aproximada de facturación</p>
          <div className="mt-4 h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#52525b" }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={64}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#52525b" }}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip
                  formatter={(v) => [money(String(Number(v))), "Monto"]}
                  labelFormatter={(_, p) => {
                    const pl = p?.[0]?.payload;
                    return pl?.fullName ?? "";
                  }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7" }}
                />
                <Bar dataKey="amountNum" name="Monto" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {trendData.length > 0 && (
        <div className="f-panel">
          <h3 className="text-sm font-semibold text-zinc-900">Tendencia mensual</h3>
          <p className="text-xs text-zinc-500 mt-1">Monto acumulado por mes (facturación)</p>
          <div className="mt-4 h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#52525b" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#52525b" }}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip
                  formatter={(v) => [money(String(Number(v))), "Monto"]}
                  labelStyle={{ color: "#18181b" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7" }}
                />
                <Area
                  type="monotone"
                  dataKey="amountNum"
                  name="Monto"
                  stroke="#ea580c"
                  fill="url(#finectaArea)"
                  strokeWidth={2}
                />
                <defs>
                  <linearGradient id="finectaArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {topIss.length > 0 && (
        <div className="f-panel">
          <h3 className="text-sm font-semibold text-zinc-900">Top emisores (proveedores)</h3>
          <p className="text-xs text-zinc-500 mt-1">Por monto de facturación en el periodo</p>
          <div className="mt-4 h-[min(28rem,50vh)] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topIss}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#52525b" }}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 10, fill: "#52525b" }}
                />
                <Tooltip
                  formatter={(v) => [money(String(Number(v))), "Monto"]}
                  labelFormatter={(_, p) => {
                    const pl = p?.[0]?.payload;
                    return pl?.fullName ?? "";
                  }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7" }}
                />
                <Bar dataKey="amountNum" name="Monto" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        {rfmPie.length > 0 && (
          <div className="f-panel min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900">RFM — segmentos (emisores)</h3>
            <p className="text-xs text-zinc-500 mt-1">Recencia, frecuencia y monto (puntuación)</p>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rfmPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {rfmPie.map((seg, i) => (
                      <Cell key={`${seg.key}-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [Number(v), "Emisores"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7" }}
                  />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {clusterBars.length > 0 && (
          <div className="f-panel min-w-0">
            <h3 className="text-sm font-semibold text-zinc-900">Clustering (K-Means)</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Agrupación por comportamiento (recencia, frecuencia, monto en escala log)
            </p>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={clusterBars}
                  margin={{ top: 8, right: 8, left: 8, bottom: 32 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#52525b" }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#52525b" }} />
                  <Tooltip
                    formatter={(v) => [Number(v), "Emisores en clúster"]}
                    labelFormatter={(_, p) => {
                      const pl = p?.[0]?.payload;
                      return pl?.fullLabel ?? "";
                    }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7" }}
                  />
                  <Bar dataKey="count" name="Emisores" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {data.rfm_issuers.length > 0 && (
        <div className="f-panel f-data-shell">
          <h3 className="text-sm font-semibold text-zinc-900">Detalle RFM por emisor</h3>
          <p className="text-xs text-zinc-500 mt-1">Hasta 25 emisores con más volumen (muestra)</p>
          <div className="mt-3 overflow-x-auto -mx-1">
            <table className="min-w-[720px] w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Emisor</th>
                  <th className="py-2 pr-3 font-medium">Segmento</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Días (rec.)</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">F</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Monto</th>
                  <th className="py-2 pr-2 font-medium tabular-nums">R-F-M</th>
                </tr>
              </thead>
              <tbody>
                {data.rfm_issuers.map((row, idx) => (
                  <tr
                    key={`${row.issuer}-${idx}`}
                    className="border-b border-zinc-100 hover:bg-zinc-50/80"
                  >
                    <td className="py-2 pr-3 text-zinc-800 max-w-[200px] truncate" title={row.issuer}>
                      {row.issuer}
                    </td>
                    <td className="py-2 pr-3 text-zinc-600 text-xs">{row.segment}</td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-700">{row.recency_days}</td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-700">{row.frequency}</td>
                    <td className="py-2 pr-3 tabular-nums text-zinc-800">
                      {money(row.monetary)}
                    </td>
                    <td className="py-2 pr-2 tabular-nums text-zinc-600 text-xs">
                      {row.r_score}-{row.f_score}-{row.m_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.cluster_assignments.length > 0 && (
        <div className="f-panel f-data-shell">
          <h3 className="text-sm font-semibold text-zinc-900">Asignación a clústeres</h3>
          <p className="text-xs text-zinc-500 mt-1">Emisores y puntuación R-F-M (muestra)</p>
          <div className="mt-3 overflow-x-auto -mx-1">
            <table className="min-w-[560px] w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-3 font-medium">Emisor</th>
                  <th className="py-2 pr-3 font-medium">Clúster</th>
                  <th className="py-2 pr-2 font-medium">R-F-M</th>
                </tr>
              </thead>
              <tbody>
                {data.cluster_assignments.map((row) => (
                  <tr
                    key={`${row.issuer}-${row.cluster_id}`}
                    className="border-b border-zinc-100 hover:bg-zinc-50/80"
                  >
                    <td className="py-2 pr-3 text-zinc-800 max-w-[220px] truncate" title={row.issuer}>
                      {row.issuer}
                    </td>
                    <td className="py-2 pr-3 text-zinc-600 text-xs max-w-[180px]" title={row.label}>
                      {row.label}
                    </td>
                    <td className="py-2 pr-2 text-zinc-500 tabular-nums text-xs">{row.rfm_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
