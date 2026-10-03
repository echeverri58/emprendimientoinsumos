import { resolveCategory, normalizeEstado } from './catalog.js';

/** Socrata returns numeric columns as strings; normalise them safely. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Treat the dataset's many "No Definido" placeholders as empty. */
function clean(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^(no definido|sin descripcion|sin descripción|no aplica|no|unspecified|-)$/i.test(s)) return null;
  return s;
}

/** «Si»/«No» en cualquiera de las grafías que usan las dos vistas. */
function isSi(value) {
  return /^s[ií]$/i.test(String(value ?? '').trim());
}

/**
 * `urlproceso` arrives as a Socrata `url` typed column, which serialises either
 * as a plain string or as `{ url: "..." }` depending on the export path.
 * @param {unknown} value
 */
export function extractUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.startsWith('http') ? value : null;
  if (typeof value === 'object' && 'url' in /** @type {any} */ (value)) {
    const url = /** @type {any} */ (value).url;
    return typeof url === 'string' && url.startsWith('http') ? url : null;
  }
  return null;
}

/**
 * Contrato adjudicado (vista `jbjy-vk9h`): un contrato ya suscrito.
 * @param {Record<string, any>} raw
 */
export function normalizeContrato(raw) {
  const estado = normalizeEstado(raw.estado_contrato);
  const categoria = resolveCategory(raw.codigo_de_categoria_principal);
  return {
    tipoRegistro: 'adjudicado',
    tipoRegistroLabel: 'Adjudicado',
    id: raw.id_contrato ?? raw.referencia_del_contrato ?? null,
    referencia: clean(raw.referencia_del_contrato),
    procesoDeCompra: clean(raw.proceso_de_compra),
    fechaFirma: raw.fecha_de_firma ?? null,
    fechaInicio: raw.fecha_de_inicio_del_contrato ?? null,
    fechaFin: raw.fecha_de_fin_del_contrato ?? null,
    ultimaActualizacion: raw.ultima_actualizacion ?? null,
    entidad: {
      nombre: clean(raw.nombre_entidad) ?? 'Sin entidad',
      nit: clean(raw.nit_entidad),
      departamento: clean(raw.departamento) ?? 'No Definido',
      ciudad: clean(raw.ciudad) ?? 'No Definido',
      orden: clean(raw.orden),
      sector: clean(raw.sector),
      entidadCentralizada: clean(raw.entidad_centralizada),
      unidad: null,
    },
    objeto: clean(raw.objeto_del_contrato) ?? clean(raw.descripcion_del_proceso) ?? '',
    descripcion: clean(raw.descripcion_del_proceso),
    modalidad: clean(raw.modalidad_de_contratacion) ?? 'No definida',
    tipoContrato: clean(raw.tipo_de_contrato),
    justificacionModalidad: clean(raw.justificacion_modalidad_de),
    estado,
    estadoResumen: null,
    apertura: null,
    fase: null,
    adjudicado: true,
    idAdjudicacion: null,
    categoria,
    proveedor: {
      nombre: clean(raw.proveedor_adjudicado) ?? 'Sin adjudicar',
      documento: clean(raw.documento_proveedor),
      tipoDocumento: clean(raw.tipodocproveedor),
      esPyme: isSi(raw.es_pyme),
      esGrupo: isSi(raw.es_grupo),
    },
    valores: {
      contrato: toNumber(raw.valor_del_contrato),
      adjudicado: toNumber(raw.valor_del_contrato),
      pagado: toNumber(raw.valor_pagado),
      facturado: toNumber(raw.valor_facturado),
      saldoCdp: toNumber(raw.saldo_cdp),
      pendientePago: toNumber(raw.valor_pendiente_de_pago),
      pendienteEjecucion: toNumber(raw.valor_pendiente_de_ejecucion),
      pagoAdelantado: toNumber(raw.valor_de_pago_adelantado),
      diasAdicionados: toNumber(raw.dias_adicionados),
    },
    participantes: null,
    duracion: null,
    unidadDuracion: null,
    numeroLotes: null,
    destinoGasto: clean(raw.destino_gasto),
    origenRecursos: clean(raw.origen_de_los_recursos),
    urlProceso: extractUrl(raw.urlproceso),
  };
}

