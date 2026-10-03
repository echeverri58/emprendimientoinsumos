// Isolate the "Type mismatch for coalesce" error raised by the free-text clause.
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const W = `fecha_de_firma >= '2026-07-04T00:00:00.000' and fecha_de_firma <= '2026-10-02T23:59:59.999'`;

async function t(label, where, select = 'count(1) as n') {
  const url = `${BASE}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$limit=1`;
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    const dt = Date.now() - t0;
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      console.log(`  FAIL [${dt}ms] ${label}\n        ${String(b.message || res.status).slice(0, 200)}`);
      return null;
    }
    const rows = await res.json();
    console.log(`  ok   [${dt}ms] ${label} -> ${JSON.stringify(rows[0]).slice(0, 120)}`);
    return rows;
  } catch (e) {
    console.log(`  ERR  ${label}: ${e.message}`);
    return null;
  }
}

const CAT = '(' + ['53111500','53111600','53111900','53111800','53102700','53101500','53101600','53101800','53102400','53102500','46181500','46181700','46181800','46181900','46182000','46182100'].map(c => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';

// Server's keyword clause shape (coalesce + upper, both accent variants)
const KW_SERVER = `(upper(coalesce(objeto_del_contrato,'')) like '%DOTACION%' or upper(coalesce(objeto_del_contrato,'')) like '%DOTACIÓN%' or upper(coalesce(descripcion_del_proceso,'')) like '%DOTACION%' or upper(coalesce(descripcion_del_proceso,'')) like '%DOTACIÓN%' or upper(coalesce(objeto_del_contrato,'')) like '%INSUMOS%' or upper(coalesce(descripcion_del_proceso,'')) like '%INSUMOS%')`;
const KW_NOCE = `(upper(objeto_del_contrato) like '%DOTACION%' or upper(descripcion_del_proceso) like '%DOTACION%')`;

// Free-text clause shape: coalesce + upper over 11 fields
const FT_FIELDS = ['nombre_entidad','proveedor_adjudicado','objeto_del_contrato','descripcion_del_proceso','id_contrato','referencia_del_contrato','proceso_de_compra','nit_entidad','documento_proveedor','ciudad','departamento'];
const ft = (pat, fields = FT_FIELDS, useCoalesce = true) =>
  '(' + fields.map(f => `upper(${useCoalesce ? `coalesce(${f},'')` : f}) like '%${pat}%'`).join(' or ') + ')';

console.log('--- 1) each clause alone ---');
await t('date only', W);
await t('category only', `${W} and ${CAT}`);
await t('KW with coalesce (server shape)', `${W} and ${KW_SERVER}`);
await t('KW without coalesce', `${W} and ${KW_NOCE}`);
await t('freeText coalesce, 1 field', `${W} and ${ft('DOTACION', ['objeto_del_contrato'])}`);
await t('freeText no coalesce, 1 field', `${W} and ${ft('DOTACION', ['objeto_del_contrato'], false)}`);
await t('freeText coalesce, ALL 11 fields', `${W} and ${ft('DOTACION')}`);
await t('freeText no coalesce, ALL 11 fields', `${W} and ${ft('DOTACION', FT_FIELDS, false)}`);

console.log('\n--- 2) is a specific field the problem? (one field at a time, coalesce) ---');
for (const f of FT_FIELDS) {
  await t(`  field=${f}`, `${W} and ${ft('DOTACION', [f])}`);
}

console.log('\n--- 3) is it the _ wildcard variant? ---');
await t('pattern with _ (D_TACION) coalesce', `${W} and ${ft('D_TACION')}`);
await t('pattern with _ (D_TACION) NO coalesce', `${W} and ${ft('D_TACION', FT_FIELDS, false)}`);

console.log('\n--- 4) combinations ---');
await t('category + KW', `${W} and ${CAT} and ${KW_SERVER}`);
await t('category + freeText', `${W} and ${CAT} and ${ft('DOTACION')}`);
await t('KW + freeText', `${W} and ${KW_SERVER} and ${ft('DOTACION')}`);
await t('category + KW + freeText', `${W} and ${CAT} and ${KW_SERVER} and ${ft('DOTACION')}`);

console.log('\n--- 5) does adding the aggregate select break it? ---');
await t('category + KW + freeText + SUM select', `${W} and ${CAT} and ${KW_SERVER} and ${ft('DOTACION')}`,
  'count(1) as n, sum(valor_del_contrato) as valor, avg(valor_del_contrato) as promedio, max(valor_del_contrato) as maximo');

console.log('\n--- 6) keyword clause with the FULL default keyword list (10 keywords, both accents) ---');
const KWS = ['DOTACION','DOTACIÓN','INSUMOS','UNIFORMES','CALZADO','VESTUARIO','ELEMENTOS DE PROTECCION','ELEMENTOS DE PROTECCIÓN','OVEROLES','EPP'];
const kwFull = '(' + KWS.flatMap(k => ['objeto_del_contrato','descripcion_del_proceso'].map(f => `upper(coalesce(${f},'')) like '%${k}%'`)).join(' or ') + ')';
await t('full 10-keyword clause', `${W} and ${kwFull}`);
await t('full 10-keyword + category', `${W} and ${CAT} and ${kwFull}`);
