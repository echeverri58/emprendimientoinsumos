import {
  CATEGORY_GROUPS,
  KEYWORDS_OPTIONAL,
  KEYWORDS_REQUIRED,
  normalizeCode,
} from './catalog.js';
import { addDaysISO, daysBetween, isISODate, todayISO } from '../lib/dates.js';
import { config } from '../config.js';

/**
 * Modos de combinación de la regla de negocio.
 *
 * `broad` (UNSPSC **o** texto) se retiró a propósito tras medirlo: el `OR` entre
 * las dos cláusulas impide que el optimizador de Socrata use el filtro de
 * categoría, así que escanea el dataset completo y tarda 32 s con solo 90 días de
 * ventana, 58 s con 180 y no termina nunca a 2 años. Ver
 * `scripts/probe-scopes.mjs` y el hallazgo (i) de `docs/NOTAS-DATOS.md`.
 */
export const SCOPES = ['strict', 'category', 'keyword'];

/**
 * Tope de ventana en días por modo, medido contra el endpoint real
 * (`scripts/probe-scopes.mjs`, con el endpoint en reposo):
 *
 * | modo      |  90 d | 180 d | 365 d | 730 d |
 * | --------- | ----- | ----- | ----- | ----- |
 * | strict    | 1,1 s | 0,8 s | 1,9 s | 2,7 s |
 * | category  | 0,7 s | 0,8 s | 1,9 s | 2,7 s |
 * | keyword   | 3,5 s | 4,1 s | 12,1 s| NO CABE |
 *
 * `keyword` no lleva la restricción de categoría, así que `upper(col) like '%…%'`
 * acaba escaneando las 6,1M de filas. La cláusula real duplica variantes con/sin
 * tilde (hasta 40 `like`), así que su coste es ~el doble del de la medición simple:
 * 180 días tarda ~27 s y no deja margen frente al límite de 30 s; 90 días es la
 * ventana segura. Ver `scripts/probe-keyword-cost.mjs`.
 */
export const SCOPE_MAX_WINDOW_DAYS = {
  strict: 730,
  category: 730,
  keyword: 90,
};

/**
 * Las listas de campos que recorre la búsqueda libre, el campo numérico del NIT y
 * los campos de texto del objeto viven ahora en `sources.js`, porque **no son los
 * mismos** en la vista de contratos y en la de procesos. Este módulo ya solo
 * construye SoQL a partir del descriptor de la fuente.
 */

/**
 * Remove characters that would let a caller inject SoQL wildcards or break out
 * of a string literal. We add our own wildcards deliberately afterwards.
 * @param {unknown} value
 */
