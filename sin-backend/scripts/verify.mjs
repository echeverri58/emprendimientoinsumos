/**
 * Verificación de la VERSIÓN SIN BACKEND ejecutando la capa de datos real en Node.
 *
 * Los módulos de `src/lib/` son compatibles con el navegador Y con Node (fetch,
 * Map, Intl), así que aquí se ejercitan contra la API en vivo para comprobar que
 * los totales y las formas de datos son correctos antes de abrirlo en un navegador.
 */
import { searchContracts, getSummary, getMetaOptions, getContract } from '../src/lib/dataservice.js';
import { defaultFilters } from '../src/lib/filters.js';

let pass = 0;
let fail = 0;
const check = (cond, label) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

async function main() {
  console.log('\n=== Búsqueda por tipo de registro (ventana 30 días por defecto) ===');
  const totales = {};
  for (const tipo of ['adjudicados', 'convocados', 'todos']) {
    const filters = { ...defaultFilters(), tipoRegistro: tipo };
    const t0 = Date.now();
    const r = await searchContracts(filters);
    totales[tipo] = r.total;
    console.log(`  ${tipo.padEnd(12)} total=${String(r.total).padStart(5)}  valor=${r.aggregates.valorTotal.toLocaleString('es-CO').padStart(18)}  (${Date.now() - t0}ms)`);
    if (r.rows[0]) {
      console.log(`      fila: [${r.rows[0].tipoRegistroLabel}] ${String(r.rows[0].entidad.nombre).slice(0, 38)} | ${r.rows[0].estado.raw}`);
    }
  }
  check(totales.todos === totales.adjudicados + totales.convocados, `la fusión cuadra: ${totales.adjudicados} + ${totales.convocados} = ${totales.todos}`);
  check(totales.adjudicados > 0, 'hay contratos adjudicados en 30 días');
  check(totales.convocados > 0, 'hay procesos convocados en 30 días');

  console.log('\n=== Resumen / KPIs ===');
  const sum = await getSummary({ ...defaultFilters() });
  console.log(`  contratos=${sum.kpis.contratos}  entidadTop=${sum.kpis.entidadTop?.nombre}  deptoTop=${sum.kpis.departamentoTop?.nombre}`);
  console.log(`  meses=${sum.series.porMes.length}  categorias=${sum.series.porCategoria.map((c) => `${c.label}:${c.contratos}`).join(' | ')}`);
  check(sum.kpis.contratos === totales.adjudicados, `resumen coincide con búsqueda (${sum.kpis.contratos})`);
  check(sum.series.porMes.length >= 1, 'hay serie mensual');
  check(sum.valorLabel === 'Valor del contrato', `valorLabel correcto: ${sum.valorLabel}`);

  console.log('\n=== Facetas ===');
  const meta = await getMetaOptions('adjudicados');
  console.log(`  departamentos=${meta.departamentos.length}  modalidades=${meta.modalidades.length}`);
  console.log(`  estados=${meta.estados.map((e) => e.value).join(' | ')}`);
  check(meta.departamentos.length > 0, 'hay departamentos');
  check(meta.estados.length > 0, 'hay estados');

  const metaConv = await getMetaOptions('convocados');
  console.log(`  estados convocados=${metaConv.estados.map((e) => e.value).join(' | ')}`);
  check(metaConv.fuentes.includes('procesos'), 'las facetas de convocados usan la vista de procesos');

  console.log('\n=== Detalle ===');
  const r = await searchContracts({ ...defaultFilters() });
  const id = r.rows[0]?.id;
  if (id) {
    const det = await getContract(id, 'adjudicados');
    console.log(`  id=${det.contract?.id}  nit=${det.contract?.entidad.nit}  supervisor=${det.contract?.supervisor?.nombre ?? '(sin)'}`);
    check(det.contract && det.contract.id === id, 'el detalle devuelve el contrato pedido');
    check(Boolean(det.contract.supervisor), 'el detalle trae la sección de supervisor');
  } else {
    check(false, 'hay filas para probar el detalle');
  }

  const conv = await searchContracts({ ...defaultFilters(), tipoRegistro: 'convocados' });
  const cid = conv.rows[0]?.id;
  if (cid) {
    const cdet = await getContract(cid, 'convocados');
    check(Boolean(cdet.contract?.proceso), 'el detalle de un convocado trae la sección de proceso');
  }

  console.log(`\n================ ${pass} correctas, ${fail} fallidas ================\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nERROR:', e);
  process.exit(1);
});
