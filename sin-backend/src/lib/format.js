/** Colombian peso and date formatting shared by every view. */

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Full COP currency, e.g. "$ 64.980.796.738". */
export function formatCOP(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return copFormatter.format(n);
}

/**
 * Compact COP for KPI cards, using Spanish magnitude words so the value stays
 * readable at a glance: "$ 64,98 mil M".
 */
export function formatCOPCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '$ 0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$ ${decimalFormatter.format(abs / 1e12)} billones`;
  if (abs >= 1e9) return `${sign}$ ${decimalFormatter.format(abs / 1e9)} mil M`;
  if (abs >= 1e6) return `${sign}$ ${decimalFormatter.format(abs / 1e6)} M`;
  if (abs >= 1e3) return `${sign}$ ${decimalFormatter.format(abs / 1e3)} K`;
  return `${sign}$ ${decimalFormatter.format(abs)}`;
}

export function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? numberFormatter.format(n) : '—';
}

/** "2026-09-29T00:00:00.000" or "2026-09-29" -> "29 sep 2026". */
export function formatDate(value) {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '—';
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${months[m - 1]} ${y}`;
}

export function formatDateShort(value) {
  if (!value) return '—';
  const iso = String(value).slice(0, 10);
  const [y, m, d] = iso.split('-');
  if (!y) return '—';
  return `${d}/${m}/${y.slice(2)}`;
}

/** ISO date + how long ago, for the "last updated" indicator. */
export function formatRelative(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'hace instantes';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/** Percentage of a total, guarding against division by zero. */
export function percent(part, total) {
  const p = Number(part);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t === 0) return 0;
  return Math.round((p / t) * 1000) / 10;
}

/** Collapse whitespace: the source data contains embedded newlines and `;;`. */
export function cleanText(value) {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').replace(/;\s*;/g, ';').trim();
}

/** Truncate on a word boundary where possible. */
export function truncate(value, max = 120) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Copy text to the clipboard, tolerating non-secure contexts. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
