/**
 * Client-side filter model. Mirrors the server's `parseFilters` contract so the
 * two never drift: anything set here is a documented query parameter of
 * /api/contracts and /api/summary.
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

/** Local-time `YYYY-MM-DD` (the server resolves "today" in America/Bogota). */
export function isoLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoLocal(d);
}

/**
 * Rangos de fecha ofrecidos en el panel de filtros.
 *
 * El aplicativo trabaja únicamente con los contratos de los 2 últimos años, así
 * que no se ofrecen ventanas mayores: el servidor las recortaría igualmente.
 */
export const PRESETS = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: '90d', label: 'Últimos 90 días' },
  { id: 'mes', label: 'Mes actual' },
  { id: 'mesAnterior', label: 'Mes anterior' },
  { id: 'ytd', label: 'Año en curso' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: '24m', label: 'Últimos 2 años' },
  { id: 'custom', label: 'Rango personalizado' },
];

/** Ventana por defecto del aplicativo: últimos 30 días (carga inicial más rápida). */
export const DEFAULT_PRESET = '30d';

/** Días que cubre cada preset relativo, para el tope de 730 días del servidor. */
const PRESET_DAYS = {
  '7d': 6,
  '30d': 29,
  '90d': 89,
  '12m': 364,
  '24m': 729,
};

/**
 * Resolve a preset id into a concrete `{ from, to }` range.
 * @param {string} preset
 */
export function rangeForPreset(preset) {
  const today = isoLocal();
  const now = new Date(`${today}T12:00:00`);
  switch (preset) {
    case 'hoy':
      return { from: today, to: today };
    case 'mes':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'mesAnterior': {
      const firstOfThis = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastOfPrev = new Date(firstOfThis.getTime() - 86400000);
      const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);
      return { from: isoLocal(firstOfPrev), to: isoLocal(lastOfPrev) };
    }
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default: {
      const days = PRESET_DAYS[preset] ?? PRESET_DAYS['24m'];
      return { from: shiftDays(today, -days), to: today };
    }
  }
}

export function defaultFilters() {
  const range = rangeForPreset(DEFAULT_PRESET);
  return {
    preset: DEFAULT_PRESET,
    ...range,
    dateField: 'fecha_de_firma',
    scope: 'strict',
    // «Convocado» y «adjudicado» son dos vistas distintas de SECOP II, así que este
    // ajuste conmuta la fuente de datos, no filtra una columna.
    tipoRegistro: 'adjudicados',
    groups: [],
    extraKeywords: [],
    includeOptionalKeywords: false,
    departamentos: [],
    ciudades: [],
    estados: [],
    modalidades: [],
    minValor: null,
    maxValor: null,
    q: '',
    sort: 'fecha_de_firma',
    dir: 'desc',
    page: 1,
    pageSize: 25,
  };
}

/** Serialise filter state into API query parameters. */
export function toParams(filters, { includePaging = true } = {}) {
  const p = new URLSearchParams();
  p.set('from', filters.from);
  p.set('to', filters.to);
  if (filters.tipoRegistro !== 'adjudicados') p.set('tipoRegistro', filters.tipoRegistro);
  if (filters.dateField !== 'fecha_de_firma') p.set('dateField', filters.dateField);
  p.set('scope', filters.scope);
  if (filters.groups?.length) p.set('groups', filters.groups.join(','));
  if (filters.extraKeywords?.length) p.set('extraKeywords', filters.extraKeywords.join(','));
  if (filters.includeOptionalKeywords) p.set('optionalKeywords', 'true');
  if (filters.departamentos?.length) p.set('departamento', filters.departamentos.join(','));
  if (filters.ciudades?.length) p.set('ciudad', filters.ciudades.join(','));
  if (filters.estados?.length) p.set('estado', filters.estados.join(','));
  if (filters.modalidades?.length) p.set('modalidad', filters.modalidades.join(','));
  if (filters.minValor !== null && filters.minValor !== '' && Number.isFinite(Number(filters.minValor))) {
    p.set('minValor', String(Number(filters.minValor)));
  }
  if (filters.maxValor !== null && filters.maxValor !== '' && Number.isFinite(Number(filters.maxValor))) {
    p.set('maxValor', String(Number(filters.maxValor)));
  }
  if (filters.q) p.set('q', filters.q);
  p.set('sort', filters.sort);
  p.set('dir', filters.dir);
  if (includePaging) {
    p.set('page', String(filters.page));
    p.set('pageSize', String(filters.pageSize));
  }
  return p;
}

/**
 * Count the filters a user has actively narrowed, for the "N filtros activos"
 * badge. `sort`/`dir`/`page` are navigation, not narrowing, so they are excluded.
 */
export function countActiveFilters(filters) {
  let n = 0;
  if (filters.preset && filters.preset !== DEFAULT_PRESET) n += 1;
  if (filters.tipoRegistro !== 'adjudicados') n += 1;
  if (filters.scope !== 'strict') n += 1;
  if (filters.dateField !== 'fecha_de_firma') n += 1;
  if (filters.groups?.length) n += 1;
  if (filters.extraKeywords?.length) n += filters.extraKeywords.length;
  if (filters.includeOptionalKeywords) n += 1;
  if (filters.departamentos?.length) n += filters.departamentos.length;
  if (filters.ciudades?.length) n += filters.ciudades.length;
  if (filters.estados?.length) n += filters.estados.length;
  if (filters.modalidades?.length) n += filters.modalidades.length;
  if (filters.minValor !== null && filters.minValor !== '') n += 1;
  if (filters.maxValor !== null && filters.maxValor !== '') n += 1;
  if (filters.q) n += 1;
  return n;
}

/** Human summary of the active window, for the header subtitle. */
export function describeRange(filters) {
  const label = PRESETS.find((p) => p.id === filters.preset)?.label;
  if (label && filters.preset !== 'custom') return label;
  return `${filters.from} → ${filters.to}`;
}

/** Toggle a value inside one of the array-valued filters. */
export function toggleValue(list, value) {
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.indexOf(value);
  if (index === -1) next.push(value);
  else next.splice(index, 1);
  return next;
}

/** Días entre dos fechas `YYYY-MM-DD` (positivo si `to` es posterior). */
export function daysBetweenISO(from, to) {
  const a = Date.parse(`${from}T12:00:00`);
  const b = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Recorta un rango a `maxDays` conservando la fecha final.
 *
 * Cada modo de la regla de negocio tiene un tope medido de ventana (el modo de
 * solo texto no puede abarcar los 2 años), así que al cambiar de modo hay que
 * ajustar el rango en el cliente para que la interfaz siga coincidiendo con lo
 * que realmente se consulta, en lugar de dejar que el servidor lo recorte en
 * silencio.
 *
 * @returns {{ from: string, to: string, clamped: boolean }}
 */
export function clampRangeToDays(from, to, maxDays) {
  if (daysBetweenISO(from, to) <= maxDays) return { from, to, clamped: false };
  return { from: shiftDays(to, -maxDays), to, clamped: true };
}
