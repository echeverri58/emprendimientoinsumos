/**
 * Sondeo de la vista de PROCESOS de contratación de SECOP II (p6dx-8zbt), que es
 * donde viven los procesos «convocados». La vista de contratos jbjy-vk9h no los
 * contiene: todos sus registros tienen proveedor adjudicado y fecha de firma.
 */
const PROC = 'https://www.datos.gov.co/resource/p6dx-8zbt.json';
const TO = new Date().toISOString().slice(0, 10);
const FROM = new Date(Date.parse(`${TO}T12:00:00Z`) - 729 * 86_400_000).toISOString().slice(0, 10);

async function q(label, params, ms = 150000) {
  const url = `${PROC}?${new URLSearchParams(params)}`;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const dt = Date.now() - t0;
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      console.log(`  ${label.padEnd(50)} FALLO ${dt}ms ${String(b.message || res.status).slice(0, 80)}`);
      return null;
    }
    const rows = await res.json();
    console.log(`  ${label.padEnd(50)} ok ${String(dt).padStart(6)}ms  ${rows.length} filas`);
    return rows;
  } catch (e) {
    console.log(`  ${label.padEnd(50)} ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'} ${Date.now() - t0}ms`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

console.log('\n########## Campos completos de p6dx-8zbt ##########');
const sample = await q('muestra de 1 fila', { $limit: '1' });
if (sample?.[0]) {
  const keys = Object.keys(sample[0]).sort();
  console.log(`  ${keys.length} campos:\n`);
  for (const k of keys) {
    const v = sample[0][k];
    const isUrl = v && typeof v === 'object';
    console.log(`    ${k.padEnd(46)} ${String(typeof v).padEnd(7)} ${JSON.stringify(v)?.slice(0, 52)}`);
  }
}

console.log('\n########## Volumen total ##########');
const total = await q('count(1) del dataset', { $select: 'count(1) as n', $limit: '1' });
if (total) console.log(`  total de procesos: ${Number(total[0].n).toLocaleString('es-CO')}`);

console.log('\n########## Valores de los campos de estado/adjudicación ##########');
for (const campo of ['adjudicado', 'id_adjudicacion', 'estado_del_procedimiento', 'estado_resumen', 'estado_de_apertura_del_proceso']) {
  const rows = await q(`group by ${campo}`, {
    $select: `${campo}, count(1) as n`,
    $group: campo,
    $order: 'n desc',
    $limit: '25',
  });
  if (rows) console.log(`       ${rows.map((r) => `${JSON.stringify(r[campo])}=${r.n}`).join('  ')}`);
  await new Promise((r) => setTimeout(r, 800));
}

console.log('\n########## ¿El filtro de negocio funciona aquí? ##########');
const CATS = ['53111500', '53111600', '53111900', '53111800', '53102700', '53101500', '53101600', '53101800', '53102400', '53102500', '46181500', '46181700', '46181800', '46181900', '46182000', '46182100'];
const CAT = '(' + CATS.map((c) => `codigo_principal_de_categoria like '%${c}%'`).join(' or ') + ')';
const DATE = `fecha_de_publicacion_del >= '${FROM}T00:00:00.000' and fecha_de_publicacion_del <= '${TO}T23:59:59.999'`;

// Hay que averiguar cuál es el campo de texto del objeto del proceso.
const posiblesTexto = ['descripci_n_del_procedimiento', 'descripcion_del_procedimiento', 'nombre_del_procedimiento', 'objeto_del_proceso', 'descripcion_del_proceso', 'objeto_a_contratar'];
console.log('\n-- ¿qué campo contiene el texto del proceso? --');
for (const campo of posiblesTexto) {
  const rows = await q(`  probar ${campo}`, {
    $select: 'count(1) as n',
    $where: `${DATE} and ${campo} is not null`,
    $limit: '1',
  }, 60000);
  if (rows) console.log(`       -> ${campo} EXISTE (${rows[0].n} filas no nulas)`);
  await new Promise((r) => setTimeout(r, 500));
}

console.log('\n-- coste del filtro de categoría UNSPSC en procesos (2 años) --');
const catOnly = await q('solo categoría UNSPSC, 2 años', {
  $select: 'count(1) as n, sum(precio_base) as v',
  $where: `${DATE} and ${CAT}`,
  $limit: '1',
});

console.log('\n-- coste con categoría Y palabras clave --');
const campoTexto = 'descripci_n_del_procedimiento';
const KWS = ['DOTACION', 'DOTACIÓN', 'INSUMOS', 'UNIFORMES', 'CALZADO', 'VESTUARIO', 'ELEMENTOS DE PROTECCION', 'ELEMENTOS DE PROTECCIÓN', 'OVEROLES', 'EPP'];
const KW = '(' + KWS.map((k) => `upper(${campoTexto}) like '%${k}%'`).join(' or ') + ')';
await q('categoría Y texto, 2 años', {
  $select: 'count(1) as n, sum(precio_base) as v',
  $where: `${DATE} and ${CAT} and ${KW}`,
  $limit: '1',
});

console.log('\n-- convocados = procesos NO adjudicados --');
await q('categoría Y texto Y adjudicado=No', {
  $select: 'count(1) as n',
  $where: `${DATE} and ${CAT} and ${KW} and adjudicado = 'No'`,
  $limit: '1',
});
await q('categoría Y texto Y adjudicado=Si', {
  $select: 'count(1) as n',
  $where: `${DATE} and ${CAT} and ${KW} and adjudicado = 'Si'`,
  $limit: '1',
});
