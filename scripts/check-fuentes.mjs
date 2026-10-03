/** Comprobación de las tres fuentes del filtro «tipo de registro». */
const BASE = 'http://127.0.0.1:3001';

async function get(path) {
  const res = await fetch(BASE + path);
  const body = await res.json();
  return { status: res.status, body };
}

const meta = await get('/api/meta');
console.log('\n=== /api/meta ===');
console.log('  tipos de registro:', JSON.stringify(meta.body.tiposRegistro?.map((t) => `${t.key} (${t.dataset})`)));
console.log('  valores por fuente:', JSON.stringify(Object.fromEntries(
  (meta.body.tiposRegistro ?? []).map((t) => [t.key, { valorLabel: t.valorLabel, dateLabel: t.dateLabel }]),
)));
const opt = meta.body.options ?? {};
console.log('  claves de options:', Object.keys(opt).join(', '));
console.log('  fuentes calculadas:', JSON.stringify(opt.fuentes));
console.log('  estados (unión)   :', (opt.estados ?? []).map((e) => e.value).join(' | '));
console.log('  modalidades       :', (opt.modalidades ?? []).map((e) => e.value).slice(0, 5).join(' | '));
console.log('  departamentos     :', (opt.departamentos ?? []).length, 'valores');
for (const [fuente, facets] of Object.entries(opt.porFuente ?? {})) {
  console.log(`  porFuente.${fuente}:`, Object.keys(facets).join(', '));
  console.log(`     estados:`, (facets.estados ?? []).map((e) => e.value).join(' | '));
}

// Las facetas deben ser perezosas: pedir el modo «convocados» calcula solo la vista
// de procesos, no las dos.
const metaConv = await get('/api/meta?tipoRegistro=convocados');
const metaTodo = await get('/api/meta?tipoRegistro=todos');
console.log('\n  pereza de facetas:');
console.log('    adjudicados ->', JSON.stringify(meta.body.options?.fuentes));
console.log('    convocados  ->', JSON.stringify(metaConv.body.options?.fuentes));
console.log('    todos       ->', JSON.stringify(metaTodo.body.options?.fuentes));

for (const tipo of ['adjudicados', 'convocados', 'todos']) {
  console.log(`\n=== tipoRegistro=${tipo} ===`);
  const t0 = Date.now();
  const list = await get(`/api/contracts?tipoRegistro=${tipo}&pageSize=3`);
  const ms = Date.now() - t0;
  if (list.status !== 200) {
    console.log(`  FALLO HTTP ${list.status}: ${String(list.body.message).slice(0, 160)}`);
    continue;
  }
  const b = list.body;
  console.log(`  total=${b.total}  páginas=${b.totalPages}  valor=${b.aggregates.valorTotal.toLocaleString('es-CO')}  (${ms}ms)`);
  console.log(`  merged=${Boolean(b.meta.merged)}  truncado=${b.meta.truncated ?? false}`);
  for (const r of b.rows) {
    console.log(
      `    [${r.tipoRegistroLabel}] ${String(r.fechaFirma).slice(0, 10)} | ${String(r.entidad.nombre).slice(0, 34).padEnd(34)} | ` +
        `${r.estado.raw.padEnd(16)} | ${String(r.valores.contrato).padStart(12)} | ${r.categoria.groupLabel}`,
    );
  }

  const sum = await get(`/api/summary?tipoRegistro=${tipo}`);
  if (sum.status === 200) {
    const k = sum.body.kpis;
    console.log(`  KPI: contratos=${k.contratos} valorTotal=${k.valorTotal.toLocaleString('es-CO')} meses=${sum.body.series.porMes.length}`);
    console.log(`       entidadTop=${String(k.entidadTop?.nombre).slice(0, 44)}`);
    console.log(`       estados=${sum.body.series.porEstado.map((e) => `${e.estado}:${e.contratos}`).join(' ')}`);
    console.log(`       valorLabel=${sum.body.valorLabel}  dateLabel=${sum.body.dateLabel}`);
  } else {
    console.log(`  summary FALLO HTTP ${sum.status}: ${String(sum.body.message).slice(0, 160)}`);
  }
}

console.log('\n=== detalle en ambas vistas ===');
for (const [tipo, id] of [['adjudicados', 'CO1.PCCNTR.10002029'], ['convocados', null]]) {
  let target = id;
  if (!target) {
    const l = await get('/api/contracts?tipoRegistro=convocados&pageSize=1');
    target = l.body.rows[0]?.id;
  }
  if (!target) { console.log(`  ${tipo}: sin id de prueba`); continue; }
  const d = await get(`/api/contracts/${encodeURIComponent(target)}?tipoRegistro=${tipo}`);
  if (d.status !== 200) { console.log(`  ${tipo}: HTTP ${d.status}`); continue; }
  const c = d.body.contract;
  console.log(`  ${tipo}: ${c.tipoRegistroLabel} | ${c.id}`);
  console.log(`     objeto: ${String(c.objeto).slice(0, 70)}`);
  console.log(`     valores: contrato=${c.valores.contrato} adjudicado=${c.valores.adjudicado}`);
  console.log(`     url: ${Boolean(c.urlProceso)}  participantes: ${JSON.stringify(c.participantes)}`);
}
