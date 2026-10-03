/**
 * Cliente Socrata para el navegador: fetch directo a datos.gov.co con CORS,
 * timeout, reintentos y caché en memoria.
 *
 * La clave de la versión sin backend: el navegador habla con Socrata directamente,
 * así que no hay servidor propio. Lo que antes hacía la caché del servidor ahora lo
 * hace una caché en memoria (se pierde al recargar, pero evita consultas duplicadas
 * durante la sesión).
 */
import { config } from '../config.js';
import { TtlCache } from './cache.js';

const cache = new TtlCache({ maxEntries: config.cache.maxEntries });

export class SocrataError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'SocrataError';
    this.status = meta.status ?? 0;
    this.retryable = meta.retryable ?? false;
  }
}

function buildUrl(params, dataset) {
  const search = new URLSearchParams();
  if (params.select) search.set('$select', params.select);
  if (params.where) search.set('$where', params.where);
  if (params.group) search.set('$group', params.group);
  if (params.order) search.set('$order', params.order);
  if (params.limit !== undefined) search.set('$limit', String(params.limit));
  if (params.offset !== undefined) search.set('$offset', String(params.offset));
  return `${config.socrata.domain}/resource/${dataset}.json?${search.toString()}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(params, dataset) {
  const url = buildUrl(params, dataset);
  let lastError = null;

  for (let attempt = 0; attempt <= config.socrata.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.socrata.timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (config.socrata.appToken) headers['X-App-Token'] = config.socrata.appToken;

      const response = await fetch(url, { headers, signal: controller.signal });

      if (response.ok) {
        const rows = await response.json();
        return Array.isArray(rows) ? rows : [];
      }

      const retryable = response.status === 429 || response.status >= 500;
      const error = new SocrataError(
        `Socrata respondió ${response.status}${response.status === 429 ? ' (límite de peticiones)' : ''}`,
        { status: response.status, retryable },
      );
      lastError = error;
      if (!retryable) throw error;
      await sleep(800 * 2 ** attempt);
    } catch (error) {
      if (error instanceof SocrataError && !error.retryable) throw error;
      if (error?.name === 'AbortError') {
        lastError = new SocrataError('La consulta a Socrata superó el tiempo límite. Reduzca el rango de fechas o los filtros.', {
          retryable: true,
        });
      } else if (!(error instanceof SocrataError)) {
        lastError = new SocrataError(`No fue posible contactar datos.gov.co: ${error?.message}`, { retryable: true });
      } else {
        lastError = error;
      }
      if (attempt < config.socrata.retries) await sleep(800 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new SocrataError('Fallo desconocido consultando Socrata.');
}

/**
 * Consulta SoQL cacheada.
 * @param {object} params
 * @param {{ dataset?: string, ttlMs?: number }} [options]
 */
export async function socrataQuery(params, { dataset = 'jbjy-vk9h', ttlMs = config.cache.searchTtlMs } = {}) {
  const key = `${dataset}|${buildUrl(params, dataset)}`;
  const { value } = await cache.getOrSet(key, ttlMs, () => request(params, dataset));
  return value;
}

/** Sonda barata para el indicador "en línea" del encabezado. */
export async function ping() {
  const started = Date.now();
  try {
    const rows = await request({ select: 'id_contrato', limit: 1 }, 'jbjy-vk9h');
    return { reachable: true, latencyMs: Date.now() - started, sampleFound: rows.length > 0 };
  } catch (error) {
    return { reachable: false, latencyMs: Date.now() - started, error: error?.message };
  }
}

export function clearCache() {
  cache.clear();
}
