// Verifica que el servidor sirva correctamente el cliente compilado y la API.
const BASE = 'http://127.0.0.1:3001';
let pass = 0;
let fail = 0;

function check(ok, label, detail = '') {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res, buf, text: buf.toString('utf8') };
}

console.log('\n=== 1) HTML de la aplicación ===');
const index = await get('/');
check(index.res.status === 200, 'GET / responde 200', `status=${index.res.status}`);
check(
  (index.res.headers.get('content-type') || '').includes('text/html'),
  'Content-Type es text/html',
  index.res.headers.get('content-type'),
);
check(index.text.includes('<div id="root">'), 'Contiene el punto de montaje #root');
check(index.text.includes('lang="es"'), 'Declara idioma español');
check(/Consultando SECOP|<title>/.test(index.text), 'Incluye el título del documento');
check(
  (index.res.headers.get('cache-control') || '').includes('no-cache'),
  'index.html no se cachea (Cache-Control: no-cache)',
  index.res.headers.get('cache-control'),
);

// Rutas de los recursos referenciados por el HTML.
const assetPaths = [...index.text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
check(assetPaths.length >= 2, 'El HTML referencia los recursos compilados', assetPaths.join(', '));

console.log('\n=== 2) Recursos estáticos ===');
for (const path of assetPaths) {
  const asset = await get(path);
  const ct = asset.res.headers.get('content-type') || '';
  const cc = asset.res.headers.get('cache-control') || '';
  const isJs = path.endsWith('.js');
  check(asset.res.status === 200, `${path} responde 200`, `${(asset.buf.length / 1024).toFixed(1)} KB`);
  check(isJs ? ct.includes('javascript') : ct.includes('css'), `${path} tiene Content-Type correcto`, ct);
  check(cc.includes('immutable'), `${path} se cachea de forma inmutable`, cc);
}

const jsPath = assetPaths.find((p) => p.endsWith('.js'));
const js = await get(jsPath);
check(js.text.length > 50_000, 'El bundle JS tiene contenido sustancial', `${(js.buf.length / 1024).toFixed(1)} KB`);
check(/createRoot|hydrateRoot|react/i.test(js.text), 'El bundle contiene el arranque de React');
check(js.text.includes('Contratos filtrados') || js.text.includes('Contratos'), 'El bundle incluye el texto de la vista');

// El chunk de gráficos debe existir como archivo separado (code splitting).
const chartChunk = [...js.text.matchAll(/["']\.\/(ChartsPanel-[A-Za-z0-9_-]+\.js)["']/g)].map((m) => m[1]);
check(chartChunk.length > 0, 'El bundle referencia el chunk diferido de gráficos', chartChunk.join(', '));
if (chartChunk[0]) {
  const chunk = await get(`/assets/${chartChunk[0]}`);
  check(chunk.res.status === 200, `El chunk ${chartChunk[0]} se sirve correctamente`, `${(chunk.buf.length / 1024).toFixed(1)} KB`);
}

console.log('\n=== 3) Fallback de SPA y rutas de API ===');
const spa = await get('/alguna/ruta/interna');
check(spa.res.status === 200 && spa.text.includes('<div id="root">'), 'Una ruta interna devuelve el index.html (fallback SPA)');

const api404 = await get('/api/no-existe');
check(api404.res.status === 404, 'Una ruta de API desconocida responde 404');
let api404json = null;
try { api404json = JSON.parse(api404.text); } catch { /* noop */ }
check(Boolean(api404json?.error), 'El 404 de la API es JSON estructurado', api404json?.error);

const health = await get('/api/health');
const healthBody = JSON.parse(health.text);
check(health.res.status === 200 && healthBody.ok === true, 'GET /api/health confirma conexión con SECOP II');
check(healthBody.dataset?.id === 'jbjy-vk9h', 'Apunta a la vista correcta', healthBody.dataset?.id);

console.log('\n=== 4) Extremo a extremo: el filtro por defecto que verá el usuario ===');
const contracts = await get('/api/contracts?pageSize=25');
const body = JSON.parse(contracts.text);
check(contracts.res.status === 200, 'GET /api/contracts responde 200');
check(body.rows?.length > 0, 'Devuelve filas para el filtro por defecto (2 años)', `${body.rows?.length} filas de ${body.total}`);
check(body.rows.every((r) => r.categoria?.groupId), 'Toda fila trae categoría UNSPSC resuelta');
check(body.rows.every((r) => r.estado?.key), 'Toda fila trae estado normalizado para el badge');
check(body.rows.every((r) => typeof r.valores?.contrato === 'number'), 'Los valores llegan como número, no como texto');
check(
  body.rows.some((r) => r.urlProceso),
  'Al menos una fila trae la URL del proceso para el enlace a SECOP II',
);

const summary = JSON.parse((await get('/api/summary')).text);
check(Boolean(summary.kpis && summary.kpis.contratos > 0), 'El resumen trae KPIs con datos', `contratos=${summary.kpis?.contratos}`);
check(summary.series.porMes.length > 0, 'La serie mensual tiene puntos para la gráfica', `${summary.series.porMes.length} meses`);
check(summary.series.porCategoria.length > 0, 'La mezcla por categoría tiene datos', summary.series.porCategoria.map((c) => c.label).join(', '));
check(typeof summary.kpis.contratos30d === 'number', 'Incluye el KPI de 30 días', `contratos30d=${summary.kpis.contratos30d}`);

console.log('\n=== 5) Exportaciones (incluye Excel) ===');
for (const [format, expectedType, minBytes] of [
  ['csv', 'text/csv', 200],
  ['xls', 'application/vnd.ms-excel', 200],
  ['json', 'application/json', 200],
]) {
  const res = await fetch(`${BASE}/api/export.${format}?from=2026-01-01&to=2026-10-02`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  check(res.status === 200, `export.${format} responde 200`, `${(buf.length / 1024).toFixed(1)} KB`);
  check(ct.includes(expectedType), `export.${format} tiene Content-Type ${expectedType}`, ct);
  check(buf.length > minBytes, `export.${format} tiene contenido`, `${buf.length} bytes`);
  check(
    (res.headers.get('content-disposition') || '').includes('attachment'),
    `export.${format} se descarga como archivo adjunto`,
  );
  if (format === 'xls') {
    const xml = buf.toString('utf8');
    check(xml.includes('<?mso-application progid="Excel.Sheet"?>'), 'El .xls declara el programa de Excel');
    check(xml.includes('<Worksheet ss:Name="Contratos">'), 'El .xls incluye la hoja «Contratos»');
    check(xml.includes('ss:Type="Number"'), 'Las celdas de dinero se escriben como números, no como texto');
  }
}

console.log(`\n================ ${pass} correctas, ${fail} fallidas ================\n`);
process.exit(fail === 0 ? 0 : 1);
