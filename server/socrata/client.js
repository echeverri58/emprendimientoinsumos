import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';

const cache = new TtlCache({ maxEntries: config.cache.maxEntries });

/** Última cabecera `x-soda2-last-modified` observada en cualquier respuesta. */
let lastSeenLastModified = null;

export class SocrataError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, dataset?: string, detail?: unknown, retryable?: boolean }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'SocrataError';
    this.status = meta.status ?? 0;
    this.dataset = meta.dataset ?? config.socrata.dataset;
    this.detail = meta.detail;
    this.retryable = meta.retryable ?? false;
  }
}

function resourceUrl(dataset = config.socrata.dataset) {
  return `${config.socrata.domain}/resource/${dataset}.json`;
}

/**
 * @typedef {object} SoqlParams
 * @property {string} [select]
 * @property {string} [where]
 * @property {string} [group]
 * @property {string} [order]
 * @property {number} [limit]
 * @property {number} [offset]
 */

/**
 * @param {SoqlParams} params
 * @param {string} [dataset]
 */
function buildUrl(params, dataset = config.socrata.dataset) {
  const search = new URLSearchParams();
  if (params.select) search.set('$select', params.select);
  if (params.where) search.set('$where', params.where);
  if (params.group) search.set('$group', params.group);
  if (params.order) search.set('$order', params.order);
  if (params.limit !== undefined) search.set('$limit', String(params.limit));
  if (params.offset !== undefined) search.set('$offset', String(params.offset));
  return `${resourceUrl(dataset)}?${search.toString()}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute one Socrata request with timeout + retry. No caching here.
 * @param {SoqlParams} params
 * @param {{ captureHeaders?: boolean }} [options]
 */
async function request(params, { captureHeaders = false, dataset = config.socrata.dataset } = {}) {
  const url = buildUrl(params, dataset);
  /** @type {Error|null} */
  let lastError = null;

  for (let attempt = 0; attempt <= config.socrata.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.socrata.timeoutMs);
    try {
      /** @type {Record<string, string>} */
      const headers = { Accept: 'application/json' };
      if (config.socrata.appToken) headers['X-App-Token'] = config.socrata.appToken;

      const response = await fetch(url, { headers, signal: controller.signal });

      if (response.ok) {
        // Socrata solo adjunta la cabecera de frescura en las respuestas que no
        // sirve el CDN, así que se recuerda la última vista: una consulta con
        // `$where` la trae aunque la sonda barata de /api/health no la traiga.
        const lastModified = response.headers.get('x-soda2-last-modified');
        if (lastModified) lastSeenLastModified = lastModified;

        const rows = await response.json();
        const list = Array.isArray(rows) ? rows : [];
        if (!captureHeaders) return list;
        return {
          rows: list,
          headers: {
            lastModified: lastModified ?? lastSeenLastModified,
            truthLastModified: response.headers.get('x-soda2-truth-last-modified'),
            region: response.headers.get('x-socrata-region'),
          },
        };
      }

      const body = await response.text();
      let detail = body;
      try {
        detail = JSON.parse(body);
      } catch {
        /* keep raw text */
      }
      const message =
        (detail && typeof detail === 'object' && (detail.message || detail.error)) ||
        `La API de Datos Abiertos respondió ${response.status}`;

      const retryable = response.status === 429 || response.status >= 500;
      const error = new SocrataError(String(message), { status: response.status, detail, retryable });
      lastError = error;
      if (!retryable) throw error;

      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** attempt;
      await sleep(Math.min(waitMs, 15_000));
    } catch (error) {
      if (error instanceof SocrataError && !error.retryable) throw error;
      if (error instanceof SocrataError) {
        lastError = error;
      } else if (error && error.name === 'AbortError') {
        lastError = new SocrataError(
          `La consulta a SECOP II superó el tiempo límite de ${Math.round(config.socrata.timeoutMs / 1000)}s. ` +
            'Reduzca el rango de fechas o aplique más filtros.',
          { retryable: true },
        );
      } else {
        lastError = new SocrataError(`No fue posible contactar la API de Datos Abiertos: ${error?.message}`, {
          retryable: true,
        });
      }
      if (attempt < config.socrata.retries) await sleep(800 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new SocrataError('Fallo desconocido consultando la API de Datos Abiertos.');
}

/**
 * Cached SoQL query. Identical concurrent queries collapse into one request.
 *
 * `dataset` permite consultar la segunda vista (procesos de contratación); la
 * clave de caché lo incluye para que las respuestas de una y otra no se mezclen.
 *
 * @param {SoqlParams} params
 * @param {{ ttlMs?: number, dataset?: string }} [options]
 * @returns {Promise<{ rows: any[], cached: boolean, ms: number }>}
 */
export async function query(params, { ttlMs = config.cache.searchTtlMs, dataset = config.socrata.dataset } = {}) {
  const key = `${dataset}|${buildUrl(params, dataset)}`;
  const started = Date.now();
  const { value, cached } = await cache.getOrSet(key, ttlMs, () => request(params, { dataset }));
  return { rows: /** @type {any[]} */ (value), cached, ms: Date.now() - started };
}

/**
 * Run several queries in parallel, each individually cached.
 * @param {Array<{ key: string, params: SoqlParams, ttlMs?: number }>} jobs
 */
export async function queryAll(jobs) {
  const results = await Promise.all(
    jobs.map(async (job) => {
      const result = await query(job.params, { ttlMs: job.ttlMs });
      return [job.key, result];
    }),
  );
  return /** @type {Record<string, { rows: any[], cached: boolean, ms: number }>} */ (
    Object.fromEntries(results)
  );
}

/**
 * Cheap reachability probe used by /api/health.
 *
 * Deliberately fetches a single row instead of `count(1)`: an unqualified count
 * over the 6.1M-row dataset can take over a minute, which would make the health
 * badge report "sin conexión" while the API is in fact perfectly healthy. The
 * dataset's own freshness comes from Socrata's `x-soda2-last-modified` header.
 */
export async function ping() {
  const started = Date.now();
  try {
    const { rows, headers } = await request(
      { select: 'id_contrato', limit: 1 },
      { captureHeaders: true },
    );
    return {
      reachable: true,
      latencyMs: Date.now() - started,
      sampleFound: rows.length > 0,
      datasetLastModified: headers.lastModified,
      region: headers.region,
    };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function cacheStats() {
  return cache.stats();
}

export function clearCache() {
  cache.clear();
}

export { buildUrl };
