/**
 * Coste real de cada modo de la regla de negocio según el ancho de la ventana.
 *
 * El modo `estricto` incluye la restricción UNSPSC, que reduce muchísimo el
 * conjunto antes de evaluar las palabras clave. Los modos `keyword` y `broad` no
 * tienen esa ayuda, así que hay que medir hasta dónde aguantan.
 *
 * Ejecutar con el servidor en reposo y sin app token: los números se degradan si
 * hay throttling por IP.
 */
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const TO = new Date().toISOString().slice(0, 10);

const CATS = ['53111500', '53111600', '53111900', '53111800', '53102700', '53101500', '53101600', '53101800', '53102400', '53102500', '46181500', '46181700', '46181800', '46181900', '46182000', '46182100'];
const KWS = ['DOTACION', 'DOTACIÓN', 'INSUMOS', 'UNIFORMES', 'CALZADO', 'VESTUARIO', 'ELEMENTOS DE PROTECCION', 'ELEMENTOS DE PROTECCIÓN', 'OVEROLES', 'EPP'];

const CAT = '(' + CATS.map((c) => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';
const KW = '(' + KWS.flatMap((k) => ['objeto_del_contrato', 'descripcion_del_proceso'].map((f) => `upper(${f}) like '%${k}%'`)).join(' or ') + ')';

const SCOPES = {
  estricto: `${CAT} and ${KW}`,
  'solo categoria': CAT,
  'solo texto': KW,
  amplio: `(${CAT} or ${KW})`,
};

const WINDOWS = [90, 180, 365, 730];
const TIMEOUT_MS = 120_000;

function fromISO(days) {
  return new Date(Date.parse(`${TO}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

async function timed(label, days) {
  const where = `fecha_de_firma >= '${fromISO(days)}T00:00:00.000' and fecha_de_firma <= '${TO}T23:59:59.999' and ${SCOPES[label]}`;
  const url = `${BASE}?$select=${encodeURIComponent('count(1) as n, sum(valor_del_contrato) as v')}&$where=${encodeURIComponent(where)}&$limit=1`;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const dt = Date.now() - t0;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = String(body.message || res.status);
      console.log(`  ${String(days).padStart(4)}d  FALLO  ${String(dt).padStart(7)}ms  ${msg.slice(0, 70)}`);
      return { days, ok: false, ms: dt };
    }
    const rows = await res.json();
    console.log(
      `  ${String(days).padStart(4)}d  ok     ${String(dt).padStart(7)}ms  n=${String(rows[0].n).padStart(7)}  valor=${Number(rows[0].v).toLocaleString('es-CO')}`,
    );
    return { days, ok: true, ms: dt, n: Number(rows[0].n), valor: Number(rows[0].v) };
  } catch (e) {
    const dt = Date.now() - t0;
    console.log(`  ${String(days).padStart(4)}d  ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'} ${String(dt).padStart(7)}ms`);
    return { days, ok: false, ms: dt };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`\nCoste por modo y ancho de ventana (hasta ${TO}), medido en reposo.`);
console.log(`Umbral de referencia del servidor: SOCRATA_TIMEOUT_MS = 30.000 ms, 1 reintento.\n`);

const results = {};
for (const scope of Object.keys(SCOPES)) {
  console.log(`--- ${scope} ---`);
  results[scope] = [];
  for (const days of WINDOWS) {
    results[scope].push(await timed(scope, days));
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('');
}

console.log('=== Resumen: ¿cabe en el tiempo límite de 30 s? ===\n');
console.log(`  ${'modo'.padEnd(16)}${WINDOWS.map((d) => `${d}d`.padStart(12)).join('')}`);
for (const [scope, rows] of Object.entries(results)) {
  const cells = rows.map((r) => {
    if (!r.ok) return 'NO CABE'.padStart(12);
    return `${(r.ms / 1000).toFixed(1)}s${r.ms > 30_000 ? ' ✗' : ' ✓'}`.padStart(12);
  });
  console.log(`  ${scope.padEnd(16)}${cells.join('')}`);
}
console.log('');
