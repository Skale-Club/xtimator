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
  // pt / es spellings a model may still emit: map them back into the closed list
  un: 'each',
  und: 'each',
  unid: 'each',
  unidad: 'each',
  unidade: 'each',
  unidades: 'each',
  h: 'hour',
  hora: 'hour',
  horas: 'hour',
  dia: 'day',
  dias: 'day',
  'día': 'day',
  'días': 'day',
  'diária': 'day',
  'diárias': 'day',
  diaria: 'day',
  diarias: 'day',
  servico: 'job',
  'serviço': 'job',
  servicio: 'job',
  global: 'job',
  verba: 'job',
  empreitada: 'job',
  'pés quadrados': 'sq ft',
  'pé quadrado': 'sq ft',
  'pes quadrados': 'sq ft',
  'pe quadrado': 'sq ft',
  'pies cuadrados': 'sq ft',
  'pie cuadrado': 'sq ft',
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

/**
 * Known synonym -> canonical unit; anything else -> the input, trimmed. Metric units (m2, m, kg)
 * are deliberately NOT mapped: converting silently would put a wrong quantity under a US unit.
 * The structure score flags them for the owner instead (see isMetricUnit).
 */
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

/** m, m2, m², m3, cm, km, kg, l, metro(s)...: a unit this US-only product must not accept silently. */
export function isMetricUnit(raw: string | null | undefined): boolean {
  if (!raw) return false
  return /^(m|m2|m²|m3|m³|mt|mts|cm|mm|km|kg|g|l|lt|litro|litros|liter|liters|metro|metros|metre|metres|meter|meters|metro quadrado|metros quadrados|metro cuadrado|metros cuadrados)$/.test(fold(raw))
}
