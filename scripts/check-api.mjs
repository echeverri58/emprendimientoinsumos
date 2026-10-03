#!/usr/bin/env node
/**
 * Preflight check for the SECOP II data source.
 *
 * Runs without the app server and asserts the four dataset quirks this codebase
 * depends on, so a future change at datos.gov.co surfaces here rather than as a
 * confusing empty result set in the UI.
 *
 *   node scripts/check-api.mjs
 */
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const WINDOW = 90;

const CATEGORY_CODES = [
  '53111500', '53111600', '53111900', '53111800',
  '53102700', '53101500', '53101600', '53101800',
  '53102400', '53102500',
  '46181500', '46181700', '46181800', '46181900', '46182000', '46182100',
];

const KEYWORDS = [
  'DOTACION', 'DOTACIÓN', 'INSUMOS', 'UNIFORMES', 'CALZADO', 'VESTUARIO',
  'ELEMENTOS DE PROTECCION', 'ELEMENTOS DE PROTECCIÓN', 'OVEROLES', 'EPP',
];

const CATEGORY_CLAUSE =
  '(' + CATEGORY_CODES.map((c) => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';
const KEYWORD_CLAUSE =
  '(' +
  KEYWORDS.flatMap((k) =>
    ['objeto_del_contrato', 'descripcion_del_proceso'].map((f) => `upper(${f}) like '%${k}%'`),
  ).join(' or ') +
  ')';

let pass = 0;
let fail = 0;

function record(ok, label, detail) {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta una consulta SoQL.
 *
 * Reintenta ante fallos de red, 429 y 5xx: esta sonda corre sin app token, así
 * que un corte transitorio por límite de peticiones no debe reportarse como si el
 * dataset hubiera cambiado de estructura (que es lo que la sonda vigila).
 */
async function soql({ select = 'count(1) as n', where, order, limit = 1, group }, { retries = 2 } = {}) {
  const params = new URLSearchParams();
  params.set('$select', select);
  if (where) params.set('$where', where);
  if (group) params.set('$group', group);
  if (order) params.set('$order', order);
  params.set('$limit', String(limit));

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(`${BASE}?${params}`, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      if (!res.ok) {
        const message = body && typeof body === 'object' ? body.message : String(body).slice(0, 200);
        const error = new Error(String(message));
        error.status = res.status;
        throw error;
      }
      return Array.isArray(body) ? body : [];
    } catch (error) {
      lastError = error;
      // Un error de tipo SoQL (400) es un resultado válido de la sonda: no se reintenta.
      const retryable = !error.status || error.status === 429 || error.status >= 500;
      if (!retryable || attempt >= retries) throw error;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

function daysAgoISO(days) {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const SINCE = daysAgoISO(WINDOW);
const DATE_WINDOW = `fecha_de_firma >= '${SINCE}T00:00:00.000'`;

async function main() {
  console.log(`\nVerificando la API de Datos Abiertos Colombia (vista jbjy-vk9h)`);
  console.log(`Endpoint : ${BASE}`);
  console.log(`Ventana  : últimos ${WINDOW} días (desde ${SINCE})\n`);

  console.log('1) Alcanzabilidad del dataset');
  try {
    const rows = await soql({ select: 'count(1) as n' });
    const total = Number(rows[0]?.n ?? 0);
    record(total > 1_000_000, 'El dataset responde y contiene filas', `${total.toLocaleString('es-CO')} registros`);
  } catch (error) {
    record(false, 'El dataset responde', error.message);
    console.log('\nNo es posible continuar: el endpoint no está disponible.\n');
    process.exit(1);
  }

  console.log('\n2) Los códigos UNSPSC llevan prefijo de versión (el error clásico)');
  try {
    const bare = await soql({
      where: `${DATE_WINDOW} and codigo_de_categoria_principal in ('53111600')`,
    });
    const bareCount = Number(bare[0]?.n ?? 0);
    record(
      bareCount === 0,
      "La igualdad exacta in ('53111600') devuelve 0 filas (confirma el prefijo «V1.»)",
      `n=${bareCount}`,
    );
  } catch (error) {
    record(false, 'Consulta de igualdad exacta', error.message);
  }
  try {
    const like = await soql({ where: `${DATE_WINDOW} and codigo_de_categoria_principal like '%53111600%'` });
    const likeCount = Number(like[0]?.n ?? 0);
    record(likeCount > 0, "La coincidencia like '%53111600%' sí devuelve filas", `n=${likeCount}`);
  } catch (error) {
    record(false, 'Consulta con like', error.message);
  }

  console.log('\n3) nit_entidad es numérica: upper()/coalesce() abortan la consulta');
  try {
    await soql({ where: `${DATE_WINDOW} and upper(nit_entidad) like '%9%'` });
    record(false, 'upper(nit_entidad) debería fallar con type-mismatch y no lo hizo');
  } catch (error) {
    record(
      /type-mismatch|Type mismatch/i.test(error.message),
      'upper(nit_entidad) falla con type-mismatch, como se documenta',
      error.message.slice(0, 70),
    );
  }
  try {
    const numeric = await soql({ where: `${DATE_WINDOW} and nit_entidad > 0` });
    record(Number(numeric[0]?.n ?? 0) > 0, 'La comparación numérica nit_entidad > 0 funciona');
  } catch (error) {
    record(false, 'Comparación numérica de nit_entidad', error.message);
  }

  console.log('\n4) El guion bajo «_» actúa como comodín de un carácter (búsqueda sin tildes)');
  try {
    const noAccent = await soql({ where: `${DATE_WINDOW} and upper(objeto_del_contrato) like '%DOTACION%'` });
    const accent = await soql({ where: `${DATE_WINDOW} and upper(objeto_del_contrato) like '%DOTACIÓN%'` });
    const wildcard = await soql({ where: `${DATE_WINDOW} and upper(objeto_del_contrato) like '%DOTACI_N%'` });
    const a = Number(noAccent[0]?.n ?? 0);
    const b = Number(accent[0]?.n ?? 0);
    const c = Number(wildcard[0]?.n ?? 0);
    record(c >= Math.max(a, b), 'El comodín «_» cubre ambas grafías', `sin tilde=${a}, con tilde=${b}, comodín=${c}`);
  } catch (error) {
    record(false, 'Comodín «_»', error.message);
  }

  console.log('\n5) Filtro de negocio completo (16 categorías Y 10 palabras clave)');
  try {
    const started = Date.now();
    const rows = await soql({
      select: 'count(1) as n, sum(valor_del_contrato) as valor',
      where: `${DATE_WINDOW} and ${CATEGORY_CLAUSE} and ${KEYWORD_CLAUSE}`,
    });
    const ms = Date.now() - started;
    const n = Number(rows[0]?.n ?? 0);
    const valor = Number(rows[0]?.valor ?? 0);
    record(n > 0, 'El filtro estricto devuelve contratos', `n=${n}, valor=${valor.toLocaleString('es-CO')} COP`);
    record(ms < 20_000, 'La consulta responde dentro del tiempo límite del servidor', `${ms} ms`);
  } catch (error) {
    record(false, 'Filtro estricto', error.message);
  }

  console.log(`\n${pass} correctas, ${fail} fallidas\n`);
  if (fail > 0) {
    console.log('Revise docs/NOTAS-DATOS.md: es posible que la estructura del dataset haya cambiado.\n');
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nError inesperado durante la verificación:', error);
  process.exit(1);
});
