import { Router } from 'express';
import { config } from '../config.js';
import {
  CATEGORY_GROUPS,
  KEYWORDS_OPTIONAL,
  KEYWORDS_REQUIRED,
} from '../domain/catalog.js';
import { parseFilters } from '../domain/filters.js';
import { SCOPE_MAX_WINDOW_DAYS, SCOPES } from '../domain/soql.js';
import { SOURCE_LIST, SOURCES } from '../domain/sources.js';
import {
  fetchAllForExport,
  getCiudades,
  getContract,
  getMetaOptions,
  getSummary,
  resetCaches,
  searchContracts,
} from '../services/contracts.js';
import { rowsToCsv, rowsToExcelXml, rowsToJson } from '../services/exporters.js';
import { SocrataError, cacheStats, clearCache, ping } from '../socrata/client.js';
import { slugify } from '../lib/csv.js';
import { todayISO } from '../lib/dates.js';

export const api = Router();

/** Wrap an async handler so rejections reach the error middleware. */
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

api.get(
  '/health',
  wrap(async (_req, res) => {
    const upstream = await ping();
    res.json({
      ok: upstream.reachable,
      service: 'secop-dotacion-insumos',
      dataset: { domain: config.socrata.domain, id: config.socrata.dataset, view: 'jbjy-vk9h' },
      hasAppToken: Boolean(config.socrata.appToken),
      today: todayISO(),
      socrata: upstream,
      cache: { ...cacheStats(), results: cacheStats().entries },
      uptimeSeconds: Math.round(process.uptime()),
    });
  }),
);

/** Catálogo estático + opciones de los desplegables de filtros. */
api.get(
  '/meta',
  wrap(async (req, res) => {
    const tipoRegistro = String(req.query.tipoRegistro || 'adjudicados');
    const options = await getMetaOptions(tipoRegistro);
    res.json({
      categories: CATEGORY_GROUPS,
      keywords: { required: KEYWORDS_REQUIRED, optional: KEYWORDS_OPTIONAL },
      scopes: SCOPES,
      tipoRegistro,
      // «Convocado» y «adjudicado» viven en vistas distintas de SECOP II, así que
      // esto es un conmutador de fuente, no un valor más de una columna.
      tiposRegistro: SOURCE_LIST.map((source) => ({
        key: source.key,
        dataset: source.dataset,
        tipoRegistro: source.tipoRegistro,
        label: source.label,
        shortLabel: source.shortLabel,
        description: source.description,
        valorLabel: source.valorLabel,
        dateLabel: source.dateLabel,
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
        // Cada modo tiene su propio tope medido: el modo de solo texto no lleva la
        // restricción de categoría y por eso no puede abarcar los 2 años.
        scopeMaxWindowDays: SCOPE_MAX_WINDOW_DAYS,
        exportMaxRows: config.query.exportMaxRows,
      },
    });
  }),
);

api.get(
  '/ciudades',
  wrap(async (req, res) => {
    const departamento = req.query.departamento ? String(req.query.departamento) : null;
    const tipoRegistro = req.query.tipoRegistro ? String(req.query.tipoRegistro) : 'adjudicados';
    res.json({ departamento, tipoRegistro, ciudades: await getCiudades(departamento, tipoRegistro) });
  }),
);

api.get(
  '/contracts',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await searchContracts(filters));
  }),
);

api.get(
  '/contracts/:id',
  wrap(async (req, res) => {
    const tipoRegistro = req.query.tipoRegistro ? String(req.query.tipoRegistro) : 'todos';
    const result = await getContract(req.params.id, tipoRegistro);
    if (!result.contract) {
      res.status(404).json({
        error: 'not_found',
        message: `No se encontró el registro ${req.params.id} en ${SOURCES.contratos.dataset} ni en ${SOURCES.procesos.dataset}.`,
      });
      return;
    }
    res.json(result);
  }),
);

api.get(
  '/summary',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await getSummary(filters));
  }),
);

api.get(
  '/export.csv',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    const result = await fetchAllForExport(filters, { maxRows: config.query.exportMaxRows });
    const csv = rowsToCsv(result.rows);
    const filename = `secop-dotacion-${filters.from}_a_${filters.to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slugify(filename, 'reporte')}.csv"`);
    res.setHeader('X-Total-Rows', String(result.total));
    res.setHeader('X-Truncated', String(result.truncated));
    res.send(csv);
  }),
);

api.get(
  '/export.xls',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    const result = await fetchAllForExport(filters, { maxRows: config.query.exportMaxRows });
    const xml = rowsToExcelXml(result.rows, {
      generado: new Date().toISOString(),
      dataset: `${config.socrata.domain} / ${config.socrata.dataset} (SECOP II)`,
      filtros: result.query.filters,
      rango: { desde: filters.from, hasta: filters.to },
      truncado: result.truncated,
      maxFilas: result.maxRows,
    });
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="secop-dotacion-${filters.from}_a_${filters.to}.xls"`);
    res.setHeader('X-Total-Rows', String(result.total));
    res.setHeader('X-Truncated', String(result.truncated));
    res.send(xml);
  }),
);

api.get(
  '/export.json',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    const result = await fetchAllForExport(filters, { maxRows: config.query.exportMaxRows });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="secop-dotacion-${filters.from}_a_${filters.to}.json"`);
    res.send(
      rowsToJson(result.rows, {
        generado: new Date().toISOString(),
        dataset: `datos.gov.co / ${config.socrata.dataset} (SECOP II)`,
        filtros: result.query.filters,
        rango: { desde: filters.from, hasta: filters.to },
        filas: result.total,
        truncado: result.truncated,
        maxFilas: result.maxRows,
      }),
    );
  }),
);

api.post(
  '/cache/clear',
  wrap(async (_req, res) => {
    clearCache();
    resetCaches();
    res.json({ ok: true, cache: cacheStats() });
  }),
);

api.use((_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Ruta de API no encontrada.' });
});

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
api.use((error, _req, res, _next) => {
  const status = error instanceof SocrataError ? (error.status === 429 ? 429 : 502) : 500;
  res.status(status).json({
    error: error instanceof SocrataError ? 'upstream_error' : 'internal_error',
    message: error?.message ?? 'Error inesperado en el servidor.',
    detail: error instanceof SocrataError ? error.detail : undefined,
  });
});