export function sanitizeTerm(value) {
  return String(value ?? '')
    .replace(/['"\\%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wrap a value as a SoQL string literal. */
export function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Wrap a list of values as a SoQL `in (...)` list. */
function inList(values) {
  return `(${values.map(quote).join(', ')})`;
}

/** Strip Spanish diacritics so "DOTACIÓN" also matches "DOTACION". */
export function foldAccents(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const VOWELS = 'AEIOU';

/**
 * SoQL `like` also supports `_` (single character) alongside `%`. Spanish
 * accents change exactly one character, so replacing a single unaccented vowel
 * with `_` lets "DOTACION" match both "DOTACION" and "DOTACIÓN" without
 * loosening the pattern as much as wildcarding every vowel would.
 * @param {string} word
 */
function singleVowelVariants(word) {
  const out = [];
  if (word.length < 4) return out;
  const chars = [...word];
  for (let i = 0; i < chars.length && out.length < 6; i += 1) {
    if (VOWELS.includes(chars[i])) {
      const copy = [...chars];
      copy[i] = '_';
      out.push(copy.join(''));
    }
  }
  return out;
}

/**
 * Build the accented/accent-folded pattern variants for one search word.
 * @param {string} word already sanitized and uppercased
 */
function wordPatterns(word) {
  const patterns = new Set([word]);
  const folded = foldAccents(word);
  patterns.add(folded);
  // Only widen patterns that are pure ASCII; if the user typed an accent we
  // already have the exact and folded forms.
  for (const variant of singleVowelVariants(folded)) patterns.add(variant);
  return [...patterns].slice(0, 6);
}

/**
 * Free-text search across the source's text fields. Words are AND-ed (each must
 * appear somewhere in the record) while variants are OR-ed.
 *
 * Accent handling: SoQL `like` does not normalise diacritics, but it does support
 * `_` as a single-character wildcard. Since a Spanish accent changes exactly one
 * character, replacing a single vowel with `_` makes "DOTACION" match both
 * "DOTACION" and "DOTACIÓN" (verified against the live endpoint).
 *
 * @param {string} term
 * @param {import('./sources.js').SOURCES.contratos} source
 */
export function buildFreeTextClause(term, source) {
  const clean = sanitizeTerm(term);
  if (!clean) return null;
  const words = clean
    .toUpperCase()
    .split(' ')
    .filter((w) => w.length >= 2)
    .slice(0, 5);
  if (!words.length) return null;

  const fields = source.searchFields;
  const numericField = source.numericSearchField;

  const perWord = words.map((word) => {
    const ors = [];
    for (const pattern of wordPatterns(word)) {
      const like = quote(`%${pattern}%`);
      for (const field of fields) {
        ors.push(`upper(${field}) like ${like}`);
      }
      // A pure-digit term is likely a NIT, which is a NUMERIC column in both views.
      if (numericField && /^\d{6,}$/.test(pattern)) {
        ors.push(`${numericField} = ${Number(pattern)}`);
      }
    }
    return `(${ors.join(' or ')})`;
  });

  return perWord.length === 1 ? perWord[0] : `(${perWord.join(' and ')})`;
}

/**
 * UNSPSC clause.
 *
 * Built as `like '%<code>%'` rather than `in (...)`: BOTH views store the
 * category with a version prefix ("V1.53111600" in contratos, "V1.80111500" in
 * procesos), so an equality test against the bare code matches nothing. UNSPSC
 * codes are fixed 8-digit strings, so substring matching is exact rather than
 * approximate.
 *
 * @param {string[]} codes 8-digit codes
 * @param {string} field column holding the category code
 */
export function buildCategoryClause(codes, field) {
  if (!codes.length) return null;
  const ors = codes.map((code) => `${field} like ${quote(`%${code}%`)}`);
  return `(${ors.join(' or ')})`;
}

/**
 * Text rule over the source's object/description fields.
 * @param {string[]} keywords
 * @param {string[]} fields
 */
export function buildKeywordClause(keywords, fields) {
  if (!keywords.length || !fields?.length) return null;
  const ors = [];
  for (const keyword of keywords) {
    const like = quote(`%${foldAccents(String(keyword).toUpperCase())}%`);
    const likeAccented = quote(`%${String(keyword).toUpperCase()}%`);
    for (const field of fields) {
      ors.push(`upper(${field}) like ${like}`);
      if (likeAccented !== like) ors.push(`upper(${field}) like ${likeAccented}`);
    }
  }
  return `(${ors.join(' or ')})`;
}

/**
 * Resolve which 8-digit UNSPSC codes are in play for the given filter.
 * @param {import('./filters.js').ContractFilters} filters
 */
export function resolveCodes(filters) {
  if (filters.codes?.length) {
    return [...new Set(filters.codes.map((c) => normalizeCode(c)).filter(Boolean))];
  }
  const groups = filters.groups?.length ? filters.groups : CATEGORY_GROUPS.map((g) => g.id);
  const allowed = new Set(groups);
  return CATEGORY_GROUPS.filter((g) => allowed.has(g.id)).flatMap((g) => g.codes.map((c) => c.code));
}

/**
 * Resolve the keyword list for the given filter.
 * @param {import('./filters.js').ContractFilters} filters
 */
export function resolveKeywords(filters) {
  if (filters.keywords?.length) return [...new Set(filters.keywords.map((k) => k.toUpperCase()))];
  const base = [...KEYWORDS_REQUIRED];
  if (filters.includeOptionalKeywords) base.push(...KEYWORDS_OPTIONAL);
  if (filters.extraKeywords?.length) base.push(...filters.extraKeywords);
  return [...new Set(base.map((k) => k.toUpperCase()))];
}

/**
 * Build the full SoQL `$where` for a filter set against ONE source view.
 *
 * Field names differ between the two datasets (see `sources.js`), so nothing here
 * is hardcoded: everything comes from the source descriptor. That is what lets the
 * same filter object drive both the contratos and the procesos query.
 *
 * @param {import('./filters.js').ContractFilters} filters
 * @param {import('./sources.js').SOURCES.contratos} source
 * @returns {string}
 */
export function buildWhere(filters, source) {
  const clauses = [];

  // «convocado» = proceso que sigue sin adjudicar.
  if (source.baseCondition) clauses.push(source.baseCondition);

  const key = filters.dateField === 'ultima_actualizacion' ? 'actualizacion' : 'firma';
  const dateField = source.dateFields[key];
  if (filters.from) clauses.push(`${dateField} >= ${quote(`${filters.from}T00:00:00.000`)}`);
  if (filters.to) clauses.push(`${dateField} <= ${quote(`${filters.to}T23:59:59.999`)}`);

  const category = buildCategoryClause(resolveCodes(filters), source.categoryField);
  const keyword = buildKeywordClause(resolveKeywords(filters), source.textFields);

  switch (filters.scope) {
    case 'category':
      if (category) clauses.push(category);
      break;
    case 'keyword':
      if (keyword) clauses.push(keyword);
      break;
    case 'strict':
    default:
      if (category) clauses.push(category);
      if (keyword) clauses.push(keyword);
      break;
  }

  if (filters.departamentos?.length) {
    clauses.push(`${source.departamentoField} in ${inList(filters.departamentos)}`);
  }
  if (filters.ciudades?.length) clauses.push(`${source.ciudadField} in ${inList(filters.ciudades)}`);
  if (filters.estados?.length) clauses.push(`${source.estadoField} in ${inList(filters.estados)}`);
  if (filters.modalidades?.length) {
    clauses.push(`${source.modalidadField} in ${inList(filters.modalidades)}`);
  }
  if (filters.sectores?.length && source.sectorField) {
    clauses.push(`${source.sectorField} in ${inList(filters.sectores)}`);
  }
  if (filters.tiposContrato?.length) {
    clauses.push(`${source.tipoContratoField} in ${inList(filters.tiposContrato)}`);
  }

  if (Number.isFinite(filters.minValor)) clauses.push(`${source.valorField} >= ${Number(filters.minValor)}`);
  if (Number.isFinite(filters.maxValor)) clauses.push(`${source.valorField} <= ${Number(filters.maxValor)}`);

  const freeText = buildFreeTextClause(filters.q, source);
  if (freeText) clauses.push(freeText);

  return clauses.length ? clauses.join(' and ') : '1=1';
}

/**
 * Convert a live row's raw category value into a catalog group id, so results can
 * be grouped client-side without a second lookup.
 * @param {unknown} raw
 */
export function groupForRawCode(raw) {
  const code = normalizeCode(raw);
  if (!code) return 'otro';
  for (const group of CATEGORY_GROUPS) {
    if (group.codes.some((c) => c.code === code)) return group.id;
  }
  return 'otro';
}

/**
 * Clamp a requested date window to something Socrata can answer quickly.
 *
 * The full dataset holds ~6.1M rows and an unbounded scan times out, so the
 * window is *reduced* rather than rejected, and the caller is told it happened so
 * the UI can say so out loud.
 *
 * @param {{ from?: string, to?: string, maxDays?: number }} input
 * @returns {{ from: string, to: string, clamped: boolean, maxDays: number }}
 */
export function clampWindow({ from, to, maxDays = config.query.maxWindowDays }) {
  const today = todayISO();
  // The per-mode cap can only lower the global ceiling, never raise it.
  const cap = Math.min(maxDays, config.query.maxWindowDays);

  let toDate = isISODate(to) ? to : today;
  if (daysBetween(toDate, today) < 0) toDate = today; // no future windows

  const defaultSpan = Math.min(config.query.defaultWindowDays, cap);
  let fromDate = isISODate(from) ? from : addDaysISO(toDate, -defaultSpan);

  const span = daysBetween(fromDate, toDate);
  let clamped = false;
  if (span < 0) {
    fromDate = addDaysISO(toDate, -defaultSpan);
    clamped = true;
  } else if (span > cap) {
    fromDate = addDaysISO(toDate, -cap);
    clamped = true;
  }

  return { from: fromDate, to: toDate, clamped, maxDays: cap };
}