/**
 * Proceso convocado (vista `p6dx-8zbt`): un procedimiento publicado que **todavía
 * no se ha adjudicado**. Se normaliza a la MISMA forma que un contrato para que la
 * tabla, el panel de detalle, los KPI y la exportación funcionen sin ramificaciones.
 *
 * Diferencias que hay que tener presentes al leer los datos resultantes:
 *  - No hay `fecha_de_firma`: la referencia temporal es `fecha_de_publicacion_del`.
 *  - El valor es un **precio base estimado** (`precio_base`), no un valor contratado.
 *  - No hay ejecución financiera (pagado, facturado, saldo CDP): todo eso es 0.
 *  - `nit_del_proveedor_adjudicado` viene como "No Definido" mientras no se adjudique.
 *
 * @param {Record<string, any>} raw
 */
export function normalizeProceso(raw) {
  const estado = normalizeEstado(raw.estado_del_procedimiento ?? raw.estado_resumen);
  const categoria = resolveCategory(raw.codigo_principal_de_categoria);
  return {
    tipoRegistro: 'convocado',
    tipoRegistroLabel: 'Convocado',
    id: raw.id_del_proceso ?? raw.referencia_del_proceso ?? null,
    referencia: clean(raw.referencia_del_proceso),
    procesoDeCompra: clean(raw.id_del_portafolio),
    fechaFirma: raw.fecha_de_publicacion_del ?? null,
    fechaInicio: null,
    fechaFin: null,
    ultimaActualizacion: raw.fecha_de_ultima_publicaci ?? null,
    entidad: {
      nombre: clean(raw.entidad) ?? 'Sin entidad',
      nit: clean(raw.nit_entidad),
      departamento: clean(raw.departamento_entidad) ?? 'No Definido',
      ciudad: clean(raw.ciudad_entidad) ?? 'No Definido',
      orden: clean(raw.ordenentidad),
      sector: null,
      entidadCentralizada: clean(raw.codigo_pci),
      unidad: clean(raw.nombre_de_la_unidad_de),
    },
    objeto:
      clean(raw.descripci_n_del_procedimiento) ?? clean(raw.nombre_del_procedimiento) ?? '',
    descripcion: clean(raw.descripci_n_del_procedimiento),
    modalidad: clean(raw.modalidad_de_contratacion) ?? 'No definida',
    tipoContrato: clean(raw.tipo_de_contrato),
    justificacionModalidad: clean(raw.justificaci_n_modalidad_de),
    estado,
    estadoResumen: clean(raw.estado_resumen),
    apertura: clean(raw.estado_de_apertura_del_proceso),
    fase: clean(raw.fase),
    adjudicado: isSi(raw.adjudicado),
    idAdjudicacion: clean(raw.id_adjudicacion),
    categoria,
    proveedor: {
      nombre: clean(raw.nombre_del_proveedor) ?? 'Sin adjudicar',
      documento: clean(raw.nit_del_proveedor_adjudicado) ?? clean(raw.codigoproveedor),
      tipoDocumento: null,
      esPyme: false,
      esGrupo: false,
    },
    valores: {
      // `contrato` mantiene el nombre para no ramificar la interfaz, pero en un
      // proceso es el precio base estimado.
      contrato: toNumber(raw.precio_base),
      adjudicado: toNumber(raw.valor_total_adjudicacion),
      pagado: 0,
      facturado: 0,
      saldoCdp: 0,
      pendientePago: 0,
      pendienteEjecucion: 0,
      pagoAdelantado: 0,
      diasAdicionados: 0,
    },
    participantes: {
      invitados: toNumber(raw.proveedores_invitados),
      manifestaron: toNumber(raw.proveedores_que_manifestaron),
      respuestas: toNumber(raw.conteo_de_respuestas_a_ofertas),
    },
    duracion: clean(raw.duracion),
    unidadDuracion: clean(raw.unidad_de_duracion),
    numeroLotes: toNumber(raw.numero_lotes),
    destinoGasto: null,
    origenRecursos: null,
    urlProceso: extractUrl(raw.urlproceso),
  };
}

/**
 * Detalle completo. En la vista de procesos no hay más secciones que las ya
 * normalizadas (no existen supervisor, ordenador del gasto ni datos bancarios),
 * así que se reutiliza la forma de lista y se añaden los campos disponibles.
 * @param {Record<string, any>} raw
 * @param {import('./sources.js').SOURCES.contratos} source
 */
export function normalizeListItem(raw, source) {
  return source.tipoRegistro === 'convocado' ? normalizeProceso(raw) : normalizeContrato(raw);
}

/**
 * Detail shape for the modal / side panel: everything in the list plus the
 * entity, supplier, financial and oversight fields.
 * @param {Record<string, any>} raw
 * @param {import('./sources.js').SOURCES.contratos} source
 */
