/**
 * lib/estimate/quality/structure-score.ts
 *
 * SEED-057 Phase D: a deterministic 0-100 score for HOW WELL STRUCTURED a
 * generated estimate is, so a thin or sloppy draft is seen for what it is.
 * `isVagueEstimate` only catches $0 / empty; a three-line "$2,400 misc"
 * estimate passed it. This does not replace that gate (the $0 rule stays the
 * hard floor), it sits beside it.
 *
 * Pure: no I/O, no clock, never throws. The same function scores production
 * output (generate-estimate.ts) and the eval rubric (tests/eval/rubric.ts), so
 * a prompt change is judged by exactly what ships.
 *
 * Bands (SEED-057 D):
 *   score < 50  -> 'refine'  one targeted refine pass (findings become the hint)
 *   50 - 69     -> 'review'  deliver, with an "AI needs review" banner
 *   >= 70       -> 'ok'      deliver
 *
 * Every finding carries two texts: `message` for the OWNER (shown in the
 * banner) and `hint`, an instruction for the model on the targeted refine.
 */
import type { Playbook } from '@/lib/ai/playbooks'
import { CANONICAL_UNITS, normalizeUnit } from '@/lib/ai/units'
import type { QualityBand } from '@/lib/estimate/ai-meta'

export const REFINE_BELOW = 50
export const REVIEW_BELOW = 70

export type FindingCode =
  | 'thin_estimate'
  | 'empty_section'
  | 'bad_unit'
  | 'zero_quantity'
  | 'missing_basis'
  | 'missing_mandatory'
  | 'duplicate_description'
  | 'misc_heavy'
  | 'missing_summary'
  | 'too_many_questions'
  | 'off_vocabulary'

export interface StructureFinding {
  code: FindingCode
  /** For the owner, English. */
  message: string
  /** An instruction to the model for the targeted refine pass. */
  hint: string
  /** Points taken off the score. */
  penalty: number
}

export interface StructureItem {
  description: string
  quantity: number
  unit?: string | null
  unit_price: number
  basis?: string | null
}

export interface StructureSection {
  title: string
  items: StructureItem[]
}

export interface StructureInput {
  summary?: string | null
  sections: StructureSection[]
  /** The playbook the estimate was generated under. */
  playbook: Playbook
  /** Count of open questions the model raised. */
  openQuestions?: number
  /**
   * Whether the source material states measurements. When it does, lines are
   * expected to say where their quantity comes from.
   */
  hasMeasurements?: boolean
  /** Estimate language. The English-only checks (units, vocabulary, mandatory lines) skip other languages. */
  language?: 'en' | 'pt' | 'es'
}

export interface StructureResult {
  score: number
  band: QualityBand
  findings: StructureFinding[]
}

const MISC_RE = /^(misc|miscellaneous|other|sundry|various|general allowance|contingency|allowance)\b/i
const MISC_SHARE_LIMIT = 0.15
const THIN_BIG_JOB = 1_000
const MANDATORY_MIN_ITEMS = 4

