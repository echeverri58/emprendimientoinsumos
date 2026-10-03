/**
 * Las dos vistas de SECOP II que alimentan la aplicación.
 *
 * POR QUÉ HAY DOS FUENTES
 * -----------------------
 * «Convocado» y «adjudicado» NO son dos estados dentro de un mismo dataset: son
 * dos datasets distintos de SECOP II.
 *
 *  - `jbjy-vk9h` (Contratos electrónicos) contiene **solo contratos ya suscritos**.
 *    Comprobado: de los 1.393 registros del filtro de negocio a 2 años, 1.393
 *    tienen `proveedor_adjudicado` y 0 carecen de `fecha_de_firma`. Sus estados son
 *    «En ejecución», «terminado», «Modificado», «Cerrado», «Aprobado», «cedido»,
 *    «Suspendido», «Borrador» y «Cancelado»: **no existe ningún estado de
 *    convocatoria**. Un proceso que aún no se ha adjudicado no aparece aquí.
 *
 *  - `p6dx-8zbt` (Procesos de contratación) es donde vive la convocatoria. Tiene
 *    `adjudicado` ("Si"/"No"), `estado_del_procedimiento` (Publicado, Evaluación,
 *    Abierto, Seleccionado, Cancelado…), `precio_base` y
 *    `valor_total_adjudicacion`. 9.249.545 procesos en total.
 *
 * De ahí que el filtro «tipo de registro» sea un **conmutador de fuente** y no una
 * columna más: los dos conjuntos no se pueden unir en una sola consulta SoQL.
 *
 * CAMPOS EQUIVALENTES (ojo con los nombres: no coinciden entre vistas)
 * -------------------------------------------------------------------
 * | Concepto        | Contratos                | Procesos                        |
 * | --------------- | ------------------------ | ------------------------------- |
 * | Identificador   | `id_contrato`            | `id_del_proceso`                |
 * | Fecha           | `fecha_de_firma`         | `fecha_de_publicacion_del`      |
 * | Categoría       | `codigo_de_categoria_principal` | `codigo_principal_de_categoria` |
 * | Texto           | `objeto_del_contrato`, `descripcion_del_proceso` | `descripci_n_del_procedimiento`, `nombre_del_procedimiento` |
 * | Entidad         | `nombre_entidad`         | `entidad`                       |
 * | Estado          | `estado_contrato`        | `estado_del_procedimiento`      |
 * | Valor           | `valor_del_contrato`     | `precio_base`                   |
 * | Proveedor       | `proveedor_adjudicado`   | `nombre_del_proveedor`          |
 * | Departamento    | `departamento`           | `departamento_entidad`          |
 * | Ciudad          | `ciudad`                 | `ciudad_entidad`                |
 * | URL             | `urlproceso`             | `urlproceso`                    |
 *
 * El prefijo de versión `V1.` del código UNSPSC también aparece en la vista de
 * procesos (`V1.80111500`), así que el mismo `like '%<codigo>%'` funciona en ambas.
 */
import { DETAIL_FIELDS } from './catalog.js';

