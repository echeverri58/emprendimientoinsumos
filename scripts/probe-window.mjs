// How wide a date window can the strict business filter answer before Socrata times out?
const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const CATS = ['53111500','53111600','53111900','53111800','53102700','53101500','53101600','53101800','53102400','53102500','46181500','46181700','46181800','46181900','46182000','46182100'];
const KWS = ['DOTACION','DOTACIÓN','INSUMOS','UNIFORMES','CALZADO','VESTUARIO','ELEMENTOS DE PROTECCION','ELEMENTOS DE PROTECCIÓN','OVEROLES','EPP'];
const CAT = '(' + CATS.map((c) => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';
const KW = '(' + KWS.flatMap((k) => ['objeto_del_contrato', 'descripcion_del_proceso'].map((f) => `upper(${f}) like '%${k}%'`)).join(' or ') + ')';
const SCOPE = `${CAT} and ${KW}`;
const TO = '2026-10-02';

async function timed(label, days, ms = 120000) {
  const from = new Date(Date.parse(`${TO}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const where = `fecha_de_firma >= '${from}T00:00:00.000' and fecha_de_firma <= '${TO}T23:59:59.999' and ${SCOPE}`;
  const url = `${BASE}?$select=${encodeURIComponent('count(1) as n, sum(valor_del_contrato) as v')}&$where=${encodeURIComponent(where)}&$limit=1`;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const dt = Date.now() - t0;
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      console.log(`  ${label.padEnd(22)} FAIL ${dt}ms  ${String(b.message || res.status).slice(0, 90)}`);
      return;
    }
    const rows = await res.json();
    console.log(`  ${label.padEnd(22)} ok   ${String(dt).padStart(7)}ms  n=${rows[0].n}  valor=${rows[0].v}`);
  } catch (e) {
    console.log(`  ${label.padEnd(22)} TIMEOUT/ERR ${Date.now() - t0}ms (${e.name})`);
  } finally {
    clearTimeout(timer);
  }
}

console.log('strict filter (16 UNSPSC like-ORs AND 20 keyword like-ORs), counting + summing:\n');
for (const [label, days] of [['30 días', 30], ['90 días', 90], ['180 días', 180], ['365 días', 365], ['730 días (2 años)', 730], ['1095 días (3 años)', 1095], ['1825 días (5 años)', 1825]]) {
  await timed(label, days);
}

console.log('\npage query ($limit=25, ordered) at each width:\n');
for (const [label, days] of [['90 días', 90], ['365 días', 365], ['730 días', 730], ['1095 días', 1095]]) {
  const from = new Date(Date.parse(`${TO}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const where = `fecha_de_firma >= '${from}T00:00:00.000' and fecha_de_firma <= '${TO}T23:59:59.999' and ${SCOPE}`;
  const url = `${BASE}?$select=${encodeURIComponent('id_contrato,fecha_de_firma,valor_del_contrato')}&$where=${encodeURIComponent(where)}&$order=${encodeURIComponent('fecha_de_firma desc, id_contrato asc')}&$limit=25`;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const dt = Date.now() - t0;
    const rows = res.ok ? await res.json() : [];
    console.log(`  ${label.padEnd(22)} ${res.ok ? 'ok  ' : 'FAIL'} ${String(dt).padStart(7)}ms  rows=${rows.length}`);
  } catch (e) {
    console.log(`  ${label.padEnd(22)} TIMEOUT/ERR ${Date.now() - t0}ms`);
  } finally {
    clearTimeout(timer);
  }
}
