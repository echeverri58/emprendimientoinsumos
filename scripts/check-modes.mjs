// Comprobación dirigida de los modos de la regla de negocio y sus topes de ventana.
const BASE = 'http://127.0.0.1:3001';

async function probe(query) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/contracts?${query}&pageSize=1`);
  const dt = Date.now() - t0;
  const body = await res.json();
  if (!res.ok) {
    console.log(`  ${query.padEnd(46)} HTTP ${res.status} en ${dt}ms -> ${String(body.message).slice(0, 90)}`);
    return null;
  }
  const f = body.query.filters;
  console.log(
    `  ${query.padEnd(46)} total=${String(body.total).padStart(6)}  ${dt}ms\n` +
      `      scope=${f.scope}  topeModo=${f.scopeMaxWindowDays}d  ventana=${f.from}..${f.to}  recortada=${f.windowClamped}`,
  );
  return { body, f, ms: dt };
}

console.log('\n--- modos y sus topes de ventana ---');
const strict = await probe('scope=strict');
const category = await probe('scope=category');
const keyword = await probe('scope=keyword');
const broad = await probe('scope=broad');

console.log('\n--- ventana pedida de 2 años en cada modo ---');
const twoYears = `from=${new Date(Date.now() - 729 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`;
const k2y = await probe(`scope=keyword&${twoYears}`);
const s2y = await probe(`scope=strict&${twoYears}`);

console.log('\n--- resumen de la API (meta) ---');
const meta = await (await fetch(`${BASE}/api/meta`)).json();
console.log(`  modos ofrecidos      : ${meta.scopes.join(', ')}`);
console.log(`  topes por modo       : ${JSON.stringify(meta.limits.scopeMaxWindowDays)}`);
console.log(`  tope global          : ${meta.limits.maxWindowDays} días`);
console.log(`  ventana por defecto  : ${meta.defaults.windowDays} días`);

console.log('\n--- veredicto ---');
let ok = true;
const expect = (cond, label) => {
  cond ? null : (ok = false);
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
};
expect(strict && strict.f.scopeMaxWindowDays === 730, 'strict admite 730 días');
expect(category && category.f.scopeMaxWindowDays === 730, 'category admite 730 días');
expect(keyword && keyword.f.scopeMaxWindowDays === 180, 'keyword se acota a 180 días');
expect(broad && broad.f.scope === 'strict', 'el modo retirado «broad» degrada a strict');
expect(k2y && k2y.f.windowClamped === true, 'pedir 2 años en keyword reporta windowClamped=true');
expect(k2y && k2y.body.total <= 7000, `keyword a 180 días devuelve un conjunto razonable (${k2y?.body?.total})`);
expect(s2y && s2y.f.windowClamped === false, 'pedir 2 años en strict NO se recorta');
expect(!meta.scopes.includes('broad'), 'la API ya no ofrece el modo «broad»');
expect(meta.limits.maxWindowDays === 730, 'el tope global es de 2 años');

console.log(`\n  ${ok ? 'Todo correcto' : 'HAY FALLOS'}\n`);
process.exit(ok ? 0 : 1);
