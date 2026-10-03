/** RFC 4180 CSV serialisation that Excel opens correctly (BOM + CRLF). */

/**
 * @param {unknown} value
 */
function cell(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Neutralise spreadsheet formula injection.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\r\n;]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

/**
 * @param {Array<{ key: string, label: string, get?: (row: any) => unknown }>} columns
 * @param {any[]} rows
 * @param {{ delimiter?: string, bom?: boolean }} [options]
 */
export function toCsv(columns, rows, { delimiter = ',', bom = true } = {}) {
  const lines = [];
  lines.push(columns.map((c) => cell(c.label)).join(delimiter));
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => cell(c.get ? c.get(row) : row[c.key]))
        .join(delimiter),
    );
  }
  return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}

/** Slugify a string for use in a filename. */
export function slugify(value, fallback = 'reporte') {
  const s = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s || fallback;
}
