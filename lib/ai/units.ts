// lib/ai/units.ts
//
// SEED-057 Phase A: the closed list of units the estimator speaks, and a
// normaliser that folds the usual English synonyms into it.
//
// Tolerant by design: a unit that is not a known synonym (a Portuguese "m2" or
// "horas", a trade-specific "gal") is passed through TRIMMED but otherwise
// untouched. The closed list guides the model (tool schema + prompt); it never
// rejects an output.

export const CANONICAL_UNITS = [
  'each',
  'hour',
  'sq ft',
  'linear ft',
  'cu yd',
  'day',
  'job',
] as const

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number]

/** Lowercase, drop punctuation and collapse whitespace: "Sq. Ft." -> "sq ft". */
function fold(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // "per sq ft", "/hr", "/ sq ft" are the same unit as "sq ft" / "hr".
    .replace(/^(per\s+|\/\s*)/, '')
    .trim()
}

const SYNONYMS: Record<string, CanonicalUnit> = {
  // each
  each: 'each',
  ea: 'each',
  unit: 'each',
  units: 'each',
  pc: 'each',
  pcs: 'each',
  piece: 'each',
  pieces: 'each',
  // hour
  hour: 'hour',
  hours: 'hour',
  hr: 'hour',
  hrs: 'hour',
  // sq ft
  'sq ft': 'sq ft',
  sqft: 'sq ft',
  sf: 'sq ft',
  'sq feet': 'sq ft',
  'sq foot': 'sq ft',
  'square feet': 'sq ft',
  'square foot': 'sq ft',
  'square ft': 'sq ft',
  // linear ft
  'linear ft': 'linear ft',
  'linear feet': 'linear ft',
  'linear foot': 'linear ft',
  'lin ft': 'linear ft',
  'lin feet': 'linear ft',
  linft: 'linear ft',
  'ln ft': 'linear ft',
  lnft: 'linear ft',
  lf: 'linear ft',
  // cu yd
  'cu yd': 'cu yd',
  cuyd: 'cu yd',
  cy: 'cu yd',
  'cubic yard': 'cu yd',
  'cubic yards': 'cu yd',
  'cubic yd': 'cu yd',
  // day
  day: 'day',
  days: 'day',
  // job
  job: 'job',
  jobs: 'job',
  'lump sum': 'job',
  lumpsum: 'job',
  ls: 'job',
  lot: 'job',
  'flat rate': 'job',
  flat: 'job',
}

/** Known synonym -> canonical unit; anything else -> the input, trimmed. */
export function normalizeUnit(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return trimmed
  return SYNONYMS[fold(trimmed)] ?? trimmed
}

/** Unit as it enters a concept key: canonical when known, else folded text. */
export function unitKey(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  return SYNONYMS[fold(trimmed)] ?? fold(trimmed)
}
