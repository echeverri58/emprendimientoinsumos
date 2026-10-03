import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import Header from './components/Header.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import KpiCards, { KpiSecondary } from './components/KpiCards.jsx';
import ContractsTable from './components/ContractsTable.jsx';
import ContractDetailDrawer from './components/ContractDetailDrawer.jsx';
import ExportButtons from './components/ExportButtons.jsx';
import { Button, Card, ErrorState, Skeleton } from './components/ui/index.jsx';
import { api } from './lib/api.js';
import { useApiResource, useDebounced } from './hooks/useApiResource.js';
import { countActiveFilters, defaultFilters, describeRange, toParams } from './lib/filters.js';
import { formatDate, formatNumber } from './lib/format.js';

// Recharts is by far the heaviest dependency, so the chart block is loaded on
// demand: the KPI strip and the contract table become interactive first.
const ChartsPanel = lazy(() => import('./components/ChartsPanel.jsx'));

function ChartsFallback() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <Skeleton className="mb-3 h-4 w-40" />
          <Skeleton className="h-[240px] w-full" />
        </Card>
        <Card className="p-4">
          <Skeleton className="mb-3 h-4 w-48" />
          <Skeleton className="h-[190px] w-full" />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <Skeleton className="mb-3 h-4 w-56" />
          <Skeleton className="h-[250px] w-full" />
        </Card>
        <Card className="p-4">
          <Skeleton className="mb-3 h-4 w-44" />
          <Skeleton className="h-[250px] w-full" />
        </Card>
      </div>
    </div>
  );
}

const SCOPE_LABELS = {
  strict: 'Estricto (UNSPSC + texto)',
  category: 'Solo categoría UNSPSC',
  keyword: 'Solo texto',
  broad: 'Amplio (UNSPSC o texto)',
};