function lineTotal(item: StructureItem): number {
  const t = item.quantity * item.unit_price
  return Number.isFinite(t) ? t : 0
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function quote(items: StructureItem[], max = 2): string {
  const names = items.slice(0, max).map((i) => `"${i.description.trim()}"`)
  const extra = items.length - max
  return extra > 0 ? `${names.join(', ')} and ${extra} more` : names.join(', ')
}

/** A section title belongs to the playbook's vocabulary when they share a significant word. */
function inVocabulary(title: string, vocabulary: string[]): boolean {
  const words = norm(title).split(' ').filter((w) => w.length > 2 && w !== 'and')
  if (words.length === 0) return true
  if (/^(other|misc|miscellaneous|add ons?|extras?|options?|allowances?)$/.test(norm(title))) return true
  return vocabulary.some((v) => {
    const vw = norm(v).split(' ').filter((w) => w.length > 2 && w !== 'and')
    return vw.some((w) => words.includes(w) || words.some((x) => x.startsWith(w) || w.startsWith(x)))
  })
}

/** Heuristic: does the source text state a measurement a quantity could be derived from? */
export function mentionsMeasurements(text: string): boolean {
  return (
    /\b\d+(\.\d+)?\s*(x|by|×)\s*\d+/i.test(text) ||
    /\b\d+(\.\d+)?\s*(sq\.?\s*ft|square\s*(feet|foot)|sqft|linear\s*(ft|feet)|ft|feet|foot|m2|m²|metros?|pés)\b/i.test(text)
  )
}

export function scoreStructure(input: StructureInput): StructureResult {
  const findings: StructureFinding[] = []
  const english = (input.language ?? 'en') === 'en'
  // Never trust the shape: a null section or items list must not throw.
  const sections = (Array.isArray(input.sections) ? input.sections : []).filter(
    (s): s is StructureSection => !!s && typeof s === 'object',
  )
  const items = sections.flatMap((s) => (Array.isArray(s.items) ? s.items : []))
  const total = items.reduce((sum, i) => sum + lineTotal(i), 0)
  const add = (f: StructureFinding) => {
    if (f.penalty > 0) findings.push(f)
  }

  // Thin: a big job priced as a couple of lines.
  if (items.length > 0 && items.length < 3 && total >= THIN_BIG_JOB) {
    add({
      code: 'thin_estimate',
      penalty: 20,
      message: `Only ${items.length} line${items.length === 1 ? '' : 's'} for a job of this size.`,
      hint: `Break the work into more specific line items; ${items.length} line${items.length === 1 ? ' is' : 's are'} too coarse for a job this size.`,
    })
  }

  // Empty sections.
  const empty = sections.filter((s) => !s.items || s.items.length === 0)
  if (empty.length > 0) {
    add({
      code: 'empty_section',
      penalty: Math.min(20, empty.length * 10),
      message: `Empty section${empty.length > 1 ? 's' : ''}: ${empty.map((s) => `"${s.title}"`).join(', ')}.`,
      hint: `Fill or remove the empty section${empty.length > 1 ? 's' : ''} ${empty.map((s) => `"${s.title}"`).join(', ')}.`,
    })
  }

  // Units from the closed list (English estimates; other languages only need a unit).
  const known = new Set<string>(CANONICAL_UNITS)
  const badUnit = items.filter((i) => {
    const unit = (i.unit ?? '').trim()
    if (!unit) return true
    return english && !known.has(normalizeUnit(unit))
  })
  if (items.length > 0 && badUnit.length > 0) {
    const share = badUnit.length / items.length
    add({
      code: 'bad_unit',
      penalty: Math.min(20, Math.round(20 * Math.min(1, share * 1.5))),
      message: `${badUnit.length} line${badUnit.length > 1 ? 's' : ''} without a standard unit: ${quote(badUnit)}.`,
      hint: `Give ${quote(badUnit)} a unit from: ${CANONICAL_UNITS.join(', ')}.`,
    })
  }

  // Quantities that are zero on a priced line.
  const zeroQty = items.filter((i) => !(i.quantity > 0) && i.unit_price > 0)
  if (zeroQty.length > 0) {
    add({
      code: 'zero_quantity',
      penalty: Math.min(15, zeroQty.length * 5),
      message: `${zeroQty.length} priced line${zeroQty.length > 1 ? 's' : ''} with no quantity: ${quote(zeroQty)}.`,
      hint: `Set a real quantity for ${quote(zeroQty)}.`,
    })
  }

  // A basis for the quantity when the source states measurements.
  if (input.hasMeasurements && items.length > 0) {
    const noBasis = items.filter((i) => !(i.basis ?? '').trim())
    const share = noBasis.length / items.length
    if (share > 0.5) {
      add({
        code: 'missing_basis',
        penalty: Math.min(15, Math.round(15 * share)),
        message: `The walkthrough states measurements, but ${noBasis.length} of ${items.length} lines do not say where their quantity comes from.`,
        hint: `The source material states measurements. Derive the quantity of ${quote(noBasis)} from them and give each line a one-line basis.`,
      })
    }
  }

  // Lines the trade expects (prep, disposal, cleanup...), for estimates big enough to need them.
  if (english && items.length >= MANDATORY_MIN_ITEMS) {
    const text = items.map((i) => i.description.toLowerCase()).join('\n')
    const missing = input.playbook.mandatory.filter((m) => !m.match.some((w) => text.includes(w)))
    if (missing.length > 0) {
      add({
        code: 'missing_mandatory',
        penalty: Math.min(24, missing.length * 8),
        message: missing.map((m) => m.label).join('; ') + '.',
        hint: `Add the missing line${missing.length > 1 ? 's' : ''}: ${missing.map((m) => m.label.replace(/^No /, '')).join('; ')}.`,
      })
    }
  }

  // Same description twice (exact copies were already collapsed upstream).
  const seen = new Map<string, number>()
  for (const i of items) seen.set(norm(i.description), (seen.get(norm(i.description)) ?? 0) + 1)
  const dupes = [...seen.entries()].filter(([, n]) => n > 1)
  if (dupes.length > 0) {
    add({
      code: 'duplicate_description',
      penalty: Math.min(15, dupes.length * 5),
      message: `Repeated line${dupes.length > 1 ? 's' : ''}: ${dupes.slice(0, 2).map(([d]) => `"${d}"`).join(', ')}.`,
      hint: `Merge or differentiate the repeated lines: ${dupes.slice(0, 3).map(([d]) => `"${d}"`).join(', ')}.`,
    })
  }

  // A "misc / other" bucket carrying too much of the job.
  if (total > 0) {
    const miscSectionTitles = new Set(
      sections.filter((s) => /^(other|misc|miscellaneous)$/i.test(norm(s.title))).map((s) => s.title),
    )
    const miscTotal = sections.reduce(
      (sum, s) =>
        sum +
        (s.items ?? []).reduce(
          (t, i) => t + (miscSectionTitles.has(s.title) || MISC_RE.test(i.description.trim()) ? lineTotal(i) : 0),
          0,
        ),
      0,
    )
    if (miscTotal / total > MISC_SHARE_LIMIT) {
      add({
        code: 'misc_heavy',
        penalty: 15,
        message: `${Math.round((miscTotal / total) * 100)}% of the total sits in "misc / other" lines.`,
        hint: 'Replace the "misc / other" lines with specific, itemised work; none may carry more than 15% of the total.',
      })
    }
  }

  if (!(input.summary ?? '').trim() || (input.summary ?? '').trim().length < 20) {
    add({
      code: 'missing_summary',
      penalty: 10,
      message: 'No scope summary.',
      hint: 'Write a 2-4 sentence summary of the work: what, where and for whom.',
    })
  }

  if ((input.openQuestions ?? 0) > 5) {
    add({
      code: 'too_many_questions',
      penalty: 5,
      message: `${input.openQuestions} open questions: too many to be useful.`,
      hint: 'Keep only the 5 open questions that move the price the most.',
    })
  }

  // Section titles outside the playbook's vocabulary (English only; minor).
  if (english) {
    const off = sections.filter((s) => s.items?.length && !inVocabulary(s.title, input.playbook.sections))
    if (off.length > 0) {
      add({
        code: 'off_vocabulary',
        penalty: Math.min(8, off.length * 2),
        message: `Section titles outside the ${input.playbook.label.toLowerCase()} layout: ${off.slice(0, 2).map((s) => `"${s.title}"`).join(', ')}.`,
        hint: `Use the playbook's section titles (${input.playbook.sections.join(', ')}) instead of ${off.slice(0, 2).map((s) => `"${s.title}"`).join(', ')}.`,
      })
    }
  }

  const penalty = findings.reduce((sum, f) => sum + f.penalty, 0)
  const score = Math.max(0, Math.min(100, 100 - penalty))
  const band: QualityBand = score < REFINE_BELOW ? 'refine' : score < REVIEW_BELOW ? 'review' : 'ok'
  return { score, band, findings }
}
