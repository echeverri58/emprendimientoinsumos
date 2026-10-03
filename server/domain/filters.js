import { config } from '../config.js';
import { SCOPE_MAX_WINDOW_DAYS, SCOPES, clampWindow, resolveCodes, resolveKeywords } from './soql.js';
import { SOURCE_LIST, TIPOS_REGISTRO } from './sources.js';
import { SORTABLE, normalizeCode } from './catalog.js';
import { isISODate } from '../lib/dates.js';

/**
 * Columnas de ordenación válidas: la UNIÓN de las de ambas vistas, porque el
 * cliente envía nombres lógicos (`fecha_de_firma`) que cada fuente traduce a su
 * propia columna física (`fecha_de_publicacion_del` en procesos).
 */
const SORTABLE_KEYS = new Set([
  ...Object.keys(SORTABLE),
  ...SOURCE_LIST.flatMap((source) => Object.keys(source.sortable)),
]);

/**
 * @typedef {object} ContractFilters
 * @property {string} from                `YYYY-MM-DD`
 * @property {string} to                  `YYYY-MM-DD`
 * @property {boolean} windowClamped      true si el rango pedido se recortó
 * @property {number} scopeMaxWindowDays  tope de ventana del modo elegido
 * @property {'fecha_de_firma'|'ultima_actualizacion'} dateField
 * @property {'strict'|'category'|'keyword'} scope
 * @property {string[]} groups            UNSPSC group ids
 * @property {string[]} codes             explicit 8-digit codes (overrides groups)
 * @property {string[]} keywords          explicit keywords (overrides defaults)
 * @property {string[]} extraKeywords     keywords añadidas a las obligatorias
 * @property {boolean} includeOptionalKeywords
 * @property {string[]} departamentos
 * @property {string[]} ciudades
 * @property {string[]} estados
 * @property {string[]} modalidades
 * @property {string[]} sectores
 * @property {string[]} tiposContrato
 * @property {number|null} minValor
 * @property {number|null} maxValor
 * @property {string} q
 * @property {string} sort
 * @property {'asc'|'desc'} dir
 * @property {number} page
 * @property {number} pageSize
 */

/** Read a repeatable parameter as either `a=1&a=2` or `a=1,2`. */
function listParam(value) {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

function numberParam(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function intParam(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Validate and normalise raw query-string input into a typed filter object.
 * @param {Record<string, unknown>} query
 * @returns {ContractFilters}
 */
export function parseFilters(query = {}) {
  // The scope has to be resolved before clamping, because each mode has its own
  // measured ceiling on how wide a window Socrata can answer in time.
  const scopeRaw = String(query.scope || 'strict').toLowerCase();
  const scope = /** @type {any} */ (SCOPES.includes(scopeRaw) ? scopeRaw : 'strict');
  const scopeMaxWindowDays = SCOPE_MAX_WINDOW_DAYS[scope] ?? config.query.maxWindowDays;

  const window = clampWindow({
    from: /** @type {string} */ (query.from),
    to: /** @type {string} */ (query.to),
    maxDays: scopeMaxWindowDays,
  });

  const sortRaw = String(query.sort || 'fecha_de_firma');
  const sort = SORTABLE_KEYS.has(sortRaw) ? sortRaw : 'fecha_de_firma';
  const dir = String(query.dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const tipoRegistroRaw = String(query.tipoRegistro || 'adjudicados').toLowerCase();
  const tipoRegistro = /** @type {any} */ (
    TIPOS_REGISTRO.includes(tipoRegistroRaw) ? tipoRegistroRaw : 'adjudicados'
  );

  const codes = listParam(query.codes).map((c) => normalizeCode(c)).filter(Boolean);

  return {
    from: window.from,
    to: window.to,
    windowClamped: window.clamped,
    scopeMaxWindowDays: window.maxDays,
    dateField: query.dateField === 'ultima_actualizacion' ? 'ultima_actualizacion' : 'fecha_de_firma',
    scope,
    tipoRegistro,
    groups: listParam(query.groups),
    codes,
    keywords: listParam(query.keywords),
    extraKeywords: listParam(query.extraKeywords),
    includeOptionalKeywords: String(query.optionalKeywords || '') === 'true',
    departamentos: listParam(query.departamento),
    ciudades: listParam(query.ciudad),
    estados: listParam(query.estado),
    modalidades: listParam(query.modalidad),
    sectores: listParam(query.sector),
    tiposContrato: listParam(query.tipoContrato),
    minValor: numberParam(query.minValor),
    maxValor: numberParam(query.maxValor),
    q: String(query.q || '').slice(0, 200),
    sort,
    dir,
    page: intParam(query.page, 1, 1, 10_000),
    pageSize: intParam(query.pageSize, config.query.defaultPageSize, 1, config.query.maxPageSize),
  };
}

/**
 * Stable cache key for a filter set. Excludes page/pageSize so that paging
 * through a result set reuses the expensive aggregate query.
 * @param {ContractFilters} filters
 * @param {{ includePaging?: boolean }} [options]
 */
export function filterCacheKey(filters, { includePaging = false } = {}) {
  const keys = [
    'from', 'to', 'dateField', 'scope', 'tipoRegistro', 'groups', 'codes', 'keywords', 'extraKeywords',
    'includeOptionalKeywords', 'departamentos', 'ciudades', 'estados',
    'modalidades', 'sectores', 'tiposContrato', 'minValor', 'maxValor', 'q',
    'sort', 'dir',
  ];  const parts = keys.map((k) => {
    const v = /** @type {any} */ (filters)[k];
    return `${k}=${Array.isArray(v) ? [...v].sort().join('|') : v}`;
  });
  if (includePaging) parts.push(`page=${filters.page}`, `pageSize=${filters.pageSize}`);
  return parts.join('&');
}

/**
 * Human-readable echo of what the server actually queried, surfaced in the UI so
 * analysts can audit the filter that produced a result set.
 * @param {ContractFilters} filters
 */
export function describeFilters(filters) {
  const codes = resolveCodes(filters);
  const keywords = resolveKeywords(filters);
  return {
    from: filters.from,
    to: filters.to,
    windowClamped: Boolean(filters.windowClamped),
    scopeMaxWindowDays: filters.scopeMaxWindowDays,
    dateField: filters.dateField,
    scope: filters.scope,
    tipoRegistro: filters.tipoRegistro,
    codes,
    keywordCount: keywords.length,
    keywordsPreview: keywords.slice(0, 4),
    departamentos: filters.departamentos,
    ciudades: filters.ciudades,
    estados: filters.estados,
    modalidades: filters.modalidades,
    minValor: filters.minValor,
    maxValor: filters.maxValor,
    q: filters.q,
    sort: filters.sort,
    dir: filters.dir,
  };
}

export { isISODate };
