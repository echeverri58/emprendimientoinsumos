import { config } from '../config.js';
import { CATEGORY_GROUPS, CODE_INDEX, normalizeCode } from '../domain/catalog.js';
import { buildWhere, quote } from '../domain/soql.js';
import { describeFilters, filterCacheKey, parseFilters } from '../domain/filters.js';
import { SOURCES, singleSourceFor, sourcesFor } from '../domain/sources.js';
import { query } from '../socrata/client.js';
import { normalizeDetail, normalizeListItem, toNumber } from '../domain/normalize.js';
import { TtlCache, mapLimit } from '../lib/cache.js';
import { endOfDay, formatPeriodLabel, monthStartISO, startOfDay, todayISO } from '../lib/dates.js';

/** Composed results (a whole KPI bundle, one page of rows) are cached here. */
const resultCache = new TtlCache({ maxEntries: config.cache.maxEntries });

/**
 * Tope de filas que se materializan por fuente en el modo «todos».
 *
 * Los dos conjuntos no se pueden unir en una sola consulta SoQL, así que el modo
 * combinado trae ambos y los fusiona en memoria. Es viable porque con el filtro de
 * negocio a 2 años los volúmenes son modestos (≈1.400 contratos y ≈3.100 procesos),
 * pero se acota igualmente para que un filtro muy laxo no agote la memoria.
 */
const MERGE_CAP_PER_SOURCE = 6000;

// ---------------------------------------------------------------------------
// Utilidades por fuente
// ---------------------------------------------------------------------------

function orderFor(filters, source) {
  const field = source.sortable[filters.sort] ?? source.sortable[source.defaultSort];
  // El desempate hace que la paginación sea estable: sin él, las filas que
  // comparten fecha pueden repetirse o desaparecer entre páginas.
  return `${field} ${filters.dir}, ${source.tieBreakField} asc`;
}

function aggregateSelect(source) {
  return `count(1) as n, sum(${source.valorField}) as valor, avg(${source.valorField}) as promedio, max(${source.valorField}) as maximo`;
}

