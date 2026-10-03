/**
 * ¿Se puede distinguir «convocado» de «adjudicado» dentro de la vista de contratos
 * jbjy-vk9h, o hace falta la vista de procesos de contratación?
 *
 * Se comprueban tres cosas:
 *  1. Qué valores toma `estado_contrato` (¿existe alguno de convocatoria?).
 *  2. Si hay filas sin proveedor adjudicado o sin fecha de firma (candidatas a
 *     «convocado»).
 *  3. Si existe la vista de procesos de SECOP II y qué campos ofrece.
 */
const CONTRATOS = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';

const CATS = ['53111500', '53111600', '53111900', '53111800', '53102700', '53101500', '53101600', '53101800', '53102400', '53102500', '46181500', '46181700', '46181800', '46181900', '46182000', '46182100'];
const KWS = ['DOTACION', 'DOTACIÓN', 'INSUMOS', 'UNIFORMES', 'CALZADO', 'VESTUARIO', 'ELEMENTOS DE PROTECCION', 'ELEMENTOS DE PROTECCIÓN', 'OVEROLES', 'EPP'];
const CAT = '(' + CATS.map((c) => `codigo_de_categoria_principal like '%${c}%'`).join(' or ') + ')';
const KW = '(' + KWS.flatMap((k) => ['objeto_del_contrato', 'descripcion_del_proceso'].map((f) => `upper(${f}) like '%${k}%'`)).join(' or ') + ')';

const TO = new Date().toISOString().slice(0, 10);
const FROM = new Date(Date.parse(`${TO}T12:00:00Z`) - 729 * 86_400_000).toISOString().slice(0, 10);
const WINDOW = `fecha_de_firma >= '${FROM}T00:00:00.000' and fecha_de_firma <= '${TO}T23:59:59.999'`;

async function slice(label, base, { select, where, group, order, limit = 50 }, ms = 150000) {
  const params = new URLSearchParams();
  params.set('$select', select);
  const clauses = [base, where].filter(Boolean);
  if (clauses.length) params.set('$where', clauses.join(' and '));
  if (group) params.set('$group', group);
  if (order) params.set('$order', order);
  params.set('$limit', String(limit));
  const url = `${CONTRATOS}?${params}`;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const dt = Date.now() - t0;
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      console.log(`  ${label.padEnd(52)} FALLO ${dt}ms ${String(b.message || res.status).slice(0, 70)}`);
      return null;
    }
    const rows = await res.json();
    console.log(`  ${label.padEnd(52)} ok ${String(dt).padStart(6)}ms  ${rows.length} filas`);
    return rows;
  } catch (e) {
    console.log(`  ${label.padEnd(52)} ${e.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'} ${Date.now() - t0}ms`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

console.log('\n########## 1) Valores de estado_contrato ##########');
console.log('\n-- dentro del filtro de negocio (2 años, estricto) --');
const estadosNegocio = await slice('group by estado_contrato', `${WINDOW} and ${CAT} and ${KW}`, {
  select: 'estado_contrato, count(1) as n',
  group: 'estado_contrato',
  order: 'n desc',
});
if (estadosNegocio) for (const r of estadosNegocio) console.log(`       ${String(r.estado_contrato).padEnd(22)} ${r.n}`);

console.log('\n-- todas las ventas de 2 años (sin filtro de negocio), para ver el universo de estados --');
const estadosTodos = await slice('group by estado_contrato (sin filtro negocio)', WINDOW, {
  select: 'estado_contrato, count(1) as n',
  group: 'estado_contrato',
  order: 'n desc',
});
if (estadosTodos) for (const r of estadosTodos) console.log(`       ${String(r.estado_contrato).padEnd(22)} ${r.n}`);

console.log('\n########## 2) ¿Hay filas sin proveedor adjudicado o sin firma? ##########');
const SCOPE = `${WINDOW} and ${CAT} and ${KW}`;
const conProv = await slice('con proveedor_adjudicado no vacío', SCOPE, {
  select: 'count(1) as n',
  where: "proveedor_adjudicado is not null and proveedor_adjudicado != 'No Definido'",
});
if (conProv) console.log(`       con proveedor: ${conProv[0].n}`);
const sinProv = await slice('sin proveedor_adjudicado', SCOPE, {
  select: 'count(1) as n',
  where: "(proveedor_adjudicado is null or proveedor_adjudicado = 'No Definido')",
});
if (sinProv) console.log(`       sin proveedor: ${sinProv[0].n}`);
const sinFirma = await slice('sin fecha_de_firma', SCOPE, {
  select: 'count(1) as n',
  where: 'fecha_de_firma is null',
});
if (sinFirma) console.log(`       sin fecha de firma: ${sinFirma[0].n}`);

console.log('\n-- ¿coinciden los estados con tener proveedor? (cruce) --');
const cruce = await slice('estado x tiene_proveedor (muestra)', SCOPE, {
  select: 'estado_contrato, proveedor_adjudicado, id_contrato, fecha_de_firma',
  order: 'estado_contrato asc',
  limit: 40,
});
if (cruce) {
  const porEstado = {};
  for (const r of cruce) {
    const e = r.estado_contrato || '(vacío)';
    porEstado[e] = porEstado[e] || { total: 0, conProv: 0, sinFirma: 0 };
    porEstado[e].total += 1;
    if (r.proveedor_adjudicado && r.proveedor_adjudicado !== 'No Definido') porEstado[e].conProv += 1;
    if (!r.fecha_de_firma) porEstado[e].sinFirma += 1;
  }
  for (const [e, v] of Object.entries(porEstado)) {
    console.log(`       ${e.padEnd(22)} muestra=${v.total}  conProveedor=${v.conProv}  sinFirma=${v.sinFirma}`);
  }
}

console.log('\n########## 3) ¿Existe la vista de PROCESOS de contratación? ##########');
// p6dx-8zbt es el identificador tradicional de «SECOP II - Procesos de Contratación».
for (const id of ['p6dx-8zbt', 'rpmr-utcd']) {
  const url = `https://www.datos.gov.co/resource/${id}.json?$limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`  ${id}: HTTP ${res.status} (no disponible)`);
      continue;
    }
    const rows = await res.json();
    console.log(`\n  ${id}: DISPONIBLE — ${Object.keys(rows[0] || {}).length} campos`);
    const keys = Object.keys(rows[0] || {}).sort();
    const relevantes = keys.filter((k) => /estado|adjudic|precio|valor|entidad|unspsc|categoria|objeto|descripcion|fecha|proveedor|modalidad|referencia|url/i.test(k));
    console.log('  Campos relevantes:');
    for (const k of relevantes) {
      const v = rows[0][k];
      console.log(`    ${k.padEnd(46)} = ${JSON.stringify(v)?.slice(0, 60)}`);
    }
  } catch (e) {
    console.log(`  ${id}: ERROR ${e.message}`);
  }
}
