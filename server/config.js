import process from 'node:process';

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 3001),

  socrata: {
    domain: process.env.SOCRATA_DOMAIN || 'https://www.datos.gov.co',
    dataset: process.env.SOCRATA_DATASET || 'jbjy-vk9h',
    // Optional. Raises Socrata's throttling limits substantially; strongly
    // recommended for production. Never exposed to the browser.
    appToken: process.env.SOCRATA_APP_TOKEN || '',
    // Worst-case wait for a user is timeout * (retries + 1) plus backoff.
    // Measured p100 on the strict filter is ~4s, so 30s is generous while still
    // surfacing throttling in about a minute instead of several.
    timeoutMs: num(process.env.SOCRATA_TIMEOUT_MS, 30_000),
    retries: num(process.env.SOCRATA_RETRIES, 1),
    pageSize: num(process.env.SOCRATA_PAGE_SIZE, 5000),
  },

  cache: {
    // Aggregations and pages are expensive (0.3s - 4s). Cache hard.
    searchTtlMs: num(process.env.CACHE_SEARCH_TTL_MS, 3 * 60_000),
    summaryTtlMs: num(process.env.CACHE_SUMMARY_TTL_MS, 10 * 60_000),
    facetsTtlMs: num(process.env.CACHE_FACETS_TTL_MS, 6 * 60 * 60_000),
    maxEntries: num(process.env.CACHE_MAX_ENTRIES, 300),
  },

  query: {
    // Ventana por defecto al cargar la app: 30 días para una primera carga ágil.
    // El tope máximo sigue siendo 2 años (730 días): el usuario puede ampliarlo
    // con los presets, pero el arranque no paga ese coste.
    defaultWindowDays: num(process.env.DEFAULT_WINDOW_DAYS, 30),
    maxWindowDays: num(process.env.MAX_WINDOW_DAYS, 730),
    defaultPageSize: num(process.env.DEFAULT_PAGE_SIZE, 25),
    maxPageSize: num(process.env.MAX_PAGE_SIZE, 200),
    // Cap on rows pulled for a CSV export.
    exportMaxRows: num(process.env.EXPORT_MAX_ROWS, 20_000),
    // Los desplegables de filtros se calculan sobre el mismo alcance de 2 años.
    // Los desplegables de filtros se calculan sobre 90 días: suficiente para que la
    // lista de departamentos/estados sea representativa sin pagar el coste de 2 años
    // (cada facet es un `group by` de varios segundos).
    facetWindowDays: num(process.env.FACET_WINDOW_DAYS, 90),
  },

  // Precalienta en segundo plano la consulta por defecto (resumen + primera
  // página). Con una ventana de 2 años la primera carga en frío cuesta varios
  // segundos, así que conviene tenerla en caché antes de que llegue el usuario.
  warmupOnStart: String(process.env.WARMUP_ON_START ?? 'true') !== 'false',

  isProduction: process.env.NODE_ENV === 'production',
  clientDist: 'client/dist',
};
