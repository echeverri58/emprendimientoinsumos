import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';
import { Card, EmptyState, Skeleton } from './ui/index.jsx';
import { formatCOP, formatCOPCompact, formatNumber, percent, truncate } from '../lib/format.js';

const EMERALD = '#059669';
const SLATE = '#0F172A';
const AMBER = '#f59e0b';
const SKY = '#0ea5e9';
const ROSE = '#e11d48';
const VIOLET = '#7c3aed';

const GROUP_COLORS = {
  calzado: AMBER,
  vestuario: EMERALD,
  medias: SKY,
  epp: ROSE,
  otro: SLATE,
};

/** Styled tooltip shared by every chart. */
function ChartTooltip({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label ? <p className="mb-1 font-semibold text-slate-800">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-sm" style={{ background: entry.color || entry.payload?.fill }} />
          <span>{entry.name}:</span>
          <span className="tnum font-semibold text-slate-800">
            {valueFormatter ? valueFormatter(entry.value, entry) : formatNumber(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children, className = '', loading }) {
  return (
    <Card className={`flex flex-col p-4 ${className}`}>
      <div className="mb-3 flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : null}
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? <Skeleton className="h-[220px] w-full" /> : children}
      </div>
    </Card>
  );
}

function NoData({ message = 'Sin datos para el filtro seleccionado.' }) {
  return <EmptyState title="Sin datos" message={message} icon={BarChart3} />;
}

/**
 * Dashboard charts: monthly trend, UNSPSC group mix, top buying entities and the
 * status breakdown.
 */
export default function ChartsPanel({ summary, loading }) {
  const series = summary?.series;
  const porMes = series?.porMes ?? [];
  const porCategoria = series?.porCategoria ?? [];
  const topEntidades = series?.topEntidades ?? [];
  const porEstado = series?.porEstado ?? [];

  const totalCategoria = porCategoria.reduce((sum, c) => sum + c.contratos, 0);
  const totalEstado = porEstado.reduce((sum, e) => sum + e.contratos, 0);

  const entidadesData = topEntidades.slice(0, 8).map((e) => ({
    ...e,
    corta: truncate(e.nombre, 30),
  }));

  const estadosData = porEstado.map((e) => ({
    ...e,
    corta: truncate(e.estado, 16),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Evolución mensual"
          subtitle="Contratos firmados y valor adjudicado por mes"
          icon={BarChart3}
          className="lg:col-span-2"
          loading={loading}
        >
          {porMes.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={porMes} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="valorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={EMERALD} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={EMERALD} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={62}
                  tickFormatter={(v) => formatCOPCompact(v).replace('$ ', '')}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(value, entry) =>
                        entry?.name === 'Valor' ? formatCOP(value) : formatNumber(value)
                      }
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <Bar
                  yAxisId="left"
                  dataKey="contratos"
                  name="Contratos"
                  fill={SLATE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="valor"
                  name="Valor"
                  stroke={EMERALD}
                  strokeWidth={2}
                  fill="url(#valorGradient)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Mezcla por categoría UNSPSC"
          subtitle="Distribución de contratos por grupo de negocio"
          icon={PieIcon}
          loading={loading}
        >
          {porCategoria.length === 0 ? (
            <NoData />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie
                    data={porCategoria}
                    dataKey="contratos"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {porCategoria.map((entry) => (
                      <Cell key={entry.id} fill={GROUP_COLORS[entry.id] ?? SLATE} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={
                      <ChartTooltip
                        valueFormatter={(value, entry) =>
                          `${formatNumber(value)} (${percent(value, totalCategoria)}%)`
                        }
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1.5">
                {porCategoria.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: GROUP_COLORS[entry.id] ?? SLATE }}
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-600" title={entry.label}>
                      {entry.label}
                    </span>
                    <span className="tnum font-semibold text-slate-800">{formatNumber(entry.contratos)}</span>
                    <span className="tnum w-12 text-right text-slate-400">
                      {percent(entry.contratos, totalCategoria)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Entidades con mayor valor contratado"
          subtitle="Top 8 por suma de valor del contrato"
          icon={BarChart3}
          loading={loading}
        >
          {entidadesData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={entidadesData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCOPCompact(v).replace('$ ', '')}
                />
                <YAxis
                  type="category"
                  dataKey="corta"
                  width={168}
                  tick={{ fontSize: 10, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip valueFormatter={(value) => formatCOP(value)} />} />
                <Bar dataKey="valor" name="Valor" fill={EMERALD} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Estado de los contratos"
          subtitle="Contratos por estado contractual"
          icon={BarChart3}
          loading={loading}
        >
          {estadosData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={estadosData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="corta"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  allowDecimals={false}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(value) => `${formatNumber(value)} (${percent(value, totalEstado)}%)`}
                    />
                  }
                />
                <Bar dataKey="contratos" name="Contratos" fill={SKY} radius={[4, 4, 0, 0]} maxBarSize={54} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
