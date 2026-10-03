// End-to-end smoke test of the local API (curl/schannel is broken in this env, so use Node fetch).
const BASE = 'http://127.0.0.1:3001';

let pass = 0;
let fail = 0;

// This suite deliberately exercises many uncached upstream queries. Without an
// app token Socrata throttles by IP, so pace the expensive sections instead of
// measuring our own throttling.
const pause = (ms = 2500) => new Promise((r) => setTimeout(r, ms));

async function hit(label, path, { expect = 200, check } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path);
    const ms = Date.now() - t0;
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('json') ? await res.json() : await res.text();
    const expected = Array.isArray(expect) ? expect : [expect];
    const okStatus = expected.includes(res.status);
    let okCheck = true;
    let note = '';
    if (check) {
      try {
        const r = check(body, res);
        // A string return is a failure message; any other falsy value fails too.
        if (typeof r === 'string') { okCheck = false; note = r; }
        else okCheck = Boolean(r);
      } catch (e) { okCheck = false; note = `check threw: ${e.message}`; }
    }
    const ok = okStatus && okCheck;
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${String(ms).padStart(6)}ms] ${label}`);
    if (!ok) console.log(`        status=${res.status} (expected ${expect}) ${note}`);
    // Return null on any failure so downstream assertions can guard with `if`.
    return ok ? body : null;
  } catch (e) {
    fail++;
    console.log(`FAIL  ${label}\n        ${e.message}`);
    return null;
  }
}

console.log('=== health ===');
const health = await hit('GET /api/health', '/api/health', {
  check: (b) => b.ok === true && b.socrata.reachable === true ? true : `ok=${b.ok} reachable=${b.socrata && b.socrata.reachable}`,
});
if (health) console.log(`        dataset rows = ${health.socrata.totalRows?.toLocaleString()} | today=${health.today} | token=${health.hasAppToken}`);

console.log('\n=== meta / facets ===');
const meta = await hit('GET /api/meta', '/api/meta', {
  check: (b) => (b.categories?.length === 4 && b.options?.departamentos?.length > 0) || 'missing categories or departamento facets',
});
if (meta) {
  console.log(`        categories=${meta.categories.length} codes=${meta.categories.reduce((a, c) => a + c.codes.length, 0)} keywords=${meta.keywords.required.length}`);
  console.log(`        departamentos=${meta.options.departamentos.length} estados=${meta.options.estados.length} modalidades=${meta.options.modalidades.length}`);
  console.log(`        estados -> ${meta.options.estados.map((e) => e.value).join(' | ')}`);
}

console.log('\n=== contracts (default window) ===');
const list = await hit('GET /api/contracts', '/api/contracts', {
  check: (b) => Array.isArray(b.rows) ? true : 'rows not an array',
});
if (list) {
  console.log(`        total=${list.total} page=${list.page}/${list.totalPages} rows=${list.rows.length}`);
  console.log(`        aggregates: contratos=${list.aggregates.contratos} valorTotal=${list.aggregates.valorTotal}`);
  console.log(`        where: ${String(list.query.where).slice(0, 220)}...`);
  if (list.rows[0]) {
    const r = list.rows[0];
    console.log(`        first row: [${String(r.fechaFirma).slice(0, 10)}] ${r.entidad.nombre} | ${r.entidad.departamento} | ${r.categoria.groupLabel} | ${r.valores.contrato} | ${r.estado.raw}`);
    console.log(`        urlProceso present: ${Boolean(r.urlProceso)} | categoria.code=${r.categoria.code} raw=${r.categoria.rawCode}`);
  }
}

console.log('\n=== sorting + paging stability ===');
const p1 = await hit('page 1 sort valor desc', '/api/contracts?page=1&pageSize=10&sort=valor_del_contrato&dir=desc');
const p2 = await hit('page 2 sort valor desc', '/api/contracts?page=2&pageSize=10&sort=valor_del_contrato&dir=desc', {
  check: () => (p1 ? true : 'no page1'),
});
if (p1 && p2) {
  const ids1 = p1.rows.map((r) => r.id);
  const ids2 = p2.rows.map((r) => r.id);
  const overlap = ids1.filter((id) => ids2.includes(id));
  const vals = p1.rows.map((r) => r.valores.contrato);
  const sortedDesc = vals.every((v, i) => i === 0 || vals[i - 1] >= v);
  console.log(`        ${overlap.length === 0 ? 'PASS' : 'FAIL'}  no page overlap (overlap=${overlap.length})`);
  console.log(`        ${sortedDesc ? 'PASS' : 'FAIL'}  values sorted desc (${vals.slice(0, 3).join(', ')}...)`);
  console.log(`        max value on page1 = ${Math.max(...vals)} vs aggregate max = ${p1.aggregates.valorMaximo}`);
}

console.log('\n=== modos de la regla de negocio (strict / category / keyword) ===');
await pause();
const strict = await hit('scope=strict (2 años completos)', '/api/contracts?scope=strict&pageSize=1');
await pause();
const cat = await hit('scope=category (2 años completos)', '/api/contracts?scope=category&pageSize=1');
await pause();
// El modo de solo texto escanea el dataset entero sin la ayuda de la categoría, así
// que bajo ráfaga puede recibir 502 por throttling; la ventana ya está acotada a 90 días.
const kw = await hit(
  'scope=keyword (ventana recortada a 90 días; 502 tolerado por throttling)',
  '/api/contracts?scope=keyword&pageSize=1',
  {
    expect: [200, 502],
    check: (b) => (b.query ? b.query.filters.scopeMaxWindowDays === 90 || `scopeMaxWindowDays=${b.query.filters.scopeMaxWindowDays}` : undefined),
  },
);
if (strict && cat && kw) {
  console.log(`        strict=${strict.total}  category=${cat.total}  keyword=${kw.total}`);
  console.log(`        ventana keyword: ${kw.query.filters.from} .. ${kw.query.filters.to}`);
  const strictWithinCategory = strict.total <= cat.total;
  strictWithinCategory ? pass++ : fail++;
  console.log(`        ${strictWithinCategory ? 'PASS' : 'FAIL'}  strict <= category (el AND restringe al OR de códigos)`);

  // Sin rango explícito, el modo de solo texto ya usa su propio tope como ventana
  // por defecto, así que no hay nada que recortar: lo que debe cumplirse es que la
  // ventana efectiva nunca supere los 180 días.
  const kwDays = Math.round(
    (Date.parse(kw.query.filters.to) - Date.parse(kw.query.filters.from)) / 86_400_000,
  );
  const withinCap = kwDays <= 180;
  withinCap ? pass++ : fail++;
  console.log(`        ${withinCap ? 'PASS' : 'FAIL'}  la ventana de solo texto no supera los 180 días (${kwDays})`);
}
// El modo «amplio» se retiró por inviable: debe degradar a strict, no fallar.
await pause();
const broadGone = await hit('scope=broad degrada a strict', '/api/contracts?scope=broad&pageSize=1', {
  check: (b) => b.query.filters.scope === 'strict' || `scope=${b.query.filters.scope}`,
});
if (broadGone) {
  console.log(`        scope=broad -> scope efectivo «${broadGone.query.filters.scope}» (modo inviable, retirado)`);
}

console.log('\n=== tipos de registro: adjudicados / convocados / todos ===');
await pause();
const adj = await hit('tipoRegistro=adjudicados', '/api/contracts?tipoRegistro=adjudicados&pageSize=5', {
  check: (b) =>
    (b.rows.every((r) => r.tipoRegistro === 'adjudicado') &&
      b.rows.every((r) => r.entidad.nombre && r.fechaFirma)) ||
    'una fila no es un contrato adjudicado válido',
});
await pause();
const conv = await hit('tipoRegistro=convocados', '/api/contracts?tipoRegistro=convocados&pageSize=5', {
  check: (b) =>
    (b.rows.every((r) => r.tipoRegistro === 'convocado') && b.rows.every((r) => r.adjudicado === false)) ||
    'una fila convocada viene marcada como adjudicada',
});
await pause();
const todo = await hit('tipoRegistro=todos', '/api/contracts?tipoRegistro=todos&pageSize=10', {
  check: (b) => (b.meta?.merged === true ? true : 'el modo combinado no reporta merged=true'),
});

if (adj && conv && todo) {
  console.log(`        adjudicados=${adj.total}  convocados=${conv.total}  combinado=${todo.total}`);
  const suma = adj.total + conv.total;
  const cuadra = suma === todo.total;
  cuadra ? pass++ : fail++;
  console.log(`        ${cuadra ? 'PASS' : 'FAIL'}  la fusión cuadra: ${adj.total} + ${conv.total} = ${todo.total}`);

  const tipos = new Set(todo.rows.map((r) => r.tipoRegistro));
  const mezcla = tipos.has('adjudicado') && tipos.has('convocado');
  mezcla ? pass++ : fail++;
  console.log(`        ${mezcla ? 'PASS' : 'FAIL'}  la primera página combinada trae ambos tipos (${[...tipos].join(', ')})`);

  // Un proceso convocado no tiene ejecución financiera y su valor es el precio base.
  const sinEjecucion = conv.rows.every((r) => r.valores.pagado === 0 && r.valores.saldoCdp === 0);
  sinEjecucion ? pass++ : fail++;
  console.log(`        ${sinEjecucion ? 'PASS' : 'FAIL'}  los convocados no traen ejecución financiera`);
}

await pause();
const metaAdj = await hit('meta de adjudicados', '/api/meta?tipoRegistro=adjudicados', {
  check: (b) => (JSON.stringify(b.options.fuentes) === '["contratos"]' || `fuentes=${JSON.stringify(b.options.fuentes)}`),
});
await pause();
const metaConv = await hit('meta de convocados', '/api/meta?tipoRegistro=convocados', {
  check: (b) => (JSON.stringify(b.options.fuentes) === '["procesos"]' || `fuentes=${JSON.stringify(b.options.fuentes)}`),
});
if (metaAdj && metaConv) {
  const estadosAdj = metaAdj.options.estados.map((e) => e.value);
  const estadosConv = metaConv.options.estados.map((e) => e.value);
  console.log(`        estados adjudicados: ${estadosAdj.slice(0, 4).join(' | ')}`);
  console.log(`        estados convocados : ${estadosConv.slice(0, 4).join(' | ')}`);
  // Los vocabularios son distintos aunque «Suspendido» es legítimamente común a
  // ambas: cada vista debe aportar al menos un estado que la otra no tiene.
  const propiosAdj = estadosAdj.filter((e) => !estadosConv.includes(e));
  const propiosConv = estadosConv.filter((e) => !estadosAdj.includes(e));
  const distintos = propiosAdj.length > 0 && propiosConv.length > 0;
  distintos ? pass++ : fail++;
  console.log(
    `        ${distintos ? 'PASS' : 'FAIL'}  los vocabularios de estado son distintos (adjudicados: ${propiosAdj[0] ?? '—'}, convocados: ${propiosConv[0] ?? '—'})`,
  );
}

await pause();
const detConv = await hit('detalle de un convocado', `/api/contracts/${encodeURIComponent(conv?.rows?.[0]?.id ?? 'X')}?tipoRegistro=convocados`, {
  check: (b) => (b.contract?.proceso ? true : 'el detalle no trae la sección de proceso'),
});
if (detConv) {
  console.log(`        ${detConv.contract.id} | adjudicado=${detConv.contract.adjudicado} | apertura=${detConv.contract.proceso.apertura}`);
}

console.log('\n=== category group filter ===');
const epp = await hit('groups=epp', '/api/contracts?groups=epp&pageSize=5', {
  check: (b) => b.rows.every((r) => r.categoria.groupId === 'epp') || 'returned a non-EPP category',
});
if (epp) console.log(`        epp total=${epp.total} groups=${[...new Set(epp.rows.map((r) => r.categoria.groupLabel))].join(', ')}`);

const calz = await hit('groups=calzado', '/api/contracts?groups=calzado&pageSize=5', {
  check: (b) => b.rows.every((r) => r.categoria.groupId === 'calzado') || 'returned a non-calzado category',
});
if (calz) console.log(`        calzado total=${calz.total} codes=${[...new Set(calz.rows.map((r) => r.categoria.code))].join(', ')}`);

console.log('\n=== free text + accent handling ===');
const t1 = await hit('q=dotacion (no accent)', '/api/contracts?q=dotacion&pageSize=3');
const t2 = await hit('q=DOTACIÓN (accent)', '/api/contracts?q=DOTACI%C3%93N&pageSize=3');
const t3 = await hit('q=medellin (no accent, city)', '/api/contracts?q=medellin&pageSize=3');
const t4 = await hit('q=INPEC (uppercase entity)', '/api/contracts?q=INPEC&pageSize=3');
const t5 = await hit('q=<real NIT> (numeric column)', `/api/contracts?q=${encodeURIComponent(list?.rows?.[0]?.entidad?.nit ?? '900363756')}&pageSize=3`);
const t6 = await hit('q=dotacion uniformes (multi-word)', '/api/contracts?q=dotacion%20uniformes&pageSize=3');
if (t1) console.log(`        q=dotacion  -> ${t1.total}  ${t1.rows[0] ? '| ' + t1.rows[0].objeto.slice(0, 55) : ''}`);
if (t2) console.log(`        q=DOTACIÓN  -> ${t2.total}`);
if (t3) console.log(`        q=medellin  -> ${t3.total} ${t3.rows[0] ? '(' + t3.rows[0].entidad.ciudad + ')' : ''}`);
if (t4) console.log(`        q=INPEC     -> ${t4.total} ${t4.rows[0] ? '(' + t4.rows[0].entidad.nombre + ')' : ''}`);
if (t5) console.log(`        q=NIT       -> ${t5.total} ${t5.rows[0] ? '(' + t5.rows[0].entidad.nombre + ' / NIT ' + t5.rows[0].entidad.nit + ')' : ''}`);
if (t6) console.log(`        q=2 words   -> ${t6.total}`);
// "DOTACION" typed unaccented must also reach rows whose text says "DOTACIÓN".
if (t1 && t2) {
  const consistent = t1.total >= t2.total;
  console.log(`        ${consistent ? 'PASS' : 'FAIL'}  unaccented query is at least as broad as accented (${t1.total} >= ${t2.total})`);
}

console.log('\n=== value range + estado + departamento filters ===');
const big = await hit('minValor=1000000000', '/api/contracts?minValor=1000000000&pageSize=5', {
  check: (b) => b.rows.every((r) => r.valores.contrato >= 1e9) || 'a row is below minValor',
});
if (big) console.log(`        minValor=1e9 -> ${big.total}`);
const small = await hit('maxValor=50000000', '/api/contracts?maxValor=50000000&pageSize=5', {
  check: (b) => b.rows.every((r) => r.valores.contrato <= 5e7) || 'a row exceeds maxValor',
});
if (small) console.log(`        maxValor=5e7 -> ${small.total}`);
const ant = await hit('departamento=Antioquia', '/api/contracts?departamento=Antioquia&pageSize=5', {
  check: (b) => b.rows.every((r) => r.entidad.departamento === 'Antioquia') || 'non-Antioquia row',
});
if (ant) console.log(`        Antioquia -> ${ant.total}`);
const est = await hit('estado=terminado', '/api/contracts?estado=terminado&pageSize=5', {
  check: (b) => b.rows.every((r) => r.estado.raw === 'terminado') || 'non-terminado row',
});
if (est) console.log(`        estado=terminado -> ${est.total}`);
const est2 = await hit('estado=En ejecución', '/api/contracts?estado=En%20ejecuci%C3%B3n&pageSize=5', {
  check: (b) => b.rows.every((r) => r.estado.raw === 'En ejecución') || 'wrong estado',
});
if (est2) console.log(`        estado=En ejecución -> ${est2.total}`);

console.log('\n=== date windows ===');
await pause();
const ytd = await hit('2026 YTD', '/api/contracts?from=2026-01-01&to=2026-10-02&pageSize=1');
if (ytd) console.log(`        2026 YTD -> ${ytd.total} (probe3 measured 370 with a 9-keyword strict AND)`);
await pause();
const lastMonth = await hit('septiembre 2026', '/api/contracts?from=2026-09-01&to=2026-09-30&pageSize=1');
if (lastMonth) console.log(`        sep-2026 -> ${lastMonth.total} (probe3 measured 51)`);
await pause(6000);
const overWide = await hit(
  'over-wide window clamps to maxWindowDays (502 tolerated: unauthenticated Socrata throttles under load)',
  '/api/contracts?from=1900-01-01&to=2030-01-01&pageSize=1',
  { expect: [200, 502] },
);
if (overWide?.query?.filters) {
  const a = Date.parse(overWide.query.filters.from);
  const b = Date.parse(overWide.query.filters.to);
  const days = Math.round((b - a) / 86400000);
  const withinCap = days <= 730;
  withinCap ? pass++ : fail++;
  console.log(`        ${withinCap ? 'PASS' : 'FAIL'}  clamped to ${overWide.query.filters.from} .. ${overWide.query.filters.to} (${days} days, cap 730)`);
}

console.log('\n=== summary / KPIs ===');
const sum = await hit('GET /api/summary', '/api/summary', {
  check: (b) => (b.kpis && Array.isArray(b.series.porMes) && b.series.porMes.length > 0) || 'missing kpis or series',
});
if (sum) {
  const k = sum.kpis;
  console.log(`        contratos=${k.contratos} valorTotal=${k.valorTotal}`);
  console.log(`        hoy=${k.contratosHoy} mes=${k.contratosMes} valorMes=${k.valorMes}`);
  console.log(`        entidadTop=${k.entidadTop?.nombre} (${k.entidadTop?.valor})`);
  console.log(`        deptoTop=${k.departamentoTop?.nombre} (${k.departamentoTop?.contratos})`);
  console.log(`        serie meses=${sum.series.porMes.length} -> ${sum.series.porMes.map((p) => `${p.label}:${p.contratos}`).join(', ')}`);
  console.log(`        categorias=${sum.series.porCategoria.map((c) => `${c.label}:${c.contratos}`).join(', ')}`);
  console.log(`        estados=${sum.series.porEstado.map((c) => `${c.estado}:${c.contratos}`).join(', ')}`);
  console.log(`        partial=${sum.meta.partial} errors=${JSON.stringify(sum.meta.errors)}`);
  const sumTotal = sum.series.porEstado.reduce((a, e) => a + e.contratos, 0);
  console.log(`        ${sumTotal === k.contratos ? 'PASS' : 'FAIL'}  estado series sums to total (${sumTotal} vs ${k.contratos})`);
}

console.log('\n=== detail ===');
if (list && list.rows[0]) {
  const id = list.rows[0].id;
  const det = await hit('GET /api/contracts/:id', `/api/contracts/${encodeURIComponent(id)}`, {
    check: (b) => (b.contract && b.contract.supervisor && b.contract.ordenadorDelGasto) || 'missing detail sections',
  });
  if (det) {
    const c = det.contract;
    console.log(`        id=${c.id}`);
    console.log(`        entidad.nit=${c.entidad.nit} orden=${c.entidad.orden} sector=${c.entidad.sector} rama=${c.entidad.rama}`);
    console.log(`        proveedor.doc=${c.proveedor.documento} tipo=${c.proveedor.tipoDocumento} repLegal=${c.proveedor.representanteLegal}`);
    console.log(`        valores: contrato=${c.valores.contrato} pagado=${c.valores.pagado} facturado=${c.valores.facturado} saldoCdp=${c.valores.saldoCdp}`);
    console.log(`        supervisor=${c.supervisor.nombre} ordenadorGasto=${c.ordenadorDelGasto.nombre}`);
    console.log(`        urlProceso=${c.urlProceso}`);
  }
}
await hit('GET /api/contracts/NOPE -> 404', '/api/contracts/CO1.PCCNTR.DOESNOTEXIST', { expect: 404 });

console.log('\n=== export ===');
const csvRes = await fetch(`${BASE}/api/export.csv?from=2026-01-01&to=2026-10-02`);
// Read raw bytes: fetch().text() strips the UTF-8 BOM, so the BOM must be checked
// on the byte buffer to prove Excel will detect the encoding.
const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
const hasBom = csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf;
const csvText = new TextDecoder('utf-8').decode(csvBytes);
const csvLines = csvText.trim().split(/\r\n/);
const expectedRows = Number(csvRes.headers.get('x-total-rows'));
const csvOk = csvRes.status === 200
  && hasBom
  && csvLines.length === expectedRows + 1
  && csvLines[0].includes('Fecha firma');
csvOk ? pass++ : fail++;
console.log(`${csvOk ? 'PASS' : 'FAIL'}  GET /api/export.csv  status=${csvRes.status} bom=${hasBom} lines=${csvLines.length} (expected ${expectedRows + 1})`);
console.log(`        header: "${csvLines[0]?.slice(0, 90)}..."`);
console.log(`        sample: ${csvLines[1]?.slice(0, 130)}`);
console.log(`        X-Truncated=${csvRes.headers.get('x-truncated')}`);

const jsonRes = await fetch(`${BASE}/api/export.json?from=2026-09-01&to=2026-10-02`);
const jsonBody = await jsonRes.json();
const jsonOk = jsonRes.status === 200 && Array.isArray(jsonBody.contratos) && jsonBody.meta?.filtros;
jsonOk ? pass++ : fail++;
console.log(`${jsonOk ? 'PASS' : 'FAIL'}  GET /api/export.json  filas=${jsonBody.total} truncado=${jsonBody.meta?.truncado}`);

console.log('\n=== cities on demand ===');
await pause();
const ciu = await hit('GET /api/ciudades?departamento=Antioquia', '/api/ciudades?departamento=Antioquia', {
  check: (b) => Array.isArray(b.ciudades) && b.ciudades.length > 0 ? true : 'no cities',
});
if (ciu) console.log(`        ${ciu.ciudades.length} ciudades -> ${ciu.ciudades.slice(0, 6).map((c) => `${c.value}(${c.contratos})`).join(', ')}`);

console.log('\n=== cache effectiveness (repeat request) ===');
const t0 = Date.now();
await fetch(`${BASE}/api/summary`).then((r) => r.json());
console.log(`        repeat /api/summary took ${Date.now() - t0}ms (should be far below upstream latency)`);

console.log(`\n================ ${pass} passed, ${fail} failed ================`);
process.exit(fail === 0 ? 0 : 1);
