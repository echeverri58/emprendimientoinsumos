import { toParams } from './filters.js';

const BASE = '/api';

/** An API failure carrying the server's human-readable Spanish message. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', detail } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function request(path, { params, signal } = {}) {
  const query = params instanceof URLSearchParams ? `?${params.toString()}` : '';
  let response;
  try {
    response = await fetch(`${BASE}${path}${query}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(
      'No fue posible contactar el servidor local. Verifique que el proceso Node esté en ejecución.',
      { code: 'network' },
    );
  }

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body?.message ||
      (response.status === 502 || response.status === 504
        ? 'La API de Datos Abiertos de Colombia no respondió a tiempo. Suele ocurrir cuando se consultan rangos muy amplios o cuando se supera el límite de peticiones por minuto. Reduzca el rango de fechas o configure SOCRATA_APP_TOKEN e intente de nuevo.'
        : `Error ${response.status} consultando el servidor.`);
    throw new ApiError(message, {
      status: response.status,
      code: body?.error || 'http_error',
      detail: body?.detail,
    });
  }

  return body;
}

export const api = {
  health: () => request('/health'),
  // Las opciones de los filtros (sobre todo los estados) dependen de la vista, así
  // que se piden para el tipo de registro activo.
  meta: (tipoRegistro = 'adjudicados', signal) =>
    request('/meta', { params: new URLSearchParams({ tipoRegistro }), signal }),
  summary: (filters, signal) => request('/summary', { params: toParams(filters, { includePaging: false }), signal }),
  contracts: (filters, signal) => request('/contracts', { params: toParams(filters), signal }),
  contract: (id, tipoRegistro = 'todos', signal) =>
    request(`/contracts/${encodeURIComponent(id)}`, {
      params: new URLSearchParams({ tipoRegistro }),
      signal,
    }),
  ciudades: (departamento, tipoRegistro = 'adjudicados', signal) => {
    const params = new URLSearchParams({ tipoRegistro });
    if (departamento) params.set('departamento', departamento);
    return request('/ciudades', { params, signal });
  },
};

/** Direct download URL for the export endpoints (used by <a download>). */
export function exportUrl(format, filters) {
  const params = toParams(filters, { includePaging: false });
  return `${BASE}/export.${format}?${params.toString()}`;
}