export function normalizeDetail(raw, source) {
  if (source.tipoRegistro === 'convocado') {
    const base = normalizeProceso(raw);
    return {
      ...base,
      proveedor: {
        ...base.proveedor,
        codigoProveedor: clean(raw.codigoproveedor),
        representanteLegal: null,
        tipoDocumentoRepresentante: null,
        documentoRepresentante: null,
        generoRepresentante: null,
        nacionalidadRepresentante: null,
        domicilioRepresentante: null,
        departamento: clean(raw.departamento_proveedor),
        ciudad: clean(raw.ciudad_proveedor),
      },
      // El panel de detalle espera estas secciones: se declaran vacías en lugar de
      // omitirlas para que la interfaz no tenga que comprobar si existen.
      supervisor: { nombre: null, tipoDocumento: null, documento: null },
      ordenadorDelGasto: { nombre: null, tipoDocumento: null, documento: null },
      ordenadorDePago: { nombre: null },
      ejecucion: {
        condicionesEntrega: null,
        duracion: base.duracion ? `${base.duracion} ${base.unidadDuracion ?? ''}`.trim() : null,
        liquidacion: null,
        prorrogable: null,
        fechaInicioLiquidacion: null,
        fechaFinLiquidacion: null,
        direccionEjecucion: null,
      },
      pago: { banco: null, tipoCuenta: null, numeroCuenta: null },
      proceso: {
        estadoResumen: base.estadoResumen,
        apertura: base.apertura,
        fase: base.fase,
        adjudicado: base.adjudicado,
        idAdjudicacion: base.idAdjudicacion,
        valorAdjudicado: base.valores.adjudicado,
        participantes: base.participantes,
        numeroLotes: base.numeroLotes,
      },
    };
  }

  const base = normalizeContrato(raw);
  return {
    ...base,
    entidad: {
      ...base.entidad,
      rama: clean(raw.rama),
      codigoEntidad: clean(raw.codigo_entidad),
    },
    proveedor: {
      ...base.proveedor,
      codigoProveedor: clean(raw.codigo_proveedor),
      representanteLegal: clean(raw.nombre_representante_legal),
      tipoDocumentoRepresentante: clean(raw.tipo_de_identificaci_n_representante_legal),
      documentoRepresentante: clean(raw.identificaci_n_representante_legal),
      generoRepresentante: clean(raw.g_nero_representante_legal),
      nacionalidadRepresentante: clean(raw.nacionalidad_representante_legal),
      domicilioRepresentante: clean(raw.domicilio_representante_legal),
    },
    supervisor: {
      nombre: clean(raw.nombre_supervisor),
      tipoDocumento: clean(raw.tipo_de_documento_supervisor),
      documento: clean(raw.n_mero_de_documento_supervisor),
    },
    ordenadorDelGasto: {
      nombre: clean(raw.nombre_ordenador_del_gasto),
      tipoDocumento: clean(raw.tipo_de_documento_ordenador_del_gasto),
      documento: clean(raw.n_mero_de_documento_ordenador_del_gasto),
    },
    ordenadorDePago: {
      nombre: clean(raw.nombre_ordenador_de_pago),
    },
    valores: {
      ...base.valores,
      saldoVigencia: toNumber(raw.saldo_vigencia),
      amortizado: toNumber(raw.valor_amortizado),
      pgn: toNumber(raw.presupuesto_general_de_la_nacion_pgn),
      recursosPropios: toNumber(raw.recursos_propios),
      recursosCredito: toNumber(raw.recursos_de_credito),
      sgp: toNumber(raw.sistema_general_de_participaciones),
      sgr: toNumber(raw.sistema_general_de_regal_as),
    },
    ejecucion: {
      condicionesEntrega: clean(raw.condiciones_de_entrega),
      duracion: clean(raw.duraci_n_del_contrato),
      liquidacion: clean(raw.liquidaci_n),
      prorrogable: clean(raw.el_contrato_puede_ser_prorrogado),
      fechaInicioLiquidacion: raw.fecha_inicio_liquidacion ?? null,
      fechaFinLiquidacion: raw.fecha_fin_liquidacion ?? null,
      direccionEjecucion: clean(raw.direcci_n_de_ejecuci_n_del_contrato),
    },
    pago: {
      banco: clean(raw.nombre_del_banco),
      tipoCuenta: clean(raw.tipo_de_cuenta),
      numeroCuenta: clean(raw.n_mero_de_cuenta),
    },
  };
}
