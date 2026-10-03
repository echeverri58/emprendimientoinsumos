/**
 * Coste real del modo «solo texto» TAL COMO LO CONSTRUYE LA APLICACIÓN.
 *
 * `probe-scopes.mjs` midió 20 cláusulas `like` (10 palabras clave × 2 campos). La
 * aplicación emite además la variante con tilde de cada palabra clave, así que son
 * hasta 40 y el coste casi se duplica. Esta medición usa la consulta de verdad,
 * pasando por la API local, para fijar el tope de ventana con datos reales.
 */
const BASE = 'http://127.0.0.1:3001';
const TO = new Date().toISOString().slice(0, 10);
const desde = (d) => new Date(Date.parse(`${TO}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);

async function medir(dias, { tipoRegistro = 'adjudicados' } = {}) {
  // Se varía `to` en un día para no golpear siempre la misma entrada de caché.
  const to = new Date(Date.parse(`${TO}T12:00:00Z`) - (dias % 7) * 86_400_000).toISOString().slice(0, 10);
  const url = `${BASE}/api/contracts?scope=keyword&tipoRegistro=${tipoRegistro}&from=${desde(dias)}&to=${to}&pageSize=1`;
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    const dt = Date.now() - t0;
    const body = await res.json();
    if (!res.ok) {
      console.log(`  ${String(dias).padStart(4)}d  FALLO ${String(dt).padStart(7)}ms  ${String(body.message).slice(0, 80)}`);
      return;
    }
    const f = body.query.filters;
    console.log(
      `  ${String(dias).padStart(4)}d  ok    ${String(dt).padStart(7)}ms  n=${String(body.total).padStart(6)}  ` +
        `ventana=${f.from}..${f.to}  tope=${f.scopeMaxWindowDays}d`,
    );
  } catch (e) {
    console.log(`  ${String(dias).padStart(4)}d  ERROR ${Date.now() - t0}ms ${e.message}`);
  }
}

console.log('\nModo «solo texto» a través de la API, con la cláusula real (variantes con y sin tilde):\n');
console.log('  adjudicados (vista jbjy-vk9h, 6,09 M filas):');
for (const d of [30, 90, 180, 365]) {
  await medir(d);
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('\n  convocados (vista p6dx-8zbt, 9,25 M filas):');
for (const d of [30, 90, 180]) {
  await medir(d, { tipoRegistro: 'convocados' });
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('\n  estricto (referencia, incluye la restricción de categoría):');
for (const d of [90, 730]) {
  const to = new Date(Date.parse(`${TO}T12:00:00Z`) - (d % 7) * 86_400_000).toISOString().slice(0, 10);
  const url = `${BASE}/api/contracts?scope=strict&from=${desde(d)}&to=${to}&pageSize=1`;
  const t0 = Date.now();
  const res = await fetch(url);
  const dt = Date.now() - t0;
  const body = await res.json();
  console.log(`  ${String(d).padStart(4)}d  ok    ${String(dt).padStart(7)}ms  n=${String(body.total).padStart(6)}`);
  await new Promise((r) => setTimeout(r, 2000));
}
