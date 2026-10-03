/**
 * Business catalog for the "Dotación, Vestuario, Calzado, Insumos y EPP" domain.
 *
 * IMPORTANT DATA CAVEAT
 * ---------------------
 * `codigo_de_categoria_principal` is NOT stored as a bare 8-digit UNSPSC code.
 * In the live dataset (vista jbjy-vk9h) the values look like "V1.53111600" and
 * some rows carry "UNSPECIFIED". A literal `IN ('53111600')` therefore matches
 * ZERO rows. Every category predicate in this app is built as a substring match
 * on the numeric code (`like '%53111600%'`), which is exact in practice because
 * UNSPSC segment codes are fixed at 8 digits.
 */

/** @typedef {{ code: string, label: string }} UnspscCode */

export const CATEGORY_GROUPS = [
  {
    id: 'calzado',
    label: 'Calzado / Botas',
    accent: 'amber',
    codes: [
      { code: '53111500', label: 'Calzado para hombres' },
      { code: '53111600', label: 'Calzado para mujeres' },
      { code: '53111800', label: 'Calzado para bebés' },
      { code: '53111900', label: 'Calzado deportivo / tenis' },
    ],
  },
  {
    id: 'vestuario',
    label: 'Vestuario / Uniformes',
    accent: 'emerald',
    codes: [
      { code: '53101500', label: 'Pantalones y shorts' },
      { code: '53101600', label: 'Camisas y blusas' },
      { code: '53101800', label: 'Prendas de vestir exteriores' },
      { code: '53102700', label: 'Uniformes' },
    ],
  },
  {
    id: 'medias',
    label: 'Medias / Ropa Interior',
    accent: 'sky',
    codes: [
      { code: '53102400', label: 'Medias y calcetines' },
      { code: '53102500', label: 'Ropa interior' },
    ],
  },
  {
    id: 'epp',
    label: 'EPP y Seguridad Industrial',
    accent: 'rose',
    codes: [
      { code: '46181500', label: 'Ropa de seguridad' },
      { code: '46181700', label: 'Protección de manos (guantes)' },
      { code: '46181800', label: 'Protección ocular y facial' },
      { code: '46181900', label: 'Protección auditiva' },
      { code: '46182000', label: 'Protección respiratoria' },
      { code: '46182100', label: 'Protección contra caídas' },
    ],
  },
];

/** Flat list of every code the app tracks. */
export const ALL_CODES = CATEGORY_GROUPS.flatMap((g) =>
  g.codes.map((c) => ({ ...c, groupId: g.id, groupLabel: g.label })),
);

/** code -> metadata lookup. */
export const CODE_INDEX = new Map(ALL_CODES.map((c) => [c.code, c]));

/** Keywords that satisfy the "estricto por texto" rule. Both accent variants are
 *  required because SoQL `like` does not normalise diacritics. */
export const KEYWORDS_REQUIRED = [
  'DOTACION',
  'DOTACIÓN',
  'INSUMOS',
  'UNIFORMES',
  'CALZADO',
  'VESTUARIO',
  'ELEMENTOS DE PROTECCION',
  'ELEMENTOS DE PROTECCIÓN',
  'OVEROLES',
  'EPP',
];

/** Optional, higher-recall keywords the user can switch on. */
export const KEYWORDS_OPTIONAL = [
  'DOTACIONES',
  'PROTECCION PERSONAL',
  'PROTECCIÓN PERSONAL',
  'ROPA DE TRABAJO',
  'ROPA DE LABOR',
  'SEGURIDAD INDUSTRIAL',
  'BOTAS',
  'ZAPATOS',
  'GUANTES',
  'CASCO',
  'TAPABOCAS',
  'BATA',
  'CAMISETAS',
  'SEÑALIZACION',
  'SEÑALIZACIÓN',
];

/** Fields scanned by the "estricto por texto" rule. */
export const KEYWORD_FIELDS = ['objeto_del_contrato', 'descripcion_del_proceso'];

/** Columns a client is allowed to sort by (SoQL injection guard). */
export const SORTABLE = {
  fecha_de_firma: 'fecha_de_firma',
  valor_del_contrato: 'valor_del_contrato',
  nombre_entidad: 'nombre_entidad',
  proveedor_adjudicado: 'proveedor_adjudicado',
  estado_contrato: 'estado_contrato',
  modalidad_de_contratacion: 'modalidad_de_contratacion',
  departamento: 'departamento',
  fecha_de_inicio_del_contrato: 'fecha_de_inicio_del_contrato',
  ultima_actualizacion: 'ultima_actualizacion',
};

/** Columns the table view needs. Keeping this list tight keeps queries fast. */
export const LIST_FIELDS = [
  'id_contrato',
  'referencia_del_contrato',
  'proceso_de_compra',
  'nombre_entidad',
  'nit_entidad',
  'departamento',
  'ciudad',
  'orden',
  'sector',
  'entidad_centralizada',
  'modalidad_de_contratacion',
  'tipo_de_contrato',
  'justificacion_modalidad_de',
  'estado_contrato',
  'codigo_de_categoria_principal',
  'objeto_del_contrato',
  'descripcion_del_proceso',
  'fecha_de_firma',
  'fecha_de_inicio_del_contrato',
  'fecha_de_fin_del_contrato',
  'ultima_actualizacion',
  'proveedor_adjudicado',
  'documento_proveedor',
  'tipodocproveedor',
  'es_pyme',
  'es_grupo',
  'valor_del_contrato',
  'valor_pagado',
  'valor_facturado',
  'saldo_cdp',
  'valor_pendiente_de_pago',
  'valor_pendiente_de_ejecucion',
  'valor_de_pago_adelantado',
  'dias_adicionados',
  'destino_gasto',
  'origen_de_los_recursos',
  'urlproceso',
];

