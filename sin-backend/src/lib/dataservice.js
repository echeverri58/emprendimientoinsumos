/**
 * Capa de datos de la VERSIÓN SIN BACKEND.
 *
 * Hace en el navegador lo que antes hacía `server/services/contracts.js`: consulta
 * Socrata directo (CORS), normaliza, fusiona las dos vistas y calcula KPIs, series,
 * facetas y exportación **en memoria**. No hay agregaciones SoQL por separado: se
 * materializa el conjunto filtrado y se calcula todo en JavaScript, que es el
 * enfoque más simple y robusto para un cliente.
 */
import { config } from '../config.js';
import { buildWhere, clampWindow, SCOPE_MAX_WINDOW_DAYS } from './soql.js';
import { CATEGORY_GROUPS, CODE_INDEX, normalizeCode } from './catalog.js';
import { sourcesFor, singleSourceFor, SOURCE_LIST } from './sources.js';
import { normalizeListItem, normalizeDetail } from './normalize.js';
import { socrataQuery } from './socrata.js';
import { TtlCache } from './cache.js';
import { addDaysISO, formatPeriodLabel, monthStartISO, todayISO } from './dates.js';

const materialCache = new TtlCache({ maxEntries: 80 });
const facetCache = new TtlCache({ maxEntries: 12 });

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Ajusta la ventana al tope del modo (el servidor ya no está para recortarla). */
function resolveFilters(filters) {
  const cap = SCOPE_MAX_WINDOW_DAYS[filters.scope] ?? config.query.maxWindowDays;
  const { from, to, clamped, maxDays } = clampWindow({
    from: filters.from,
    to: filters.to,
    maxDays: cap,
  });
  return { ...filters, from, to, windowClamped: clamped, scopeMaxWindowDays: maxDays };
}

function orderFor(filters, source) {
  const field = source.sortable[filters.sort] ?? source.sortable[source.defaultSort];
  return `${field} ${filters.dir}, ${source.tieBreakField} asc`;
}

/** Clave estable para cachear el conjunto materializado (sin página ni tamaño). */
function filterKey(filters) {
  const keys = [
    'from', 'to', 'dateField', 'scope', 'tipoRegistro', 'groups', 'extraKeywords',
    'includeOptionalKeywords', 'departamentos', 'ciudades', 'estados', 'modalidades',
    'minValor', 'maxValor', 'q', 'sort', 'dir',
  ];
  return keys
    .map((k) => `${k}=${Array.isArray(filters[k]) ? [...filters[k]].sort().join('|') : filters[k] ?? ''}`)
    .join('&');
}

function describeFilters(filters) {
  return {
    from: filters.from,
    to: filters.to,
    windowClamped: Boolean(filters.windowClamped),
    scopeMaxWindowDays: filters.scopeMaxWindowDays,
    dateField: filters.dateField,
    scope: filters.scope,
    tipoRegistro: filters.tipoRegistro,
  };
}

// ---------------------------------------------------------------------------
// Materialización (traer todas las filas que cumplen el filtro)
// ---------------------------------------------------------------------------

async function fetchAllForSource(filters, source, { maxRows = config.query.mergeCapPerSource } = {}) {
  const where = buildWhere(filters, source);
  const order = orderFor(filters, source);
  const pageSize = config.socrata.pageSize;
  const collected = [];
  let truncated = false;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const limit = Math.min(pageSize, maxRows - offset);
    const page = await socrataQuery(
      { select: source.listFields.join(','), where, order, limit, offset },
      { dataset: source.dataset, ttlMs: config.cache.searchTtlMs },
    );
    collected.push(...page.map((raw) => normalizeListItem(raw, source)));
    if (page.length < limit) break;
    if (offset + limit >= maxRows) truncated = true;
  }

  return { rows: collected, truncated };
}

