// Probe 3: exact numbers for the business filter (for KPI validation) + filter facets.
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';

async function q(label, params, ms = 120000) {
  const url = BASE + '?' + params;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ac.signal });
    const dt = Date.now() - t0;
    if (!res.ok) { console.log(`  [${dt}ms] ${label}: HTTP ${res.status} ${(await res.text()).slice(0,150)}`); return null; }
    const data = await res.json();
    console.log(`  [${String(dt).padStart(6)}ms] ${label}: ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  } catch (e) {
    console.log(`  [${Date.now() - t0}ms] ${label}: ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERR ' + e.message}`);
    return null;
  } finally { clearTimeout(timer); }
}

const CATS = ['53111500','53111600','53111900','53111800','53102700','53101500','53101600','53101800','53102400','53102500','46181500','46181700','46181800','46181900','46182000','46182100'];
const catLike = '(' + CATS.map(c => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';
const KW = ['DOTACION','DOTACIÓN','INSUMOS','UNIFORMES','CALZADO','VESTUARIO','ELEMENTOS DE PROTECCION','OVEROLES','EPP'];
const kwOr = '(' + KW.map(k => `upper(coalesce(objeto_del_contrato,'')) like '%${k}%' or upper(coalesce(descripcion_del_proceso,'')) like '%${k}%'`).join(' or ') + ')';
const cat = catLike + ' and ' + kwOr;

const B = (since, extra = '') => '$where=' + encodeURIComponent(`fecha_de_firma >= '${since}' and ${cat}${extra}`);
const SEL = '&$select=' + encodeURIComponent('count(1) as n, sum(valor_del_contrato) as total');

console.log('=== COUNTS BY WINDOW (business filter only) ===');
await q('hoy        2026-10-02', B('2026-10-02T00:00:00.000') + SEL);
await q('ayer       2026-10-01', B('2026-10-01T00:00:00.000', ` and fecha_de_firma < '2026-10-02T00:00:00.000'`) + SEL);
await q('este mes   2026-10-01+', B('2026-10-01T00:00:00.000') + SEL);
await q('mes pasado 2026-09', B('2026-09-01T00:00:00.000', ` and fecha_de_firma < '2026-10-01T00:00:00.000'`) + SEL);
await q('30 dias', B('2026-09-02T00:00:00.000') + SEL);
await q('90 dias', B('2026-07-04T00:00:00.000') + SEL);
await q('2026 YTD', B('2026-01-01T00:00:00.000') + SEL);

console.log('\n=== FACETS (last 12 months) for the filter dropdowns ===');
const W = `fecha_de_firma >= '2025-10-02T00:00:00.000' and ${cat}`;
const deps = await q('departamento', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('departamento, count(1) as n') + '&$group=' + encodeURIComponent('departamento') + '&$order=' + encodeURIComponent('n desc') + '&$limit=40');
if (deps) console.log('   ' + deps.map(d => `${d.departamento}=${d.n}`).join(' | '));

const est = await q('estado_contrato', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('estado_contrato, count(1) as n') + '&$group=' + encodeURIComponent('estado_contrato') + '&$order=' + encodeURIComponent('n desc') + '&$limit=30');
if (est) console.log('   ' + est.map(d => `${d.estado_contrato}=${d.n}`).join(' | '));

const mod = await q('modalidad_de_contratacion', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('modalidad_de_contratacion, count(1) as n') + '&$group=' + encodeURIComponent('modalidad_de_contratacion') + '&$order=' + encodeURIComponent('n desc') + '&$limit=20');
if (mod) console.log('   ' + mod.map(d => `${d.modalidad_de_contratacion}=${d.n}`).join(' | '));

const ciu = await q('ciudad top 25', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('ciudad, count(1) as n') + '&$group=' + encodeURIComponent('ciudad') + '&$order=' + encodeURIComponent('n desc') + '&$limit=25');
if (ciu) console.log('   ' + ciu.map(d => `${d.ciudad}=${d.n}`).join(' | '));

console.log('\n=== KPI: top entidad + valor range ===');
const ent = await q('top entidades por valor', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('nombre_entidad, sum(valor_del_contrato) as v, count(1) as n') + '&$group=' + encodeURIComponent('nombre_entidad') + '&$order=' + encodeURIComponent('v desc') + '&$limit=8');
if (ent) for (const e of ent) console.log(`   ${(e.nombre_entidad||'').slice(0,55)} | n=${e.n} | sum=${e.v}`);

const mx = await q('valor max/min in 12m', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('max(valor_del_contrato) as mx, min(valor_del_contrato) as mn, avg(valor_del_contrato) as av'));
if (mx) console.log('   ' + JSON.stringify(mx));

console.log('\n=== does codigo have non-V1 prefixes? (sampling matching rows) ===');
const pref = await q('codes present in filtered set', '$where=' + encodeURIComponent(W) + '&$select=' + encodeURIComponent('codigo_de_categoria_principal, count(1) as n') + '&$group=' + encodeURIComponent('codigo_de_categoria_principal') + '&$order=' + encodeURIComponent('n desc') + '&$limit=30');
if (pref) console.log('   ' + pref.map(p => `${p.codigo_de_categoria_principal}=${p.n}`).join(' | '));

console.log('\n=== urlproceso + numeric field shapes (one full row) ===');
const one = await q('one row, raw', '$where=' + encodeURIComponent(W) + '&$limit=1');
if (one && one[0]) {
  console.log('   urlproceso     =', JSON.stringify(one[0].urlproceso));
  console.log('   valor_del_contrato =', JSON.stringify(one[0].valor_del_contrato), typeof one[0].valor_del_contrato);
  console.log('   saldo_cdp      =', JSON.stringify(one[0].saldo_cdp));
  console.log('   valor_pagado   =', JSON.stringify(one[0].valor_pagado));
  console.log('   valor_facturado=', JSON.stringify(one[0].valor_facturado));
  console.log('   orden          =', JSON.stringify(one[0].orden));
  console.log('   sector         =', JSON.stringify(one[0].sector));
  console.log('   id_contrato    =', JSON.stringify(one[0].id_contrato));
}
