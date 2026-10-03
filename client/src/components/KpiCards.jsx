import { Banknote, Building2, CalendarClock, FileText, MapPin, TrendingUp } from 'lucide-react';
import { Card, Skeleton } from './ui/index.jsx';
import { formatCOP, formatCOPCompact, formatNumber } from '../lib/format.js';

function KpiShell({ icon: Icon, label, children, footnote, accent = 'slate' }) {
  const accents = {
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accents[accent]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="min-w-0">{children}</div>
      {footnote ? <p className="mt-auto text-[11px] leading-snug text-slate-500">{footnote}</p> : null}
    </Card>
  );
}

function KpiSkeleton({ label }) {
  return (
    <KpiShell icon={FileText} label={label}>
      <Skeleton className="h-7 w-28" />
      <div className="mt-2 h-4" />
    </KpiShell>
  );
}

/**
 * Top summary strip. Values respect whatever filters are active.
 *
 * "Hoy" and "Este mes" are shown as context rather than as the headline because
 * the SECOP II dataset is published with a lag of a day or more, so on many days
 * those legitimately read zero.
 */
export default function KpiCards({ summary, loading, vista }) {
  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiSkeleton label="Registros encontrados" />
        <KpiSkeleton label="Valor total" />
        <KpiSkeleton label="Entidad con mayor presupuesto" />
        <KpiSkeleton label="Departamento con más registros" />
      </div>
    );
  }

  const kpis = summary?.kpis;
  if (!kpis) return null;

  const entidad = kpis.entidadTop;
  const depto = kpis.departamentoTop;
  const esConvocados = vista?.tipoRegistro === 'convocados';
  const esMixto = vista?.tipoRegistro === 'todos';
  const sustantivo = esConvocados ? 'procesos' : esMixto ? 'registros' : 'contratos';
  const valorLabel = vista?.valorLabel ?? 'Valor del contrato';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiShell
        icon={FileText}
        label={esConvocados ? 'Procesos convocados' : esMixto ? 'Registros (ambas vistas)' : 'Contratos adjudicados'}
        accent="emerald"
        footnote={
          <>
            Hoy: <strong className="font-semibold text-slate-600">{formatNumber(kpis.contratosHoy)}</strong>
            {' · '}Este mes:{' '}
            <strong className="font-semibold text-slate-600">{formatNumber(kpis.contratosMes)}</strong>
            {' · '}Últimos 30 días:{' '}
            <strong className="font-semibold text-slate-600">{formatNumber(kpis.contratos30d)}</strong>
          </>
        }
      >
        <p className="tnum text-2xl font-bold text-slate-900 sm:text-3xl">{formatNumber(kpis.contratos)}</p>
      </KpiShell>

      <KpiShell
        icon={Banknote}
        label={valorLabel}
        accent="sky"
        footnote={
          <>
            Promedio: <strong className="font-semibold text-slate-600">{formatCOPCompact(kpis.valorPromedio)}</strong>
            {' · '}Mayor: <strong className="font-semibold text-slate-600">{formatCOPCompact(kpis.valorMaximo)}</strong>
          </>
        }
      >
        <p className="tnum text-2xl font-bold text-slate-900 sm:text-3xl" title={formatCOP(kpis.valorTotal)}>
          {formatCOPCompact(kpis.valorTotal)}
        </p>
      </KpiShell>

      <KpiShell
        icon={Building2}
        label="Entidad con mayor presupuesto"
        accent="amber"
        footnote={
          entidad ? (
            <>
              {formatCOPCompact(entidad.valor)} en {formatNumber(entidad.contratos)} {sustantivo}
            </>
          ) : (
            'Sin datos para el filtro actual'
          )
        }
      >
        <p className="line-clamp-2 text-sm leading-snug font-semibold text-slate-900" title={entidad?.nombre}>
          {entidad?.nombre ?? '—'}
        </p>
      </KpiShell>

      <KpiShell
        icon={MapPin}
        label="Departamento con más registros"
        accent="rose"
        footnote={
          depto ? (
            <>
              {formatNumber(depto.contratos)} {sustantivo} · {formatCOPCompact(depto.valor)}
            </>
          ) : (
            'Sin datos para el filtro actual'
          )
        }
      >
        <p className="line-clamp-2 text-sm leading-snug font-semibold text-slate-900" title={depto?.nombre}>
          {depto?.nombre ?? '—'}
        </p>
      </KpiShell>
    </div>
  );
}

/** Secondary strip: the two figures the brief calls out as separate concerns. */
export function KpiSecondary({ summary, vista }) {
  const kpis = summary?.kpis;
  if (!kpis) return null;
  const valorLabel = vista?.valorLabel ?? 'Valor del contrato';
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card className="flex items-center gap-3 px-4 py-3">
        <CalendarClock className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Valor último mes</p>
          <p className="tnum text-sm font-bold text-slate-900">{formatCOPCompact(kpis.valorMes)}</p>
        </div>
      </Card>
      <Card className="flex items-center gap-3 px-4 py-3">
        <TrendingUp className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Valor últimos 30 días</p>
          <p className="tnum text-sm font-bold text-slate-900">{formatCOPCompact(kpis.valor30d)}</p>
        </div>
      </Card>
      <Card className="flex items-center gap-3 px-4 py-3">
        <FileText className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase truncate">
            {valorLabel} promedio
          </p>
          <p className="tnum text-sm font-bold text-slate-900">{formatCOPCompact(kpis.valorPromedio)}</p>
        </div>
      </Card>
      <Card className="flex items-center gap-3 px-4 py-3">
        <Banknote className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase truncate">
            Mayor {valorLabel.toLowerCase()}
          </p>
          <p className="tnum text-sm font-bold text-slate-900">{formatCOPCompact(kpis.valorMaximo)}</p>
        </div>
      </Card>
    </div>
  );
}
