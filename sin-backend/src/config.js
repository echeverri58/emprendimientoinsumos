/**
 * Configuración de la VERSIÓN SIN BACKEND.
 *
 * Aquí NO se leen variables de entorno de Node: todo vive en el navegador. El app
 * token de Socrata es opcional y, en esta modalidad, queda visible en el código
 * (no es un secreto: identifica la aplicación para los límites de peticiones).
 * Puedes definirlo al compilar con la variable de Vite `VITE_SOCRATA_APP_TOKEN`.
 */
const appToken =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCRATA_APP_TOKEN) || '';

export const config = {
  socrata: {
    domain: 'https://www.datos.gov.co',
    appToken,
    timeoutMs: 45_000,
    retries: 1,
    pageSize: 5_000, // filas por petición al paginar
  },
  cache: {
    searchTtlMs: 3 * 60_000,
    summaryTtlMs: 10 * 60_000,
    facetsTtlMs: 6 * 60 * 60_000,
    maxEntries: 200,
  },
  query: {
    defaultWindowDays: 30,
    maxWindowDays: 730,
    defaultPageSize: 25,
    maxPageSize: 200,
    // Tope de filas que se traen por fuente antes de fusionar/exportar.
    mergeCapPerSource: 6_000,
    exportMaxRows: 6_000,
    facetWindowDays: 90,
  },
};
