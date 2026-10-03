const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const W = "fecha_de_firma >= '2026-07-04T00:00:00.000'";

async function q(label, where) {
  const url = `${BASE}?$select=${encodeURIComponent('count(1) as n')}&$where=${encodeURIComponent(where)}&$limit=1`;
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) console.log(`  FAIL ${label} -> ${String(body.message || res.status).slice(0, 100)}`);
    else console.log(`  ok   ${label} -> ${JSON.stringify(body[0])}`);
  } catch (e) {
    console.log(`  ERR  ${label} ${e.message}`);
  }
}

console.log('--- does "_" act as a single-char wildcard in SoQL like? ---');
await q('objeto like %DOTACION%', `${W} and upper(objeto_del_contrato) like '%DOTACION%'`);
await q('objeto like %DOTACIÓN%', `${W} and upper(objeto_del_contrato) like '%DOTACIÓN%'`);
await q('objeto like %D_TACION%  (1 underscore)', `${W} and upper(objeto_del_contrato) like '%D_TACION%'`);
await q('objeto like %D_TACI_N%  (2 underscores)', `${W} and upper(objeto_del_contrato) like '%D_TACI_N%'`);
await q('descripcion like %D_TACION%', `${W} and upper(descripcion_del_proceso) like '%D_TACION%'`);
await q('objeto like %DOTACI_N%', `${W} and upper(objeto_del_contrato) like '%DOTACI_N%'`);

console.log('\n--- nit_entidad typing (numeric, so no upper/coalesce/like) ---');
await q('nit_entidad = 891855017 (known NIT)', `${W} and nit_entidad = 891855017`);
await q('nit_entidad like text op', `${W} and nit_entidad like '%900%'`);
await q('nit_entidad > 0', `${W} and nit_entidad > 0`);

console.log('\n--- which other searchable fields reject upper()? (type probe) ---');
const fields = ['nombre_entidad', 'proveedor_adjudicado', 'objeto_del_contrato', 'descripcion_del_proceso', 'id_contrato', 'referencia_del_contrato', 'proceso_de_compra', 'documento_proveedor', 'ciudad', 'departamento', 'codigo_de_categoria_principal', 'nit_entidad', 'codigo_entidad', 'codigo_proveedor'];
for (const f of fields) {
  await q(`upper(${f})`, `${W} and upper(${f}) like '%A%'`);
}