function aggregateRow(row) {
  return {
    contratos: toNumber(row?.n),
    valorTotal: toNumber(row?.valor),
    valorPromedio: toNumber(row?.promedio),
    valorMaximo: toNumber(row?.maximo),
  };
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

/**
 * Paged contract/process search plus a full-result aggregate.
 *
 * Con una sola fuente se pagina en SoQL (rápido y exacto). En el modo «todos» hay
 * que materializar ambos conjuntos y fusionarlos.
 *
 * @param {import('../domain/filters.js').ContractFilters} filters
 */
export async function searchContracts(filters) {
  const source = singleSourceFor(filters.tipoRegistro);
  if (source) return searchSingleSource(filters, source);

  const { rows, truncated } = await materialize(filters);
  const sorted = sortRows(rows, filters);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * filters.pageSize;

  return {
    rows: sorted.slice(offset, offset + filters.pageSize),
    page,
    pageSize: filters.pageSize,
    total,
    totalPages,
    aggregates: aggregateRows(sorted),
    // En el modo combinado no hay un único `where` de SoQL que mostrar: son dos
    // consultas distintas, una por vista.
    query: { where: null, filters: describeFilters(filters), merged: true },
    meta: {
      cached: false,
      ms: 0,
      truncated,
      mergeCap: MERGE_CAP_PER_SOURCE,
      merged: true,
      sources: sourcesFor(filters.tipoRegistro).map((s) => ({
        key: s.key,
        dataset: s.dataset,
        label: s.label,
        valorLabel: s.valorLabel,
      })),
      fetchedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {import('../domain/filters.js').ContractFilters} filters
 * @param {import('../domain/sources.js').SOURCES.contratos} source
 */
async function searchSingleSource(filters, source) {
  const where = buildWhere(filters, source);
  const key = filterCacheKey(filters);
  const offset = (filters.page - 1) * filters.pageSize;

  const [aggregate, page] = await Promise.all([
    resultCache.getOrSet(`search:agg:${source.key}:${key}`, config.cache.searchTtlMs, async () => {
      const { rows, cached, ms } = await query(
        { select: aggregateSelect(source), where, limit: 1 },
        { dataset: source.dataset },
      );
      return { ...aggregateRow(rows[0]), cached, ms };
    }),
    resultCache.getOrSet(`search:page:${source.key}:${filterCacheKey(filters, { includePaging: true })}`, config.cache.searchTtlMs, async () => {
      const { rows, cached, ms } = await query(
        {
          select: source.listFields.join(','),
          where,
          order: orderFor(filters, source),
          limit: filters.pageSize,
          offset,
        },
        { dataset: source.dataset },
      );
      return { rows: rows.map((raw) => normalizeListItem(raw, source)), cached, ms };
    }),
  ]);

  const total = aggregate.value.contratos;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

  return {
    rows: page.value.rows,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages,
    aggregates: {
      contratos: aggregate.value.contratos,
      valorTotal: aggregate.value.valorTotal,
      valorPromedio: aggregate.value.valorPromedio,
      valorMaximo: aggregate.value.valorMaximo,
    },
    query: { where, filters: describeFilters(filters) },
    meta: {
      cached: aggregate.cached && page.cached,
      ms: Math.max(aggregate.value.ms, page.value.ms),
      source: { key: source.key, dataset: source.dataset, label: source.label, valorLabel: source.valorLabel },
      fetchedAt: new Date().toISOString(),
    },
  };
}

/**
 * Trae TODAS las filas que cumplen el filtro en una fuente, paginando en SoQL.
 * @param {import('../domain/filters.js').ContractFilters} filters
 * @param {import('../domain/sources.js').SOURCES.contratos} source
 */
async function fetchAllForSource(filters, source, { maxRows = MERGE_CAP_PER_SOURCE } = {}) {
  const where = buildWhere(filters, source);
  const order = orderFor(filters, source);
  const pageSize = config.socrata.pageSize;
  const collected = [];
  let truncated = false;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const limit = Math.min(pageSize, maxRows - offset);
    const { rows } = await query(
      { select: source.listFields.join(','), where, order, limit, offset },
      { ttlMs: config.cache.searchTtlMs, dataset: source.dataset },
    );
    collected.push(...rows.map((raw) => normalizeListItem(raw, source)));
    if (rows.length < limit) break;
    if (offset + limit >= maxRows) truncated = true;
  }

  return { rows: collected, truncated };
}

/** Materializa y fusiona ambas fuentes. El resultado se cachea por filtro. */
async function materialize(filters) {
  const key = `merge:${filterCacheKey(filters)}`;
  const { value } = await resultCache.getOrSet(key, config.cache.searchTtlMs, async () => {
    const sources = sourcesFor(filters.tipoRegistro);
    const parts = await mapLimit(
      sources.map((source) => () => fetchAllForSource(filters, source)),
      2,
    );
    return {
      rows: parts.flatMap((part) => part.rows),
      truncated: parts.some((part) => part.truncated),
    };
  });
  return value;
}

// ---------------------------------------------------------------------------
// Ordenación y agregación en memoria (solo para el modo «todos»)
// ---------------------------------------------------------------------------

/** Valor comparable para una columna lógica de ordenación. */
function sortValue(row, sortKey) {
  switch (sortKey) {
    case 'valor_del_contrato':
      return row.valores?.contrato ?? 0;
    case 'nombre_entidad':
      return row.entidad?.nombre ?? '';
    case 'proveedor_adjudicado':
      return row.proveedor?.nombre ?? '';
    case 'estado_contrato':
      return row.estado?.raw ?? '';
    case 'modalidad_de_contratacion':
      return row.modalidad ?? '';
    case 'departamento':
      return row.entidad?.departamento ?? '';
    case 'ultima_actualizacion':
      return row.ultimaActualizacion ?? '';
    case 'fecha_de_inicio_del_contrato':
      return row.fechaInicio ?? row.fechaFirma ?? '';
    case 'fecha_de_firma':
    default:
      return row.fechaFirma ?? '';
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
// Detalle
// ---------------------------------------------------------------------------

/**
 * Single contract/process, full detail.
 * @param {string} id
 * @param {'adjudicados'|'convocados'|'todos'} [tipoRegistro]
 */
export async function getContract(id, tipoRegistro = 'todos') {
  const safe = String(id).replace(/'/g, "''");
  // En «todos» no se sabe de antemano en qué vista está el registro, así que se
  // consultan ambas: los identificadores no colisionan porque los prefijos son
  // distintos (CO1.PCCNTR… frente a CO1.REQ…).
  const sources = sourcesFor(tipoRegistro);
  const found = await mapLimit(
    sources.map((source) => async () => {
      const { rows, cached } = await query(
        { select: source.detailFields.join(','), where: `${source.idField} = '${safe}'`, limit: 1 },
        { ttlMs: config.cache.summaryTtlMs, dataset: source.dataset },
      );
      return rows.length ? { contract: normalizeDetail(rows[0], source), cached, source } : null;
    }),
    sources.length,
  );
  const hit = found.find(Boolean);
  if (!hit) return { contract: null, meta: { cached: false } };
  return { contract: hit.contract, meta: { cached: hit.cached, source: hit.source.key } };
}

// ---------------------------------------------------------------------------
// Resumen del tablero
// ---------------------------------------------------------------------------

/**
 * @param {import('../domain/filters.js').ContractFilters} filters
 */
export async function getSummary(filters) {
  const key = `summary:${filterCacheKey(filters)}`;
  const { value } = await resultCache.getOrSet(key, config.cache.summaryTtlMs, () => buildSummary(filters));
  return value;
}

async function buildSummary(filters) {
  const source = singleSourceFor(filters.tipoRegistro);
  return source ? buildSummarySoql(filters, source) : buildSummaryMerged(filters);
}

/**
 * Resumen por agregaciones SoQL: es el camino rápido y el que se usa con una sola
 * fuente (adjudicados o convocados).
 * @param {import('../domain/filters.js').ContractFilters} filters
 * @param {import('../domain/sources.js').SOURCES.contratos} source
 */
async function buildSummarySoql(filters, source) {
  const where = buildWhere(filters, source);

  // «Hoy», «este mes» y «30 días» se responden sobre el alcance del negocio pero
  // ignorando la ventana del usuario, para que sigan teniendo sentido cuando se
  // filtra, por ejemplo, al trimestre anterior.
  const dateKey = filters.dateField === 'ultima_actualizacion' ? 'actualizacion' : 'firma';
  const dateField = source.dateFields[dateKey];
  const scopeWhere = buildWhere({ ...filters, from: null, to: null }, source);
  const today = todayISO();
  const monthStart = monthStartISO();
  const dayAgg = (fromISO, toISO) => ({
    select: `count(1) as n, sum(${source.valorField}) as valor`,
    where: `${scopeWhere} and ${dateField} >= ${quote(startOfDay(fromISO))} and ${dateField} <= ${quote(endOfDay(toISO))}`,
    limit: 1,
  });

  const jobs = [
    { key: 'totals', params: { select: aggregateSelect(source), where, limit: 1 } },
    {
      key: 'entidades',
      params: {
        select: `${source.entidadField} as nombre, count(1) as contratos, sum(${source.valorField}) as valor`,
        where,
        group: source.entidadField,
        order: 'valor desc',
        limit: 10,
      },
    },
    {
      key: 'departamentos',
      params: {
        select: `${source.departamentoField} as nombre, count(1) as contratos, sum(${source.valorField}) as valor`,
        where,
        group: source.departamentoField,
        order: 'contratos desc',
        limit: 12,
      },
    },
    {
      key: 'tendencia',
      params: {
        select: `date_trunc_ym(${dateField}) as periodo, count(1) as contratos, sum(${source.valorField}) as valor`,
        where,
        group: `date_trunc_ym(${dateField})`,
        order: 'periodo asc',
        limit: 72,
      },
    },
    {
      key: 'estados',
      params: {
        select: `${source.estadoField} as estado, count(1) as contratos, sum(${source.valorField}) as valor`,
        where,
        group: source.estadoField,
        order: 'contratos desc',
        limit: 20,
      },
    },
    {
      key: 'categorias',
      params: {
        select: `${source.categoryField} as codigo, count(1) as contratos, sum(${source.valorField}) as valor`,
        where,
        group: source.categoryField,
        order: 'contratos desc',
        limit: 60,
      },
    },
    {
      key: 'modalidades',
      params: {
        select: `${source.modalidadField} as modalidad, count(1) as contratos, sum(${source.valorField}) as valor`,
        where,
        group: source.modalidadField,
        order: 'contratos desc',
        limit: 15,
      },
    },
    { key: 'hoy', params: dayAgg(today, today) },
    { key: 'mes', params: dayAgg(monthStart, today) },
    { key: 'd30', params: dayAgg(shiftDays(today, -29), today) },
  ];

  const settled = await mapLimit(
    jobs.map((job) => async () => {
      try {
        const { rows } = await query(job.params, {
          ttlMs: config.cache.summaryTtlMs,
          dataset: source.dataset,
        });
        return { key: job.key, rows, error: null };
      } catch (error) {
        // Una agregación que falle (por ejemplo un timeout de Socrata) no debe
        // dejar en blanco todo el tablero.
        return { key: job.key, rows: [], error: error instanceof Error ? error.message : String(error) };
      }
    }),
    4,
  );

  /** @type {Record<string, any[]>} */
  const byKey = {};
  const errors = [];
  for (const item of settled) {
    byKey[item.key] = item.rows;
    if (item.error) errors.push({ section: item.key, message: item.error });
  }

  return buildSummaryPayload({
    totals: aggregateRow(byKey.totals?.[0]),
    entidades: byKey.entidades ?? [],
    departamentos: byKey.departamentos ?? [],
    tendencia: byKey.tendencia ?? [],
    estados: byKey.estados ?? [],
    categorias: byKey.categorias ?? [],
    modalidades: byKey.modalidades ?? [],
    hoy: byKey.hoy?.[0],
    mes: byKey.mes?.[0],
    d30: byKey.d30?.[0],
    filters,
    source,
    where,
    errors,
  });
}

/**
 * Resumen del modo «todos»: se calcula en memoria sobre el conjunto fusionado, que
 * es la única forma de obtener cifras coherentes cuando los datos vienen de dos
 * consultas distintas.
 */
async function buildSummaryMerged(filters) {
  const { rows, truncated } = await materialize(filters);
  const valor = (row) => row.valores?.contrato ?? 0;

  const countBy = (keyFn) => {
    const map = new Map();
    for (const row of rows) {
      const k = keyFn(row);
      if (k === null || k === undefined || k === '') continue;
      const prev = map.get(k) ?? { contratos: 0, valor: 0 };
      prev.contratos += 1;
      prev.valor += valor(row);
      map.set(k, prev);
    }
    return map;
  };

  const entidadesMap = countBy((r) => r.entidad?.nombre);
  const deptosMap = countBy((r) => r.entidad?.departamento);
  const estadosMap = countBy((r) => r.estado?.raw);
  const modalidadesMap = countBy((r) => r.modalidad);
  const mesesMap = countBy((r) => (r.fechaFirma ? String(r.fechaFirma).slice(0, 7) : null));
  const categoriasMap = countBy((r) => normalizeCode(r.categoria?.rawCode) ?? 'sin-categoria');
  const tipoMap = countBy((r) => r.tipoRegistro);

  const top = (map, n, by) =>
    [...map.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b[by] - a[by])
      .slice(0, n);

  const inRange = (row, fromISO, toISO) => {
    const d = row.fechaFirma ? String(row.fechaFirma).slice(0, 10) : null;
    return d && d >= fromISO && d <= toISO;
  };
  const today = todayISO();
  const sumar = (fromISO, toISO) => {
    const subset = rows.filter((r) => inRange(r, fromISO, toISO));
    return { n: subset.length, valor: subset.reduce((acc, r) => acc + valor(r), 0) };
  };
  const hoy = sumar(today, today);
  const mes = sumar(monthStartISO(), today);
  const d30 = sumar(shiftDays(today, -29), today);

  const categoriasDetalle = [...categoriasMap.entries()].map(([code, v]) => {
    const meta = code !== 'sin-categoria' ? CODE_INDEX.get(code) : null;
    return {
      code: code === 'sin-categoria' ? null : code,
      rawCode: code === 'sin-categoria' ? null : code,
      label: meta?.label ?? (code === 'sin-categoria' ? 'Sin categoría' : `UNSPSC ${code}`),
      grupo: meta?.groupId ?? 'otro',
      grupoLabel: meta?.groupLabel ?? 'Otra / no clasificada',
      contratos: v.contratos,
      valor: v.valor,
    };
  });

  return buildSummaryPayload({
    totals: aggregateRows(rows),
    entidades: top(entidadesMap, 10, 'valor'),
    departamentos: top(deptosMap, 12, 'contratos'),
    tendencia: [...mesesMap.entries()]
      .map(([periodo, v]) => ({ periodo, contratos: v.contratos, valor: v.valor }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo)),
    estados: [...estadosMap.entries()].map(([estado, v]) => ({ estado, ...v })),
    categorias: categoriasDetalle,
    modalidades: [...modalidadesMap.entries()].map(([modalidad, v]) => ({ modalidad, ...v })),
    hoy,
    mes,
    d30,
    filters,
    source: null,
    where: null,
    errors: [],
    extra: {
      merged: true,
      truncated,
      porTipoRegistro: [...tipoMap.entries()].map(([tipo, v]) => ({ tipo, ...v })),
    },
  });
}

/** Da forma final al resumen: series, KPI y metadatos, común a los dos caminos. */
function buildSummaryPayload({
  totals, entidades, departamentos, tendencia, estados, categorias, modalidades,
  hoy, mes, d30, filters, source, where, errors, extra = {},
}) {
  const categoriasPorGrupo = new Map(
    CATEGORY_GROUPS.map((g) => [g.id, { id: g.id, label: g.label, contratos: 0, valor: 0 }]),
  );
  const categoriasDetalle = [];
  for (const row of categorias) {
    const code = normalizeCode(row.code ?? row.codigo);
    const meta = code ? CODE_INDEX.get(code) : null;
    const contratos = toNumber(row.contratos);
    const valor = toNumber(row.valor);
    const groupId = row.grupo ?? meta?.groupId ?? 'otro';
    if (!categoriasPorGrupo.has(groupId)) {
      categoriasPorGrupo.set(groupId, { id: groupId, label: 'Otra / no clasificada', contratos: 0, valor: 0 });
    }
    const bucket = categoriasPorGrupo.get(groupId);
    bucket.contratos += contratos;
    bucket.valor += valor;
    categoriasDetalle.push({
      code,
      rawCode: row.rawCode ?? (row.codigo ? String(row.codigo) : null),
      label: row.label ?? meta?.label ?? (code ? `UNSPSC ${code}` : 'Sin categoría'),
      grupo: groupId,
      grupoLabel: row.grupoLabel ?? meta?.groupLabel ?? 'Otra / no clasificada',
      contratos,
      valor,
    });
  }

  const entidadTop = entidades[0];
  const departamentoTop = departamentos[0];

  return {
    kpis: {
      contratos: totals.contratos,
      valorTotal: totals.valorTotal,
      valorPromedio: totals.valorPromedio,
      valorMaximo: totals.valorMaximo,
      contratosHoy: toNumber(hoy?.n),
      valorHoy: toNumber(hoy?.valor),
      contratosMes: toNumber(mes?.n),
      valorMes: toNumber(mes?.valor),
      contratos30d: toNumber(d30?.n),
      valor30d: toNumber(d30?.valor),
      entidadTop: entidadTop
        ? {
            nombre: entidadTop.nombre,
            contratos: toNumber(entidadTop.contratos),
            valor: toNumber(entidadTop.valor),
          }
        : null,
      departamentoTop: departamentoTop
        ? {
            nombre: departamentoTop.nombre,
            contratos: toNumber(departamentoTop.contratos),
            valor: toNumber(departamentoTop.valor),
          }
        : null,
    },
    series: {
      porMes: tendencia.map((row) => {
        const periodo = String(row.periodo ?? '').slice(0, 7);
        return {
          periodo,
          label: formatPeriodLabel(periodo),
          contratos: toNumber(row.contratos),
          valor: toNumber(row.valor),
        };
      }),
      porEstado: estados.map((row) => ({
        estado: row.estado ?? 'Sin estado',
        contratos: toNumber(row.contratos),
        valor: toNumber(row.valor),
      })),
      porCategoria: [...categoriasPorGrupo.values()].filter((g) => g.contratos > 0),
      porCodigo: categoriasDetalle,
      porModalidad: modalidades.map((row) => ({
        modalidad: row.modalidad ?? 'No definida',
        contratos: toNumber(row.contratos),
        valor: toNumber(row.valor),
      })),
      topEntidades: entidades.map((row) => ({
        nombre: row.nombre ?? 'Sin entidad',
        contratos: toNumber(row.contratos),
        valor: toNumber(row.valor),
      })),
      topDepartamentos: departamentos.map((row) => ({
        nombre: row.nombre ?? 'No Definido',
        contratos: toNumber(row.contratos),
        valor: toNumber(row.valor),
      })),
    },
    tipoRegistro: filters.tipoRegistro,
    valorLabel: source?.valorLabel ?? 'Valor',
    dateLabel: source?.dateLabel ?? null,
    source: source ? { key: source.key, dataset: source.dataset, label: source.label } : null,
    query: { where, filters: describeFilters(filters) },
    meta: {
      errors,
      partial: errors.length > 0,
      fetchedAt: new Date().toISOString(),
      ...extra,
    },
  };
}

// ---------------------------------------------------------------------------
// Facetas y ciudades
// ---------------------------------------------------------------------------

/**
 * Opciones de los desplegables de filtros, **calculadas solo para las vistas que
 * necesita el modo activo**.
 *
 * Calcularlas para las dos vistas a la vez duplicaba el arranque en frío (24 s solo
 * en facetas). Al pedirlas por modo, la primera carga paga únicamente las de la
 * fuente que se está viendo, y el modo «todos» une los vocabularios de estado de
 * ambas, que es justo lo que el usuario necesita poder filtrar.
 *
 * @param {'adjudicados'|'convocados'|'todos'} tipoRegistro
 */
export async function getMetaOptions(tipoRegistro = 'adjudicados') {
  const sources = sourcesFor(tipoRegistro);
  const key = `facets:v3:${tipoRegistro}`;

  const { value } = await resultCache.getOrSet(key, config.cache.facetsTtlMs, async () => {
    const porFuente = {};

    for (const source of sources) {
      const base = parseFilters({
        scope: 'strict',
        tipoRegistro: source.key === 'procesos' ? 'convocados' : 'adjudicados',
      });
      base.from = shiftDays(todayISO(), -config.query.facetWindowDays);
      base.to = todayISO();
      const where = buildWhere(base, source);

      const facet = (column) => ({
        select: `${column} as valor, count(1) as contratos, sum(${source.valorField}) as valorTotal`,
        where,
        group: column,
        order: 'contratos desc',
        limit: 200,
      });

      // Solo se calculan los desplegables que la interfaz usa de verdad: las
      // ciudades se cargan bajo demanda (/api/ciudades) y sectores/tiposContrato no
      // están expuestos. Esto recorta el arranque en frío a la mitad.
      const planes = [
        ['departamentos', facet(source.departamentoField)],
        ['estados', facet(source.estadoField)],
        ['modalidades', facet(source.modalidadField)],
      ];

      const settled = await mapLimit(
        planes.map(([name, params]) => async () => {
          try {
            const { rows } = await query(params, {
              ttlMs: config.cache.facetsTtlMs,
              dataset: source.dataset,
            });
            return [
              name,
              rows
                .filter((r) => r.valor)
                .map((r) => ({
                  value: String(r.valor),
                  contratos: toNumber(r.contratos),
                  valorTotal: toNumber(r.valorTotal),
                })),
            ];
          } catch {
            // Un facet que falle no debe dejar sin opciones a los demás.
            return [name, []];
          }
        }),
        3,
      );

      porFuente[source.key] = Object.fromEntries(settled);
    }

    const lists = Object.keys(porFuente);
    const unir = (campo) => mergeOptions(...lists.map((k) => porFuente[k][campo] ?? []));

    return {
      departamentos: unir('departamentos'),
      estados: unir('estados'),
      modalidades: unir('modalidades'),
      // Se conserva el desglose por vista para poder mostrar de dónde sale cada
      // estado cuando el modo activo combina las dos.
      porFuente,
      fuentes: lists,
      windowDays: config.query.facetWindowDays,
      generatedAt: new Date().toISOString(),
    };
  });

  return value;
}

/** Une varias listas de opciones sumando sus conteos y ordenando por volumen. */
function mergeOptions(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const option of list ?? []) {
      const prev = map.get(option.value) ?? { value: option.value, contratos: 0, valorTotal: 0 };
      prev.contratos += option.contratos ?? 0;
      prev.valorTotal += option.valorTotal ?? 0;
      map.set(option.value, prev);
    }
  }
  return [...map.values()].sort((x, y) => y.contratos - x.contratos);
}

/**
 * Ciudades de un departamento, cargadas bajo demanda.
 *
 * Acotado al filtro de negocio: un `group by ciudad` sin ese filtro tarda ~22 s
 * sobre las 6.1M de filas, frente a menos de un segundo acotado.
 */
export async function getCiudades(departamento, tipoRegistro = 'adjudicados') {
  const source = singleSourceFor(tipoRegistro) ?? SOURCES.contratos;
  const key = `ciudades:${source.key}:${departamento ?? '*'}`;
  const { value } = await resultCache.getOrSet(key, config.cache.facetsTtlMs, async () => {
    const base = parseFilters({ scope: 'strict', tipoRegistro: source.key === 'procesos' ? 'convocados' : 'adjudicados' });
    base.from = shiftDays(todayISO(), -config.query.facetWindowDays);
    base.to = todayISO();
    if (departamento) base.departamentos = [departamento];
    const where = buildWhere(base, source);

    const { rows } = await query(
      {
        select: `${source.ciudadField} as valor, count(1) as contratos`,
        where,
        group: source.ciudadField,
        order: 'contratos desc',
        limit: 300,
      },
      { ttlMs: config.cache.facetsTtlMs, dataset: source.dataset },
    );
    return rows
      .filter((r) => r.valor)
      .map((r) => ({ value: String(r.valor), contratos: toNumber(r.contratos) }));
  });
  return value;
}

// ---------------------------------------------------------------------------
// Exportación
// ---------------------------------------------------------------------------

/**
 * Pull every row matching the filter, up to a cap, for CSV/Excel/JSON export.
 * @param {import('../domain/filters.js').ContractFilters} filters
 */
export async function fetchAllForExport(filters, { maxRows = config.query.exportMaxRows } = {}) {
  const source = singleSourceFor(filters.tipoRegistro);

  if (!source) {
    const { rows, truncated } = await materialize(filters);
    const sorted = sortRows(rows, filters).slice(0, maxRows);
    return {
      rows: sorted,
      truncated: truncated || rows.length > maxRows,
      total: sorted.length,
      maxRows,
      merged: true,
      query: { where: describeFilters(filters), filters: describeFilters(filters) },
    };
  }

  const { rows, truncated } = await fetchAllForSource(filters, source, { maxRows });
  return {
    rows,
    truncated,
    total: rows.length,
    maxRows,
    merged: false,
    query: { where: buildWhere(filters, source), filters: describeFilters(filters) },
  };
}

function shiftDays(iso, days) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function resetCaches() {
  resultCache.clear();
}

/**
 * Precalienta en segundo plano lo que necesita la primera visita: el resumen de
 * KPIs, la primera página y los desplegables, para la fuente por defecto.
 *
 * Con la ventana de 2 años una carga en frío encadena varias agregaciones de ~3 s.
 * Se hace en secuencia, y no en paralelo, para no disparar un pico de peticiones
 * contra Socrata cuando no hay app token configurado.
 */
export async function warmDefault() {
  const filters = parseFilters({});
  const started = Date.now();
  const steps = [];

  const run = async (name, task) => {
    const t0 = Date.now();
    try {
      await task();
      steps.push({ name, ok: true, ms: Date.now() - t0 });
    } catch (error) {
      steps.push({ name, ok: false, ms: Date.now() - t0, error: error?.message });
    }
  };

  await run('resumen', () => getSummary(filters));
  await run('contratos', () => searchContracts(filters));
  await run('opciones', () => getMetaOptions());

  return { ok: steps.every((s) => s.ok), ms: Date.now() - started, steps };
}
