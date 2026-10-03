import { toCsv } from '../lib/csv.js';

const dateOnly = (value) => (value ? String(value).slice(0, 10) : '');

const MONEY = '#,##0';

/**
 * Column definitions for every export format.
 *
 * `type` drives how the cell is written: numbers stay numeric so Excel/pandas can
 * compute on them, and dates stay ISO so spreadsheets parse them as dates. The
 * currency *formatting* lives in the UI only.
 */
export const EXPORT_COLUMNS = [
  { key: 'tipoRegistro', label: 'Tipo de registro', type: 'string', get: (r) => r.tipoRegistroLabel ?? r.tipoRegistro },
  { key: 'fechaFirma', label: 'Fecha firma / publicación', type: 'date', get: (r) => dateOnly(r.fechaFirma) },
  { key: 'fechaInicio', label: 'Fecha inicio', type: 'date', get: (r) => dateOnly(r.fechaInicio) },
  { key: 'fechaFin', label: 'Fecha fin', type: 'date', get: (r) => dateOnly(r.fechaFin) },
  { key: 'entidad', label: 'Entidad compradora', type: 'string', get: (r) => r.entidad?.nombre },
  { key: 'nitEntidad', label: 'NIT entidad', type: 'string', get: (r) => r.entidad?.nit },
  { key: 'departamento', label: 'Departamento', type: 'string', get: (r) => r.entidad?.departamento },
  { key: 'ciudad', label: 'Ciudad', type: 'string', get: (r) => r.entidad?.ciudad },
  { key: 'objeto', label: 'Objeto del contrato', type: 'string', get: (r) => r.objeto },
  { key: 'modalidad', label: 'Modalidad', type: 'string', get: (r) => r.modalidad },
  { key: 'tipoContrato', label: 'Tipo de contrato', type: 'string', get: (r) => r.tipoContrato },
  { key: 'proveedor', label: 'Proveedor adjudicado', type: 'string', get: (r) => r.proveedor?.nombre },
  { key: 'documentoProveedor', label: 'Documento proveedor', type: 'string', get: (r) => r.proveedor?.documento },
  { key: 'categoria', label: 'Categoría UNSPSC', type: 'string', get: (r) => r.categoria?.label },
  { key: 'codigoUnspsc', label: 'Código UNSPSC', type: 'string', get: (r) => r.categoria?.code },
  { key: 'grupoCategoria', label: 'Grupo categoría', type: 'string', get: (r) => r.categoria?.groupLabel },
  { key: 'valorContrato', label: 'Valor / precio base (COP)', type: 'money', get: (r) => r.valores?.contrato ?? 0 },
  { key: 'valorAdjudicado', label: 'Valor adjudicación (COP)', type: 'money', get: (r) => r.valores?.adjudicado ?? 0 },
  { key: 'valorPagado', label: 'Valor pagado (COP)', type: 'money', get: (r) => r.valores?.pagado ?? 0 },
  { key: 'valorFacturado', label: 'Valor facturado (COP)', type: 'money', get: (r) => r.valores?.facturado ?? 0 },
  { key: 'saldoCdp', label: 'Saldo CDP (COP)', type: 'money', get: (r) => r.valores?.saldoCdp ?? 0 },
  { key: 'pendientePago', label: 'Pendiente de pago (COP)', type: 'money', get: (r) => r.valores?.pendientePago ?? 0 },
  { key: 'estado', label: 'Estado', type: 'string', get: (r) => r.estado?.raw },
  { key: 'idContrato', label: 'ID contrato', type: 'string', get: (r) => r.id },
  { key: 'referencia', label: 'Referencia', type: 'string', get: (r) => r.referencia },
  { key: 'procesoDeCompra', label: 'Proceso de compra', type: 'string', get: (r) => r.procesoDeCompra },
  { key: 'urlProceso', label: 'URL proceso', type: 'string', get: (r) => r.urlProceso },
];

/** @param {any[]} rows */
export function rowsToCsv(rows) {
  return toCsv(EXPORT_COLUMNS, rows);
}

/** @param {any[]} rows @param {Record<string, unknown>} meta */
export function rowsToJson(rows, meta) {
  return JSON.stringify({ meta, total: rows.length, contratos: rows }, null, 2);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip control characters that are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/**
 * SpreadsheetML 2003 workbook.
 *
 * Excel (and LibreOffice) open this natively as a real spreadsheet: values keep
 * their numeric type and the money columns carry a thousands separator format.
 * It is used instead of XLSX because it needs no binary dependency.
 * @param {any[]} rows
 * @param {Record<string, any>} meta
 */
export function rowsToExcelXml(rows, meta) {
  const cell = (column, row) => {
    const raw = column.get ? column.get(row) : row[column.key];
    if (raw === null || raw === undefined || raw === '') return '<Cell/>';
    if (column.type === 'money' || column.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return '<Cell/>';
      const style = column.type === 'money' ? ' ss:StyleID="sMoney"' : '';
      return `<Cell${style}><Data ss:Type="Number">${n}</Data></Cell>`;
    }
    if (column.type === 'date') {
      // DateTime cells require a full ISO timestamp.
      return `<Cell ss:StyleID="sDate"><Data ss:Type="DateTime">${escapeXml(raw)}T00:00:00.000</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${escapeXml(raw)}</Data></Cell>`;
  };

  const header = EXPORT_COLUMNS.map(
    (column) => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`,
  ).join('');

  const body = rows.map((row) => `<Row>${EXPORT_COLUMNS.map((column) => cell(column, row)).join('')}</Row>`).join('');

  const widths = EXPORT_COLUMNS.map((column) => {
    const width = column.key === 'objeto' ? 420 : column.type === 'money' ? 110 : 90;
    return `<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`;
  }).join('');

  const summary = [
    ['Reporte', meta?.titulo ?? 'Contratos de dotación, vestuario, calzado, insumos y EPP'],
    ['Fuente', meta?.dataset ?? 'SECOP II — Datos Abiertos Colombia'],
    ['Generado', meta?.generado ?? new Date().toISOString()],
    ['Rango consultado', meta?.rango ? `${meta.rango.desde} a ${meta.rango.hasta}` : ''],
    ['Filtros aplicados', meta?.filtros ? JSON.stringify(meta.filtros) : ''],
    ['Registros exportados', String(rows.length)],
    ['Exportación truncada', meta?.truncado ? `Sí (límite ${meta.maxFilas})` : 'No'],
  ]
    .map(
      ([label, value]) =>
        `<Row><Cell ss:StyleID="sHead"><Data ss:Type="String">${escapeXml(label)}</Data></Cell><Cell><Data ss:Type="String">${escapeXml(
          value ?? '',
        )}</Data></Cell></Row>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
    <Style ss:ID="sHead"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
    <Style ss:ID="sMoney"><NumberFormat ss:Format="${MONEY}"/><Alignment ss:Horizontal="Right"/></Style>
    <Style ss:ID="sDate"><NumberFormat ss:Format="Short Date"/></Style>
  </Styles>
  <Worksheet ss:Name="Resumen">
    <Table>${summary}</Table>
  </Worksheet>
  <Worksheet ss:Name="Contratos">
    <Table ss:DefaultRowHeight="14">${widths}
      <Row ss:Height="26">${header}</Row>
      ${body}
    </Table>
    <AutoFilter x:Range="R1C1:R${rows.length + 1}C${EXPORT_COLUMNS.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
  </Worksheet>
</Workbook>`;
}