/** Modos del filtro «tipo de registro». */
export const TIPOS_REGISTRO = ['adjudicados', 'convocados', 'todos'];
const CONTRATOS = {
  key: 'contratos',
  dataset: 'jbjy-vk9h',
  label: 'Contratos adjudicados',
  shortLabel: 'Adjudicados',
  tipoRegistro: 'adjudicado',
  description: 'Contratos electrónicos ya suscritos: tienen proveedor adjudicado y fecha de firma.',

  idField: 'id_contrato',
  refField: 'referencia_del_contrato',
  procesoField: 'proceso_de_compra',
  tieBreakField: 'id_contrato',

  dateFields: { firma: 'fecha_de_firma', actualizacion: 'ultima_actualizacion' },
  defaultDateField: 'firma',
  dateLabel: 'Fecha de firma',

  categoryField: 'codigo_de_categoria_principal',
  textFields: ['objeto_del_contrato', 'descripcion_del_proceso'],
  numericSearchField: 'nit_entidad',
  /** Campos de texto que recorre la búsqueda libre (todos deben aceptar `upper()`). */
  searchFields: [
    'nombre_entidad', 'proveedor_adjudicado', 'objeto_del_contrato', 'descripcion_del_proceso',
    'id_contrato', 'referencia_del_contrato', 'proceso_de_compra', 'documento_proveedor',
    'ciudad', 'departamento',
  ],

  estadoField: 'estado_contrato',
  modalidadField: 'modalidad_de_contratacion',
  tipoContratoField: 'tipo_de_contrato',
  sectorField: 'sector',

  entidadField: 'nombre_entidad',
  nitField: 'nit_entidad',
  departamentoField: 'departamento',
  ciudadField: 'ciudad',

  proveedorField: 'proveedor_adjudicado',
  valorField: 'valor_del_contrato',
  valorLabel: 'Valor del contrato',

  /** Columnas por las que el cliente puede ordenar. */
  sortable: {
    fecha_de_firma: 'fecha_de_firma',
    fecha_de_inicio_del_contrato: 'fecha_de_inicio_del_contrato',
    ultima_actualizacion: 'ultima_actualizacion',
    valor_del_contrato: 'valor_del_contrato',
    nombre_entidad: 'nombre_entidad',
    proveedor_adjudicado: 'proveedor_adjudicado',
    estado_contrato: 'estado_contrato',
    modalidad_de_contratacion: 'modalidad_de_contratacion',
    departamento: 'departamento',
  },
  defaultSort: 'fecha_de_firma',

  listFields: [
    'id_contrato', 'referencia_del_contrato', 'proceso_de_compra',
    'nombre_entidad', 'nit_entidad', 'departamento', 'ciudad', 'orden', 'sector', 'entidad_centralizada',
    'modalidad_de_contratacion', 'tipo_de_contrato', 'justificacion_modalidad_de', 'estado_contrato',
    'codigo_de_categoria_principal', 'objeto_del_contrato', 'descripcion_del_proceso',
    'fecha_de_firma', 'fecha_de_inicio_del_contrato', 'fecha_de_fin_del_contrato', 'ultima_actualizacion',
    'proveedor_adjudicado', 'documento_proveedor', 'tipodocproveedor', 'es_pyme', 'es_grupo',
    'valor_del_contrato', 'valor_pagado', 'valor_facturado', 'saldo_cdp',
    'valor_pendiente_de_pago', 'valor_pendiente_de_ejecucion', 'valor_de_pago_adelantado',
    'dias_adicionados', 'destino_gasto', 'origen_de_los_recursos', 'urlproceso',
  ],
  /** El detalle del contrato necesita bastantes más campos que la tabla. */
  detailFields: DETAIL_FIELDS,
};

