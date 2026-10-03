// Probe 2: the spec's UNSPSC filter returns 0 rows. Find out why + find a FAST query shape.
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';

async function q(label, params, ms = 90000) {
  const url = BASE + (params ? '?' + params : '');
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ac.signal });
    const dt = Date.now() - t0;
    const rl = res.headers.get('x-ratelimit-remaining') ?? '-';
    if (!res.ok) {
      console.log(`  [${String(dt).padStart(6)}ms] ${label}: HTTP ${res.status} rl=${rl} :: ${(await res.text()).slice(0,200)}`);
      return null;
    }
    const data = await res.json();
    console.log(`  [${String(dt).padStart(6)}ms] ${label}: ${data.length} rows (rl=${rl})`);
    return data;
  } catch (e) {
    console.log(`  [${String(Date.now() - t0).padStart(6)}ms] ${label}: ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERR ' + e.message}`);
    return null;
  } finally { clearTimeout(timer); }
}

console.log('--- A) shape of codigo_de_categoria_principal (the spec assumes bare "53111500") ---');
const codes = await q('sample distinct-ish codes', '$select=' + encodeURIComponent('codigo_de_categoria_principal, count(1) as n') + '&$group=codigo_de_categoria_principal&$order=n desc&$limit=25');
if (codes) for (const c of codes) console.log(`      ${JSON.stringify(c.codigo_de_categoria_principal)} -> ${c.n}`);

console.log('\n--- B) date-bounded window: how recent is the data, and does a bound make it fast? ---');
await q('max fecha_de_firma', '$select=' + encodeURIComponent('max(fecha_de_firma) as mx'), 120000);

// Bound to a recent window, then apply category + keyword.
const SINCE = '2025-01-01T00:00:00.000';
const CATS = ['53111500','53111600','53111900','53111800','53102700','53101500','53101600','53101800','53102400','53102500','46181500','46181700','46181800','46181900','46182000','46182100'];
const catLike = CATS.map(c => `codigo_de_categoria_principal like '%${c}%'`).join(' or ');
const KW = ['DOTACION','DOTACIÓN','INSUMOS','UNIFORMES','CALZADO','VESTUARIO','ELEMENTOS DE PROTECCION','OVEROLES','EPP'];
const kwOr = KW.map(k => `upper(coalesce(objeto_del_contrato,'')) like '%${k}%' or upper(coalesce(descripcion_del_proceso,'')) like '%${k}%'`).join(' or ');

console.log('\n--- C) spec filter, UNSPSC bare IN() vs LIKE, both date-bounded ---');
const bareIn = CATS.map(c => `'${c}'`).join(',');
await q('bare IN() + kw, since 2025', '$where=' + encodeURIComponent(`fecha_de_firma > '${SINCE}' and codigo_de_categoria_principal in (${bareIn}) and (${kwOr})`) + '&$select=' + encodeURIComponent('count(1) as n'), 150000);
await q('LIKE codes + kw, since 2025', '$where=' + encodeURIComponent(`fecha_de_firma > '${SINCE}' and (${catLike}) and (${kwOr})`) + '&$select=' + encodeURIComponent('count(1) as n'), 150000);

console.log('\n--- D) keyword filter ALONE, date-bounded (is UNSPSC even needed?) ---');
await q('kw only, since 2025', '$where=' + encodeURIComponent(`fecha_de_firma > '${SINCE}' and (${kwOr})`) + '&$select=' + encodeURIComponent('count(1) as n'), 150000);

console.log('\n--- E) real rows, LIKE variant, bounded (verify relevance + speed of a page) ---');
const rows = await q('page of 8', '$where=' + encodeURIComponent(`fecha_de_firma > '${SINCE}' and (${catLike}) and (${kwOr})`) +
  '&$select=' + encodeURIComponent('fecha_de_firma,nombre_entidad,departamento,objeto_del_contrato,valor_del_contrato,estado_contrato,codigo_de_categoria_principal,proveedor_adjudicado') +
  '&$order=' + encodeURIComponent('fecha_de_firma desc') + '&$limit=8', 150000);
if (rows) for (const r of rows) {
  console.log(`      [${(r.fecha_de_firma||'').slice(0,10)}] ${(r.nombre_entidad||'').slice(0,38)} | ${(r.departamento||'').slice(0,14)} | ${r.codigo_de_categoria_principal} | ${r.valor_del_contrato} | ${(r.objeto_del_contrato||'').slice(0,55)}`);
}

console.log('\n--- F) does an app token change throughput? (report rate-limit headers) ---');
const res = await fetch(BASE + '?$limit=1');
console.log('   headers:', JSON.stringify(Object.fromEntries([...res.headers].filter(([k]) => k.startsWith('x-') || k.includes('rate')))));