/** Extra columns only needed by the detail panel. */
export const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  'nombre_representante_legal',
  'tipo_de_identificaci_n_representante_legal',
  'identificaci_n_representante_legal',
  'g_nero_representante_legal',
  'nacionalidad_representante_legal',
  'domicilio_representante_legal',
  'nombre_supervisor',
  'tipo_de_documento_supervisor',
  'n_mero_de_documento_supervisor',
  'nombre_ordenador_del_gasto',
  'tipo_de_documento_ordenador_del_gasto',
  'n_mero_de_documento_ordenador_del_gasto',
  'nombre_ordenador_de_pago',
  'rama',
  'condiciones_de_entrega',
  'duraci_n_del_contrato',
  'liquidaci_n',
  'el_contrato_puede_ser_prorrogado',
  'saldo_vigencia',
  'valor_amortizado',
  'presupuesto_general_de_la_nacion_pgn',
  'recursos_propios',
  'recursos_de_credito',
  'sistema_general_de_participaciones',
  'sistema_general_de_regal_as',
  'nombre_del_banco',
  'tipo_de_cuenta',
  'n_mero_de_cuenta',
  'fecha_inicio_liquidacion',
  'fecha_fin_liquidacion',
  'direcci_n_de_ejecuci_n_del_contrato',
];

/**
 * Extract the bare 8-digit UNSPSC code from a raw dataset value such as
 * "V1.53111600" -> "53111600".
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeCode(raw) {
  if (raw === null || raw === undefined) return null;
  const match = String(raw).match(/(\d{8})/);
  return match ? match[1] : null;
}

/**
 * Resolve a raw dataset category value to catalog metadata.
 * @param {unknown} raw
 */
export function resolveCategory(raw) {
  const code = normalizeCode(raw);
  const meta = code ? CODE_INDEX.get(code) : null;
  if (!code) {
    return {
      rawCode: raw ? String(raw) : null,
      code: null,
      label: raw ? String(raw) : 'Sin categoría',
      groupId: 'otro',
      groupLabel: 'Otra / no clasificada',
    };
  }
  if (!meta) {
    return {
      rawCode: String(raw),
      code,
      label: `UNSPSC ${code}`,
      groupId: 'otro',
      groupLabel: 'Otra / no clasificada',
    };
  }
  return { rawCode: String(raw), code, label: meta.label, groupId: meta.groupId, groupLabel: meta.groupLabel };
}

/**
 * Normalise a status value into a visual bucket used for badge colouring.
 *
 * Cubre los estados de las DOS vistas. La de contratos mezcla mayúsculas y
 * minúsculas («En ejecución» y «terminado»); la de procesos usa otro vocabulario
 * («Publicado», «Evaluación», «Seleccionado», «Cancelado») que aquí se agrupa en
 * cubos con sentido para quien sigue una convocatoria.
 *
 * @param {unknown} estado
 * @returns {{ raw: string, key: string, label: string }}
 */
export function normalizeEstado(estado) {
  const raw = (estado || '').toString().trim();
  if (!raw) return { raw: '', key: 'desconocido', label: 'Sin estado' };
  const k = raw.toLowerCase();

  // --- Estados de proceso (convocatoria) ---
  if (k.includes('publicado')) return { raw, key: 'publicado', label: raw };
  if (k.includes('abierto')) return { raw, key: 'abierto', label: raw };
  if (k.includes('evaluac')) return { raw, key: 'evaluacion', label: raw };
  if (k.includes('oferta') || k.includes('observacion') || k.includes('fase de')) {
    return { raw, key: 'evaluacion', label: raw };
  }
  if (k.includes('seleccionado')) return { raw, key: 'seleccionado', label: raw };
  if (k.includes('adjudicado')) return { raw, key: 'adjudicado', label: raw };
  if (k.includes('cancelad')) return { raw, key: 'cancelado', label: raw };
  if (k.includes('borrador')) return { raw, key: 'borrador', label: raw };
  if (k.includes('aprob')) return { raw, key: 'aprobado', label: raw };

  // --- Estados de contrato ---
  if (k.includes('ejecuc')) return { raw, key: 'ejecucion', label: raw };
  if (k.includes('modific') || k.includes('adicion')) return { raw, key: 'modificado', label: raw };
  if (k.includes('suspend') || k.includes('suspen')) return { raw, key: 'suspendido', label: raw };
  if (k.includes('termin') || k.includes('cerrad') || k.includes('liquid')) {
    return { raw, key: 'cerrado', label: raw };
  }
  if (k.includes('cedid')) return { raw, key: 'cedido', label: raw };
  if (k.includes('convocat')) return { raw, key: 'convocatoria', label: raw };
  return { raw, key: 'otro', label: raw };
}
