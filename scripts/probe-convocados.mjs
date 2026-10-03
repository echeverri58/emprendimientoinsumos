/** Volúmenes reales de «convocados» (procesos sin adjudicar) frente a «adjudicados». */
const PROC = 'https://www.datos.gov.co/resource/p6dx-8zbt.json';
const TO = new Date().toISOString().slice(0, 10);
const desde = (d) => new Date(Date.parse(`${TO}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);

const CATS = ['53111500', '53111600', '53111900', '53111800', '53102700', '53101500', '53101600', '53101800', '53102400', '53102500', '46181500', '46181700', '46181800', '46181900', '46182000', '46182100'];
const KWS = ['DOTACION', 'DOTACIÓN', 'INSUMOS', 'UNIFORMES', 'CALZADO', 'VESTUARIO', 'ELEMENTOS DE PROTECCION', 'ELEMENTOS DE PROTECCIÓN', 'OVEROLES', 'EPP'];
const CAT = '(' + CATS.map((c) => `codigo_principal_de_categoria like '%${c}%'`).join(' or ') + ')';
const TEXTO = '(upper(descripci_n_del_procedimiento) like %P% or upper(nombre_del_procedimiento) like %P%)';
const KW = '(' + KWS.map((k) => TEXTO.replaceAll('%P%', `'%${k}%'`)).join(' or ') + ')';

async function run(label, where, ms = 90000) {
  const params = new URLSearchParams({
    $select: 'count(1) as n, sum(precio_base) as base, sum(valor_total_adjudicacion) as adjudicado',
    $where: where,
    $limit: '1',
  });
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(`${PROC}?${params}`, { signal: ac.signal });
    const dt = Date.now() - t0;
    const rows = await res.json();
    if (!res.ok) { console.log(`  ${label.padEnd(52)} FALLO ${String(rows.message || res.status).slice(0, 60)}`); return; }
    const n = Number(rows[0].n);
    console.log(
      `  ${label.padEnd(52)} n=${String(n).padStart(6)}  base=${Number(rows[0].base || 0).toLocaleString('es-CO').padStart(20)}  ${dt}ms`,
    );
  } catch (e) {
    console.log(`  ${label.padEnd(52)} ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'} ${Date.now() - t0}ms`);
  } finally { clearTimeout(timer); }
}

console.log('\n=== PROCESOS (p6dx-8zbt) con el filtro de negocio (UNSPSC + texto) ===\n');
for (const [etiqueta, dias] of [['180 días', 180], ['365 días', 365], ['730 días (2 años)', 730]]) {
  const d = `fecha_de_publicacion_del >= '${desde(dias)}T00:00:00.000' and fecha_de_publicacion_del <= '${TO}T23:59:59.999'`;
  console.log(`-- ${etiqueta} --`);
  await run('  todos los procesos del negocio', `${d} and ${CAT} and ${KW}`);
  await new Promise((r) => setTimeout(r, 1200));
  await run('  CONVOCADOS (adjudicado = No)', `${d} and ${CAT} and ${KW} and adjudicado = 'No'`);
  await new Promise((r) => setTimeout(r, 1200));
  await run('  adjudicado = Si', `${d} and ${CAT} and ${KW} and adjudicado = 'Si'`);
  await new Promise((r) => setTimeout(r, 1200));
  await run('  convocatoria ABIERTA (No + apertura Abierto)', `${d} and ${CAT} and ${KW} and adjudicado = 'No' and estado_de_apertura_del_proceso = 'Abierto'`);
  await new Promise((r) => setTimeout(r, 1200));
  console.log('');
}

console.log('\n=== Qué estados tienen los CONVOCADOS (2 años, filtro de negocio) ===\n');
const d730 = `fecha_de_publicacion_del >= '${desde(730)}T00:00:00.000' and fecha_de_publicacion_del <= '${TO}T23:59:59.999'`;
for (const campo of ['estado_del_procedimiento', 'estado_resumen']) {
  const params = new URLSearchParams({
    $select: `${campo}, count(1) as n`,
    $where: `${d730} and ${CAT} and ${KW} and adjudicado = 'No'`,
    $group: campo,
    $order: 'n desc',
    $limit: '15',
  });
  const res = await fetch(`${PROC}?${params}`);
  if (res.ok) {
    const rows = await res.json();
    console.log(`  ${campo}:`);
    for (const r of rows) console.log(`     ${String(r[campo]).padEnd(40)} ${r.n}`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
