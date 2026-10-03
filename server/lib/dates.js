/**
 * Date helpers.
 *
 * The dataset stores *floating* timestamps ("2026-09-24T00:00:00.000") with no
 * timezone, in Colombian local time. All "today"/"this month" boundaries are
 * therefore computed in America/Bogota rather than the server's timezone, so the
 * dashboard is correct whether it runs in Bogotá or on a UTC host.
 */
const TZ = 'America/Bogota';

/** @param {Date} [date] */
function partsInBogota(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  /** @type {Record<string, string>} */
  const out = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** Today in Bogotá as `YYYY-MM-DD`. */
export function todayISO(date = new Date()) {
  const p = partsInBogota(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Start of the current month in Bogotá as `YYYY-MM-DD`. */
export function monthStartISO(date = new Date()) {
  const p = partsInBogota(date);
  return `${p.year}-${p.month}-01`;
}

/** Start of the current year in Bogotá as `YYYY-MM-DD`. */
export function yearStartISO(date = new Date()) {
  const p = partsInBogota(date);
  return `${p.year}-01-01`;
}

/**
 * Shift an ISO date string by N days.
 * @param {string} iso `YYYY-MM-DD`
 * @param {number} days
 */
export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Socrata floating-timestamp literal for the start of a day. */
export function startOfDay(iso) {
  return `${iso}T00:00:00.000`;
}

/** Socrata floating-timestamp literal for the end of a day. */
export function endOfDay(iso) {
  return `${iso}T23:59:59.999`;
}

/** Whole days between two ISO dates (inclusive-ish difference). */
export function daysBetween(fromISO, toISO) {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** True when the string looks like a `YYYY-MM-DD` date. */
export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Format a `YYYY-MM` period key into a short Spanish label, e.g. "sep 2026". */
export function formatPeriodLabel(period) {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${names[m - 1]} ${y}`;
}
