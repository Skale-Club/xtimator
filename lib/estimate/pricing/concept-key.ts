/**
 * lib/estimate/pricing/concept-key.ts
 *
 * SEED-057 Phase E: ONE stable key for "the same piece of work", so the same
 * job priced under different wording lands on the same company-history row and
 * the same in-run research lookup. "Install toilet", "Toilet installation" and
 * "Replace commode" are one concept; "Interior painting" and "Exterior
 * painting" are NOT (a substituted word never collapses, the lesson of
 * lib/ai/price-anchoring.ts).
 *
 * Pure. Deterministic across runs and across the two places it is used (when an
 * accepted estimate is recorded and when a new estimate is generated), so it
 * must not depend on the estimate's own context: synonyms come from the UNION of
 * every trade playbook, resolved in one fixed order.
 *
 *   fold accents, lowercase, drop punctuation
 *   -> fold synonym phrases into their canonical word (couch -> sofa ...)
 *   -> drop filler words and light plural stemming
 *   -> sort the remaining words
 *
 * Digits are KEPT: "2 bedroom clean" and "3 bedroom clean" are different jobs.
 */
import { PLAYBOOKS, type PlaybookId } from '@/lib/ai/playbooks'
import { unitKey } from '@/lib/ai/units'

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'and', 'with', 'to', 'in', 'on', 'at', 'by', 'per', 'from',
  'incl', 'including', 'include', 'includes', 'new', 'standard', 'basic',
  // NOT here on purpose: labor / material(s) / supply(ied) / provide(d). "Paint walls - labor" and
  // "Paint walls - materials" are different prices, and "Supply and install toilet" is not
  // "Install toilet".
  'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'um', 'uma',
])

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SynonymRule {
  phrase: string
  canonical: string
}

let rules: SynonymRule[] | null = null

/** Built once from every playbook; longest phrase first so "water heater" beats "heater". */
function synonymRules(): SynonymRule[] {
  if (rules) return rules
  const seen = new Map<string, string>()
  const ids = Object.keys(PLAYBOOKS).sort() as PlaybookId[]
  for (const id of ids) {
    for (const group of PLAYBOOKS[id].synonyms) {
      // Rules are written in STEMMED form, because the description is stemmed before the
      // phrase pass ("water heaters" must meet the "water heater" rule).
      const canonical = stemText(group[0])
      for (const word of group) {
        const phrase = stemText(word)
        if (phrase && !seen.has(phrase)) seen.set(phrase, canonical)
      }
    }
  }
  rules = [...seen.entries()]
    .map(([phrase, canonical]) => ({ phrase, canonical }))
    .sort((a, b) => b.phrase.length - a.phrase.length || a.phrase.localeCompare(b.phrase))
  return rules
}

/** Light plural stemming: walls -> wall, boxes -> box; never touches short words or "ss". */
function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('sses')) return word.slice(0, -2)
  if (word.endsWith('es') && /(x|ch|sh|z)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1)
  return word
}

/** Fold and stem every word of a text: "Water Heaters!" -> "water heater". */
function stemText(text: string): string {
  return fold(text)
    .split(' ')
    .filter(Boolean)
    .map(stem)
    .join(' ')
}

/** The concept of a line description. Empty string for a description with no usable word. */
export function conceptKey(description: string): string {
  // Stem FIRST, so plurals meet the phrase rules ("air conditioners" -> air_conditioner).
  let text = ` ${stemText(description)} `
  // Every matched phrase becomes its canonical form, glued with underscores so a LATER, shorter
  // rule cannot re-read it (an identity match used to be skipped, and then "heater" -> "furnace"
  // rewrote the "water heater" it sat inside).
  for (const { phrase, canonical } of synonymRules()) {
    text = text.replaceAll(` ${phrase} `, ` ${canonical.replace(/ /g, '_')} `)
  }
  const words = text.split(' ').filter(Boolean).filter((w) => !STOPWORDS.has(w))
  return [...new Set(words)].sort().join(' ')
}

export interface PriceConcept {
  /** Normalised description. */
  key: string
  /** Canonical unit ('sq ft', 'each', ...) or folded text; '' when the line has none. */
  unit: string
}

/** The (concept, unit) pair a price observation is filed under. */
export function priceConcept(description: string, unit: string | null | undefined): PriceConcept {
  return { key: conceptKey(description), unit: unitKey(unit) }
}

/** Map key for in-memory lookups of (concept, unit). */
export function conceptMapKey(concept: PriceConcept): string {
  return `${concept.key}@@${concept.unit}`
}
