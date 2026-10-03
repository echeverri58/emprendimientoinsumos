/**
 * ¿Es `$q` (búsqueda de texto completo, indexada) una alternativa viable a
 * `upper(col) like '%…%'` para el modo "solo texto"?
 *
 * `like` con comodín inicial no puede usar índices y obliga a escanear las 6,1M
 * de filas. Si `$q` es sensiblemente más rápido, el modo de texto podría mantener
 * la ventana completa de 2 años en lugar de tener que acotarla.
 */
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const TO = new Date().toISOString().slice(0, 10);
const KWS = ['DOTACION', 'DOTACIÓN', 'INSUMOS', 'UNIFORMES', 'CALZADO', 'VESTUARIO', 'ELEMENTOS DE PROTECCION', 'ELEMENTOS DE PROTECCIÓN', 'OVEROLES', 'EPP'];

const CATS = ['53111500', '53111600', '53111900', '53111800', '53102700', '53101500', '53101600', '53101800', '53102400', '53102500', '46181500', '46181700', '46181800', '46181900', '46182000', '46182100'];
const CAT = '(' + CATS.map((c) => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';
const KW = '(' + KWS.flatMap((k) => ['objeto_del_contrato', 'descripcion_del_proceso'].map((f) => `upper(${f}) like '%${k}%'`)).join(' or ') + ')';

function fromISO(days) {
  return new Date(Date.parse(`${TO}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

async function run(label, { days, q, where }, timeoutMs = 120_000) {
  const params = new URLSearchParams();
  params.set('$select', 'count(1) as n, sum(valor_del_contrato) as v');
  const clauses = [`fecha_de_firma >= '${fromISO(days)}T00:00:00.000'`, `fecha_de_firma <= '${TO}T23:59:59.999'`];
  if (where) clauses.push(where);
  params.set('$where', clauses.join(' and '));
  if (q) params.set('$q', q);
  params.set('$limit', '1');

  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}?${params}`, { signal: ac.signal });
    const dt = Date.now() - t0;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.log(`  ${label.padEnd(46)} FALLO ${String(dt).padStart(7)}ms  ${String(body.message || res.status).slice(0, 60)}`);
      return null;
    }
    const rows = await res.json();
    console.log(`  ${label.padEnd(46)} ok    ${String(dt).padStart(7)}ms  n=${String(rows[0].n).padStart(7)}  valor=${Number(rows[0].v).toLocaleString('es-CO')}`);
    return { ms: dt, n: Number(rows[0].n) };
  } catch (e) {
    console.log(`  ${label.padEnd(46)} ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'} ${String(Date.now() - t0).padStart(7)}ms`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

console.log('\n--- Referencia: el modo de texto actual con like (lento) ---');
await run('like 730d  (modo "solo texto" actual)', { days: 730, where: KW });
await new Promise((r) => setTimeout(r, 1500));
await run('like 365d', { days: 365, where: KW });

console.log('\n--- $q texto completo, sin restricción de campos ---');
await new Promise((r) => setTimeout(r, 1500));
await run('$q=DOTACION 730d', { days: 730, q: 'DOTACION' });
await new Promise((r) => setTimeout(r, 1500));
await run('$q=(DOTACION OR INSUMOS OR UNIFORMES) 730d', { days: 730, q: '(DOTACION OR INSUMOS OR UNIFORMES)' });
await new Promise((r) => setTimeout(r, 1500));
await run('$q=DOTACION OR INSUMOS ... (10 términos) 730d', { days: 730, q: KWS.map((k) => `"${k}"`).join(' OR ') });

console.log('\n--- ¿$q combinado con el OR de categoría (modo "amplio")? ---');
await new Promise((r) => setTimeout(r, 1500));
await run('amplio: CAT OR $q 730d', { days: 730, q: 'DOTACION OR INSUMOS OR UNIFORMES', where: CAT });
await new Promise((r) => setTimeout(r, 1500));
await run('$q sin $where de fecha (dataset completo)', { days: 730, q: 'DOTACION', where: null });