export default function App() {
  const [filters, setFilters] = useState(defaultFilters);
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // The search box updates instantly for typing, but only the debounced value
  // reaches the API so we do not fire a request per keystroke.
  const debouncedQ = useDebounced(filters.q, 450);
  const queryFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const contractParams = useMemo(() => toParams(queryFilters).toString(), [queryFilters]);
  const summaryParams = useMemo(
    () => toParams(queryFilters, { includePaging: false }).toString(),
    [queryFilters],
  );
  const departamentoKey = filters.departamentos.join(',');

  const health = useApiResource((signal) => api.health(signal).catch(() => null), []);
  // Las opciones de los filtros dependen de la vista activa: los estados de un
  // contrato («En ejecución») no tienen nada que ver con los de un proceso
  // («Publicado»), así que se vuelven a pedir al cambiar de tipo de registro.
  const meta = useApiResource((signal) => api.meta(filters.tipoRegistro, signal), [filters.tipoRegistro]);
  const summary = useApiResource((signal) => api.summary(queryFilters, signal), [summaryParams]);
  const contracts = useApiResource((signal) => api.contracts(queryFilters, signal), [contractParams]);

  // Cities are fetched per selected department and merged, so the list stays
  // complete when the user picks more than one department.
  const ciudades = useApiResource(
    async (signal) => {
      if (filters.departamentos.length === 0) {
        return api.ciudades(null, filters.tipoRegistro, signal);
      }
      const responses = await Promise.all(
        filters.departamentos.map((d) => api.ciudades(d, filters.tipoRegistro, signal)),
      );
      const merged = new Map();
      for (const response of responses) {
        for (const ciudad of response.ciudades ?? []) {
          merged.set(ciudad.value, (merged.get(ciudad.value) ?? 0) + ciudad.contratos);
        }
      }
      return {
        ciudades: [...merged.entries()]
          .map(([value, count]) => ({ value, contratos: count }))
          .sort((a, b) => b.contratos - a.contratos),
      };
    },
    [departamentoKey, filters.tipoRegistro],
  );

  /** Etiquetas de la vista activa: «Valor del contrato» no significa lo mismo que «Precio base». */
  const vista = useMemo(() => {
    if (filters.tipoRegistro === 'todos') {
      return {
        tipoRegistro: 'todos',
        valorLabel: 'Valor',
        dateLabel: 'Fecha',
        descripcion: 'Contratos adjudicados y procesos convocados',
      };
    }
    const info = (meta.data?.tiposRegistro ?? []).find((t) =>
      filters.tipoRegistro === 'convocados' ? t.key === 'procesos' : t.key === 'contratos',
    );
    return {
      tipoRegistro: filters.tipoRegistro,
      valorLabel: info?.valorLabel ?? 'Valor',
      dateLabel: info?.dateLabel ?? 'Fecha',
      descripcion: info?.label ?? '',
    };
  }, [meta.data, filters.tipoRegistro]);

  const patchFilters = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleClear = useCallback(() => {
    setFilters(defaultFilters());
    setSelected(null);
  }, []);

  const refreshAll = useCallback(() => {
    health.reload();
    meta.reload();
    summary.reload();
    contracts.reload();
    ciudades.reload();
  }, [health, meta, summary, contracts, ciudades]);

  const handleSort = useCallback(
    (sort, dir) => patchFilters({ sort, dir, page: 1 }),
    [patchFilters],
  );

  const handlePage = useCallback((page) => patchFilters({ page }), [patchFilters]);
  const handlePageSize = useCallback((pageSize) => patchFilters({ pageSize, page: 1 }), [patchFilters]);

  // Close the mobile filter sheet when switching to a wide viewport.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (event) => {
      if (event.matches) setShowFilters(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const activeCount = countActiveFilters(filters);
  const loading = contracts.loading || summary.loading;
  const total = contracts.data?.total ?? 0;

  const filterPanelProps = {
    filters,
    onChange: patchFilters,
    meta: meta.data,
    ciudades: ciudades.data?.ciudades ?? [],
    loadingCiudades: ciudades.loading,
    onClear: handleClear,
  };

  return (
    <div className="min-h-screen">
      <Header health={{ ...health.data, generatedAt: summary.data?.meta?.fetchedAt }} loading={loading} onRefresh={refreshAll} />

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {/* Report header used only by the print / "save as PDF" path. */}
        <div className="mb-6 hidden print:block">
          <h1 className="text-lg font-bold text-slate-900">
            Reporte de contratos de dotación, vestuario, calzado, insumos y EPP
          </h1>
          <p className="mt-1 text-xs text-slate-600">
            Fuente: SECOP II · Datos Abiertos Colombia · vista jbjy-vk9h · Fecha del reporte:{' '}
            {formatDate(new Date().toISOString())}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Rango: {filters.from} a {filters.to} · Regla: {SCOPE_LABELS[filters.scope]} · Contratos:{' '}
            {formatNumber(total)}
          </p>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Desktop filter sidebar */}
          <div className="no-print sticky top-4 hidden h-fit w-72 shrink-0 lg:block">
            <FilterPanel {...filterPanelProps} />
          </div>

          <div className="min-w-0 flex-1 space-y-5">
            {summary.error ? (
              <ErrorState
                error={summary.error}
                onRetry={() => {
                  summary.reload();
                  contracts.reload();
                }}
              />
            ) : null}

            {/* El servidor recorta la ventana cuando el modo elegido no puede
                abarcar el rango pedido; conviene decirlo en voz alta. */}
            {contracts.data?.query?.filters?.windowClamped ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900">El rango de fechas se recortó automáticamente</p>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-800">
                  El modo «{SCOPE_LABELS[contracts.data.query.filters.scope] ?? filters.scope}» admite como máximo{' '}
                  {formatNumber(contracts.data.query.filters.scopeMaxWindowDays)} días, así que la consulta se hizo
                  del <strong className="font-semibold">{contracts.data.query.filters.from}</strong> al{' '}
                  <strong className="font-semibold">{contracts.data.query.filters.to}</strong>. Elija «Estricto» o
                  «Solo categoría» para abarcar los 2 años completos.
                </p>
              </div>
            ) : null}

            <KpiCards summary={summary.data} loading={summary.loading} vista={vista} />
            <KpiSecondary summary={summary.data} vista={vista} />

            <div className="no-print">
              <Suspense fallback={<ChartsFallback />}>
                <ChartsPanel summary={summary.data} loading={summary.loading} />
              </Suspense>
            </div>

            <ContractsTable
              data={contracts.data}
              loading={contracts.loading}
              error={contracts.error}
              filters={filters}
              vista={vista}
              onSort={handleSort}
              onPage={handlePage}
              onPageSize={handlePageSize}
              onOpenDetail={setSelected}
              onRetry={contracts.reload}
              onClearFilters={handleClear}
              toolbar={<ExportButtons filters={queryFilters} total={total} />}
            />

            <p className="pb-4 text-center text-[11px] text-slate-400">
              Datos publicados por las entidades en SECOP II y servidos a través del portal Datos Abiertos
              Colombia. El dataset se actualiza con retraso respecto a la fecha actual, por lo que los conteos de
              «hoy» pueden ser cero.
            </p>
          </div>
        </div>
      </main>

      {/* Mobile filter trigger */}
      <button
        type="button"
        onClick={() => setShowFilters(true)}
        className="no-print fixed bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xl transition-colors hover:bg-slate-800 lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filtros
        {activeCount > 0 ? (
          <span className="tnum rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold">{activeCount}</span>
        ) : null}
      </button>

      {/* Mobile filter sheet */}
      {showFilters ? (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true">
          <div className="animate-fade absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
          <div className="animate-drawer scroll-slim relative ml-auto h-full w-full max-w-sm overflow-y-auto bg-slate-100 p-3 shadow-2xl">
            <div className="mb-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowFilters(false)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cerrar
              </Button>
            </div>
            <FilterPanel {...filterPanelProps} />
          </div>
        </div>
      ) : null}

      <ContractDetailDrawer contract={selected} onClose={() => setSelected(null)} />

      {/* Screen-reader-only context for the current range. */}
      <span className="sr-only" aria-live="polite">
        Mostrando {formatNumber(total)} contratos para el rango {describeRange(filters)}.
      </span>
    </div>
  );
}