async function materialize(filters) {
  const key = `m:${filterKey(filters)}`;
  const { value } = await materialCache.getOrSet(key, config.cache.searchTtlMs, async () => {
    const sources = sourcesFor(filters.tipoRegistro);
    const parts = await Promise.all(sources.map((source) => fetchAllForSource(filters, source)));
    return { rows: parts.flatMap((p) => p.rows), truncated: parts.some((p) => p.truncated) };
  });
  return value;
}

// ---------------------------------------------------------------------------
// Ordenación y agregación en memoria
// ---------------------------------------------------------------------------

function sortValue(row, sortKey) {
  switch (sortKey) {
    case 'valor_del_contrato': return row.valores?.contrato ?? 0;
    case 'nombre_entidad': return row.entidad?.nombre ?? '';
    case 'proveedor_adjudicado': return row.proveedor?.nombre ?? '';
    case 'estado_contrato': return row.estado?.raw ?? '';
    case 'modalidad_de_contratacion': return row.modalidad ?? '';
    case 'departamento': return row.entidad?.departamento ?? '';
    case 'ultima_actualizacion': return row.ultimaActualizacion ?? '';
    case 'fecha_de_inicio_del_contrato': return row.fechaInicio ?? row.fechaFirma ?? '';
    case 'fecha_de_firma':
    default: return row.fechaFirma ?? '';
  }
}

function sortRows(rows, filters) {
  const dir = filters.dir === 'asc' ? 1 : -1;
  const key = filters.sort;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb), 'es');
    if (cmp !== 0) return cmp * dir;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

function aggregateRows(rows) {
  let valorTotal = 0;
  let valorMaximo = 0;
  for (const row of rows) {
    const v = row.valores?.contrato ?? 0;
    valorTotal += v;
    if (v > valorMaximo) valorMaximo = v;
  }
  return {
    contratos: rows.length,
    valorTotal,
    valorPromedio: rows.length ? valorTotal / rows.length : 0,
    valorMaximo,
  };
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

export async function searchContracts(filters) {
  const resolved = resolveFilters(filters);
  const { rows, truncated } = await materialize(resolved);
  const sorted = sortRows(rows, resolved);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / resolved.pageSize));
  const page = Math.min(resolved.page, totalPages);
  const offset = (page - 1) * resolved.pageSize;
  const sources = sourcesFor(resolved.tipoRegistro);

  return {
    rows: sorted.slice(offset, offset + resolved.pageSize),
    page,
    pageSize: resolved.pageSize,
    total,
    totalPages,
    aggregates: aggregateRows(sorted),
    meta: {
      cached: false,
      truncated,
      mergeCap: config.query.mergeCapPerSource,
      merged: sources.length > 1,
      sources: sources.map((s) => ({ key: s.key, dataset: s.dataset, label: s.label, valorLabel: s.valorLabel })),
      fetchedAt: new Date().toISOString(),
    },
    query: { where: null, filters: describeFilters(resolved) },
  };
}

// ---------------------------------------------------------------------------
// Resumen (KPIs + series)
// ---------------------------------------------------------------------------

function countBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    if (k === null || k === undefined || k === '') continue;
    const prev = map.get(k) ?? { contratos: 0, valor: 0 };
    prev.contratos += 1;
    prev.valor += row.valores?.contrato ?? 0;
    map.set(k, prev);
  }
  return map;
}

const top = (map, n, by) =>
  [...map.entries()]
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b[by] - a[by])
    .slice(0, n);

function inRange(row, fromISO, toISO) {
  const d = row.fechaFirma ? String(row.fechaFirma).slice(0, 10) : null;
  return d && d >= fromISO && d <= toISO;
}

