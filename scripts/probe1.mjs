// Recon probe: verify SECOP II dataset jbjy-vk9h through Node (schannel is broken in this env)
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';

async function q(label, params) {
  const url = BASE + (params ? '?' + params : '');
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const t = await res.text();
      console.log(`\n### ${label}\n  HTTP ${res.status} -> ${t.slice(0, 400)}`);
      return null;
    }
    const data = await res.json();
    console.log(`\n### ${label}\n  OK rows=${Array.isArray(data) ? data.length : 'obj'}`);
    return data;
  } catch (e) {
    console.log(`\n### ${label}\n  ERR ${e.message} ${e.cause ? e.cause.message : ''}`);
    return null;
  }
}

// 1) What columns actually exist?
const sample = await q('sample 1 row (all fields)', '$limit=1');
if (sample && sample[0]) {
  const keys = Object.keys(sample[0]).sort();
  console.log(`  total fields = ${keys.length}`);
  console.log('  FIELDS:');
  for (const k of keys) console.log(`    ${k} = ${JSON.stringify(sample[0][k])}`);
}

// 2) Total row count of the whole dataset
const cnt = await q('count(*) whole dataset', '$select=count(1)');
if (cnt) console.log('  total =', JSON.stringify(cnt));

// 3) The requested business filter, exactly as specified
const CATS = ['53111500','53111600','53111900','53111800','53102700','53101500','53101600','53101800','53102400','53102500','46181500','46181700','46181800','46181900','46182000','46182100'];
const catIn = CATS.map(c => `'${c}'`).join(',');
const KW = ['DOTACION','DOTACIÓN','INSUMOS','UNIFORMES','CALZADO','VESTUARIO','ELEMENTOS DE PROTECCION','OVEROLES','EPP'];
const kwOr = KW.map(k => `upper(coalesce(objeto_del_contrato,'')) like '%${k}%' or upper(coalesce(descripcion_del_proceso,'')) like '%${k}%'`).join(' or ');

const sql = `select count(1) as n where codigo_de_categoria_principal in (${catIn}) and (${kwOr})`;
const filtered = await q('count with UNSPSC AND keyword filter', '$query=' + encodeURIComponent(sql));
if (filtered) console.log('  filtered =', JSON.stringify(filtered));

// 4) Keyword-only count (to see how much the UNSPSC restriction removes)
const kwOnly = await q('count keyword-only', '$query=' + encodeURIComponent(`select count(1) as n where (${kwOr})`));
if (kwOnly) console.log('  keyword only =', JSON.stringify(kwOnly));

// 5) Relevance check: are the matched records actually dotacion/insumos?
const rel = `select fecha_de_firma,nombre_entidad,departamento,objeto_del_contrato,valor_del_contrato,estado_contrato,codigo_de_categoria_principal order by fecha_de_firma desc limit 12`;
const rows = await q('latest 12 filtered records', '$query=' + encodeURIComponent(
  `select fecha_de_firma,nombre_entidad,departamento,objeto_del_contrato,valor_del_contrato,estado_contrato,codigo_de_categoria_principal where codigo_de_categoria_principal in (${catIn}) and (${kwOr}) order by fecha_de_firma desc limit 12`
));
if (rows) for (const r of rows) {
  console.log(`  - [${(r.fecha_de_firma||'').slice(0,10)}] ${(r.nombre_entidad||'').slice(0,45)} | ${(r.departamento||'').slice(0,18)} | UNSPSC=${r.codigo_de_categoria_principal} | $${r.valor_del_contrato} | ${(r.objeto_del_contrato||'').slice(0,70)}`);
}

// 6) Facets we need for dropdowns: distinct departamento + estado
const deps = await q('distinct departamento (top 40)', '$query=' + encodeURIComponent('select departamento, count(1) as n group by departamento order by n desc limit 40'));
if (deps) console.log('  deps =', deps.map(d => `${d.departamento}(${d.n})`).join(', '));
const est = await q('distinct estado_contrato', '$query=' + encodeURIComponent('select estado_contrato, count(1) as n group by estado_contrato order by n desc limit 30'));
if (est) console.log('  estados =', est.map(d => `${d.estado_contrato}(${d.n})`).join(', '));

// 7) Full field list from a filtered row (confirm modal fields exist)
if (rows && rows[0]) {
  const full = await q('one full filtered record (for modal fields)', '$query=' + encodeURIComponent(
    `select * where codigo_de_categoria_principal in (${catIn}) and (${kwOr}) limit 1`
  ));
  if (full && full[0]) {
    console.log('  FULL FILTERED FIELDS:');
    for (const k of Object.keys(full[0]).sort()) console.log(`    ${k} = ${JSON.stringify(full[0][k]).slice(0,120)}`);
  }
}
