/**
 * Capa de acceso a datos con la MISMA firma que la versión con backend.
 *
 * Los componentes (`App`, `ContractDetailDrawer`, `FilterPanel`…) importan `api.*`
 * y no saben si hay servidor o no: aquí cada método resuelve en el navegador contra
 * Socrata. Solo cambia la exportación, que ahora descarga un Blob en vez de apuntar
 * a una URL del servidor.
 */
import { config } from '../config.js';
import { CATEGORY_GROUPS, KEYWORDS_REQUIRED, KEYWORDS_OPTIONAL } from './catalog.js';
import { SCOPE_MAX_WINDOW_DAYS, SCOPES } from './soql.js';
import { SOURCE_LIST } from './sources.js';
import { ping } from './socrata.js';
import {
  fetchAllForExport,
  getCiudades,
  getContract,
  getMetaOptions,
  getSummary,
  searchContracts,
} from './dataservice.js';
import { rowsToCsv, rowsToExcelXml, rowsToJson } from './exporters.js';
import { todayISO } from './dates.js';

export class ApiError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = meta.status ?? 0;
    this.code = meta.code ?? 'error';
  }
}

async function health() {
  const probe = await ping();
  return {
    ok: probe.reachable,
    service: 'secop-dotacion-insumos (sin backend)',
    dataset: { domain: config.socrata.domain, id: 'jbjy-vk9h' },
    hasAppToken: Boolean(config.socrata.appToken),
    today: todayISO(),
    socrata: { ...probe, datasetLastModified: null },
  };
}

async function meta(tipoRegistro = 'adjudicados') {
  const options = await getMetaOptions(tipoRegistro);
  return {
    categories: CATEGORY_GROUPS,
    keywords: { required: KEYWORDS_REQUIRED, optional: KEYWORDS_OPTIONAL },
    scopes: SCOPES,
    tiposRegistro: SOURCE_LIST.map((s) => ({
      key: s.key,
      dataset: s.dataset,
      tipoRegistro: s.tipoRegistro,
      label: s.label,
      shortLabel: s.shortLabel,
      description: s.description,
      valorLabel: s.valorLabel,
      dateLabel: s.dateLabel,
    })),
    options,
    defaults: {
      windowDays: config.query.defaultWindowDays,
      pageSize: config.query.defaultPageSize,
      scope: 'strict',
      tipoRegistro: 'adjudicados',
      dateField: 'fecha_de_firma',
      sort: 'fecha_de_firma',
      dir: 'desc',
    },
    limits: {
      maxPageSize: config.query.maxPageSize,
      maxWindowDays: config.query.maxWindowDays,
      scopeMaxWindowDays: SCOPE_MAX_WINDOW_DAYS,
      exportMaxRows: config.query.exportMaxRows,
    },
  };
}

export const api = {
  health,
  meta,
  summary: (filters) => getSummary(filters),
  contracts: (filters) => searchContracts(filters),
  contract: (id, tipoRegistro = 'todos') => getContract(id, tipoRegistro),
  ciudades: async (departamento, tipoRegistro = 'adjudicados') => ({
    departamento,
    tipoRegistro,
    ciudades: await getCiudades(departamento, tipoRegistro),
  }),
};

/** Genera y descarga un archivo a partir del conjunto filtrado. */
export async function downloadExport(format, filters) {
  const { rows, truncated } = await fetchAllForExport(filters);
  const base = `secop-dotacion-${filters.from}_a_${filters.to}`;
  const meta = {
    generado: new Date().toISOString(),
    dataset: 'SECOP II — Datos Abiertos Colombia (sin backend)',
    filtros: { desde: filters.from, hasta: filters.to, tipoRegistro: filters.tipoRegistro, alcance: filters.scope },
    rango: { desde: filters.from, hasta: filters.to },
    truncado: truncated,
    maxFilas: config.query.exportMaxRows,
  };

  let blob;
  let filename;
  let mime;
  if (format === 'csv') {
    blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    filename = `${base}.csv`;
    mime = 'text/csv';
  } else if (format === 'xls') {
    blob = new Blob([rowsToExcelXml(rows, meta)], { type: 'application/vnd.ms-excel;charset=utf-8' });
    filename = `${base}.xls`;
    mime = 'application/vnd.ms-excel';
  } else if (format === 'json') {
    blob = new Blob([rowsToJson(rows, meta)], { type: 'application/json;charset=utf-8' });
    filename = `${base}.json`;
    mime = 'application/json';
  } else {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.type = mime;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