function buildSummaryFromRows(rows, resolved) {
  const valor = (row) => row.valores?.contrato ?? 0;
  const today = todayISO();
  const sumar = (fromISO, toISO) => {
    const subset = rows.filter((r) => inRange(r, fromISO, toISO));
    return { n: subset.length, valor: subset.reduce((acc, r) => acc + valor(r), 0) };
  };

  const entidadesMap = countBy(rows, (r) => r.entidad?.nombre);
  const deptosMap = countBy(rows, (r) => r.entidad?.departamento);
  const estadosMap = countBy(rows, (r) => r.estado?.raw);
  const modalidadesMap = countBy(rows, (r) => r.modalidad);
  const mesesMap = countBy(rows, (r) => (r.fechaFirma ? String(r.fechaFirma).slice(0, 7) : null));

  // Agrupar por categoría UNSPSC (4 grupos del catálogo + "otra").
  const categoriasPorGrupo = new Map(CATEGORY_GROUPS.map((g) => [g.id, { id: g.id, label: g.label, contratos: 0, valor: 0 }]));
  for (const row of rows) {
    const groupId = row.categoria?.groupId ?? 'otro';
    if (!categoriasPorGrupo.has(groupId)) {
      categoriasPorGrupo.set(groupId, { id: groupId, label: 'Otra / no clasificada', contratos: 0, valor: 0 });
    }
    const bucket = categoriasPorGrupo.get(groupId);
    bucket.contratos += 1;
    bucket.valor += valor(row);
  }

  const totals = aggregateRows(rows);
  const entidadTop = top(entidadesMap, 1, 'valor')[0];
  const deptoTop = top(deptosMap, 1, 'contratos')[0];

  const source = singleSourceFor(resolved.tipoRegistro);

  return {
    kpis: {
      contratos: totals.contratos,
      valorTotal: totals.valorTotal,
      valorPromedio: totals.valorPromedio,
      valorMaximo: totals.valorMaximo,
      contratosHoy: sumar(today, today).n,
      valorHoy: sumar(today, today).valor,
      contratosMes: sumar(monthStartISO(), today).n,
      valorMes: sumar(monthStartISO(), today).valor,
      contratos30d: sumar(addDaysISO(today, -29), today).n,
      valor30d: sumar(addDaysISO(today, -29), today).valor,
      entidadTop: entidadTop
        ? { nombre: entidadTop.nombre, contratos: entidadTop.contratos, valor: entidadTop.valor }
        : null,
      departamentoTop: deptoTop
        ? { nombre: deptoTop.nombre, contratos: deptoTop.contratos, valor: deptoTop.valor }
        : null,
    },
    series: {
      porMes: [...mesesMap.entries()]
        .map(([periodo, v]) => ({
          periodo,
          label: formatPeriodLabel(periodo),
          contratos: v.contratos,
          valor: v.valor,
        }))
        .sort((a, b) => a.periodo.localeCompare(b.periodo)),
      porEstado: [...estadosMap.entries()].map(([estado, v]) => ({ estado: estado ?? 'Sin estado', ...v })),
      porCategoria: [...categoriasPorGrupo.values()].filter((g) => g.contratos > 0),
      porModalidad: [...modalidadesMap.entries()].map(([modalidad, v]) => ({ modalidad: modalidad ?? 'No definida', ...v })),
      topEntidades: top(entidadesMap, 10, 'valor').map((e) => ({ nombre: e.nombre ?? 'Sin entidad', contratos: e.contratos, valor: e.valor })),
      topDepartamentos: top(deptosMap, 12, 'contratos').map((d) => ({ nombre: d.nombre ?? 'No Definido', contratos: d.contratos, valor: d.valor })),
    },
    tipoRegistro: resolved.tipoRegistro,
    valorLabel: source ? source.valorLabel : 'Valor',
    dateLabel: source ? source.dateLabel : null,
    source: source ? { key: source.key, dataset: source.dataset, label: source.label } : null,
    meta: { fetchedAt: new Date().toISOString(), merged: sourcesFor(resolved.tipoRegistro).length > 1 },
  };
}