const PROCESOS = {
  key: 'procesos',
  dataset: 'p6dx-8zbt',
  label: 'Procesos convocados',
  shortLabel: 'Convocados',
  tipoRegistro: 'convocado',
  description: 'Procesos de contratación publicados que aún no han sido adjudicados.',

  idField: 'id_del_proceso',
  refField: 'referencia_del_proceso',
  procesoField: 'id_del_portafolio',
  tieBreakField: 'id_del_proceso',

  dateFields: { firma: 'fecha_de_publicacion_del', actualizacion: 'fecha_de_ultima_publicaci' },
  defaultDateField: 'firma',
  dateLabel: 'Fecha de publicación',

  categoryField: 'codigo_principal_de_categoria',
  // No hay `objeto_del_proceso` ni `descripcion_del_proceso` en esta vista: el
  // texto del proceso está en estos dos campos (verificado: los otros nombres
  // devuelven `query.soql.no-such-column`).
  textFields: ['descripci_n_del_procedimiento', 'nombre_del_procedimiento'],
  numericSearchField: 'nit_entidad',
  searchFields: [
    'entidad', 'nombre_del_proveedor', 'descripci_n_del_procedimiento', 'nombre_del_procedimiento',
    'id_del_proceso', 'referencia_del_proceso', 'id_del_portafolio', 'codigoproveedor',
    'ciudad_entidad', 'departamento_entidad', 'nombre_de_la_unidad_de',
  ],

  estadoField: 'estado_del_procedimiento',
  modalidadField: 'modalidad_de_contratacion',
  tipoContratoField: 'tipo_de_contrato',
  sectorField: null,

  entidadField: 'entidad',
  nitField: 'nit_entidad',
  departamentoField: 'departamento_entidad',
  ciudadField: 'ciudad_entidad',

  proveedorField: 'nombre_del_proveedor',
  valorField: 'precio_base',
  valorLabel: 'Precio base',

  /** Restringe a los procesos que siguen sin adjudicar: eso es «convocado». */
  baseCondition: "adjudicado = 'No'",

  sortable: {
    fecha_de_firma: 'fecha_de_publicacion_del',
    fecha_de_inicio_del_contrato: 'fecha_de_publicacion_del',
    ultima_actualizacion: 'fecha_de_ultima_publicaci',
    valor_del_contrato: 'precio_base',
    nombre_entidad: 'entidad',
    proveedor_adjudicado: 'nombre_del_proveedor',
    estado_contrato: 'estado_del_procedimiento',
    modalidad_de_contratacion: 'modalidad_de_contratacion',
    departamento: 'departamento_entidad',
  },
  defaultSort: 'fecha_de_firma',

  listFields: [
    'id_del_proceso', 'referencia_del_proceso', 'id_del_portafolio',
    'entidad', 'nit_entidad', 'departamento_entidad', 'ciudad_entidad', 'ordenentidad',
    'nombre_de_la_unidad_de', 'codigo_pci',
    'modalidad_de_contratacion', 'tipo_de_contrato', 'subtipo_de_contrato', 'justificaci_n_modalidad_de',
    'estado_del_procedimiento', 'estado_resumen', 'estado_de_apertura_del_proceso', 'fase',
    'adjudicado', 'id_adjudicacion',
    'codigo_principal_de_categoria', 'descripci_n_del_procedimiento', 'nombre_del_procedimiento',
    'fecha_de_publicacion_del', 'fecha_de_ultima_publicaci', 'fecha_de_publicacion_fase_3',
    'nombre_del_proveedor', 'nit_del_proveedor_adjudicado', 'codigoproveedor',
    'departamento_proveedor', 'ciudad_proveedor',
    'precio_base', 'valor_total_adjudicacion',
    'proveedores_invitados', 'proveedores_que_manifestaron', 'conteo_de_respuestas_a_ofertas',
    'numero_de_lotes', 'duracion', 'unidad_de_duracion', 'urlproceso',
  ],
};

/**
 * Un proceso no tiene supervisor, ordenador del gasto, datos bancarios ni
 * ejecución financiera, así que su detalle no necesita más campos que la tabla.
 */
PROCESOS.detailFields = PROCESOS.listFields;

export const SOURCE_LIST = [CONTRATOS, PROCESOS];

export const SOURCES = { contratos: CONTRATOS, procesos: PROCESOS };

/**
 * Resuelve el modo del filtro a la lista de fuentes que hay que consultar.
 * @param {'adjudicados'|'convocados'|'todos'} tipoRegistro
 */
export function sourcesFor(tipoRegistro) {
  switch (tipoRegistro) {
    case 'convocados':
      return [PROCESOS];
    case 'todos':
      return [CONTRATOS, PROCESOS];
    case 'adjudicados':
    default:
      return [CONTRATOS];
  }
}

/** Fuente única cuando el modo apunta a una sola vista (permite paginar en SoQL). */
export function singleSourceFor(tipoRegistro) {
  const list = sourcesFor(tipoRegistro);
  return list.length === 1 ? list[0] : null;
}