export async function getSummary(filters) {
  const resolved = resolveFilters(filters);
  const { rows } = await materialize(resolved);
  const payload = buildSummaryFromRows(rows, resolved);
  return { ...payload, query: { where: null, filters: describeFilters(resolved) } };
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

export async function getContract(id, tipoRegistro = 'todos') {
  const safe = String(id).replace(/'/g, "''");
  const sources = sourcesFor(tipoRegistro);
  for (const source of sources) {
    const rows = await socrataQuery(
      { select: source.detailFields.join(','), where: `${source.idField} = '${safe}'`, limit: 1 },
      { dataset: source.dataset, ttlMs: config.cache.summaryTtlMs },
    );
    if (rows.length) return { contract: normalizeDetail(rows[0], source), meta: { source: source.key } };
  }
  return { contract: null, meta: {} };
}

// ---------------------------------------------------------------------------
// Facetas y ciudades
// ---------------------------------------------------------------------------

function facetFilters(tipoRegistro) {
  const today = todayISO();
  return {
    from: addDaysISO(today, -config.query.facetWindowDays),
    to: today,
    dateField: 'fecha_de_firma',
    scope: 'strict',
    tipoRegistro,
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

async function materializeFacets(tipoRegistro) {
  const key = `facetrows:${tipoRegistro}`;
  const { value } = await facetCache.getOrSet(key, config.cache.facetsTtlMs, async () => {
    const filters = resolveFilters(facetFilters(tipoRegistro));
    const sources = sourcesFor(tipoRegistro);
    const parts = await Promise.all(sources.map((source) => fetchAllForSource(filters, source)));
    return { rows: parts.flatMap((p) => p.rows) };
  });
  return value;
}

function countDistinct(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const value = keyFn(row);
    if (!value) continue;
    const prev = map.get(value) ?? { value, contratos: 0, valorTotal: 0 };
    prev.contratos += 1;
    prev.valorTotal += row.valores?.contrato ?? 0;
    map.set(value, prev);
  }
  return [...map.values()].sort((a, b) => b.contratos - a.contratos).slice(0, 200);
}

function mergeOptions(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const option of list ?? []) {
      const prev = map.get(option.value) ?? { value: option.value, contratos: 0, valorTotal: 0 };
      prev.contratos += option.contratos ?? 0;
      prev.valorTotal += option.valorTotal ?? 0;
      map.set(option.value, prev);
    }
  }
  return [...map.values()].sort((a, b) => b.contratos - a.contratos);
}

export async function getMetaOptions(tipoRegistro = 'adjudicados') {
  const key = `facets:${tipoRegistro}`;
  const { value } = await facetCache.getOrSet(key, config.cache.facetsTtlMs, async () => {
    const sources = sourcesFor(tipoRegistro);
    const { rows } = await materializeFacets(tipoRegistro);

    const porFuente = {};
    for (const source of sources) {
      const subset = rows.filter((r) => r.tipoRegistro === source.tipoRegistro);
      porFuente[source.key] = {
        departamentos: countDistinct(subset, (r) => r.entidad?.departamento),
        estados: countDistinct(subset, (r) => r.estado?.raw),
        modalidades: countDistinct(subset, (r) => r.modalidad),
      };
    }

    const unir = (campo) => mergeOptions(sources.map((s) => porFuente[s.key][campo]));
    return {
      departamentos: unir('departamentos'),
      estados: unir('estados'),
      modalidades: unir('modalidades'),
      porFuente,
      fuentes: sources.map((s) => s.key),
      windowDays: config.query.facetWindowDays,
      generatedAt: new Date().toISOString(),
    };
  });
  return value;
}

export async function getCiudades(departamento, tipoRegistro = 'adjudicados') {
  const { rows } = await materializeFacets(tipoRegistro);
  const subset = departamento ? rows.filter((r) => r.entidad?.departamento === departamento) : rows;
  return countDistinct(subset, (r) => r.entidad?.ciudad);
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

export async function fetchAllForExport(filters) {
  const resolved = resolveFilters(filters);
  const { rows, truncated } = await materialize(resolved);
  const sorted = sortRows(rows, resolved).slice(0, config.query.exportMaxRows);
  return { rows: sorted, truncated: truncated || rows.length > config.query.exportMaxRows, total: sorted.length };
}
