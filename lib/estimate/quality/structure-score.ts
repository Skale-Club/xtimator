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
import { CANONICAL_UNITS, isMetricUnit, normalizeUnit } from '@/lib/ai/units'
import type { QualityBand } from '@/lib/estimate/ai-meta'
import { isPriceBandsEnabled, priceOutsideBand } from '@/lib/estimate/pricing/price-bands'

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
  | 'price_out_of_band'

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
  /** Who priced the line; the playbook price band only judges 'ai_estimate' / 'researched' / unknown. */
  price_source?: string | null
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
  /**
   * The estimate's currency, for the playbook price bands (ESTIMATOR_PRICE_BANDS, default off),
   * which are written in USD. Absent = USD.
   */
  currencyCode?: string
}

export interface StructureResult {
  score: number
  band: QualityBand
  findings: StructureFinding[]
}

type Lang = 'en' | 'pt' | 'es'

/**
 * Owner-facing finding messages, in the ESTIMATE's language (the model hints stay English: they
 * are instructions to the model, which writes in the estimate language anyway). The checks that
 * only make sense for English wording (mandatory lines, section vocabulary) never run for pt/es,
 * so their messages exist in English only.
 */
const MESSAGES: Record<Lang, {
  thin: (n: number) => string
  emptySection: (titles: string[]) => string
  badUnit: (n: number, names: string) => string
  metricUnit: (n: number, names: string) => string
  zeroQuantity: (n: number, names: string) => string
  missingBasis: (n: number, total: number) => string
  duplicates: (n: number, names: string[]) => string
  miscHeavy: (pct: number) => string
  noSummary: string
  tooManyQuestions: (n: number) => string
  priceBand: (n: number, names: string) => string
}> = {
  en: {
    thin: (n) => `Only ${n} line${n === 1 ? '' : 's'} for a job of this size.`,
    emptySection: (t) => `Empty section${t.length > 1 ? 's' : ''}: ${t.join(', ')}.`,
    badUnit: (n, names) => `${n} line${n > 1 ? 's' : ''} without a standard unit: ${names}.`,
    metricUnit: (n, names) => `${n} line${n > 1 ? 's use' : ' uses'} a metric unit (estimates use US units): ${names}.`,
    zeroQuantity: (n, names) => `${n} priced line${n > 1 ? 's' : ''} with no quantity: ${names}.`,
    missingBasis: (n, total) => `The walkthrough states measurements, but ${n} of ${total} lines do not say where their quantity comes from.`,
    duplicates: (n, names) => `Repeated line${n > 1 ? 's' : ''}: ${names.join(', ')}.`,
    miscHeavy: (pct) => `${pct}% of the total sits in "misc / other" lines.`,
    noSummary: 'No scope summary.',
    tooManyQuestions: (n) => `${n} open questions: too many to be useful.`,
    priceBand: (n, names) => `${n} line${n > 1 ? 's' : ''} priced outside the usual range for this trade: ${names}.`,
  },
  pt: {
    thin: (n) => `Só ${n} ${n === 1 ? 'linha' : 'linhas'} para um serviço deste tamanho.`,
    emptySection: (t) => `${t.length > 1 ? 'Seções vazias' : 'Seção vazia'}: ${t.join(', ')}.`,
    badUnit: (n, names) => `${n} ${n > 1 ? 'linhas sem unidade padrão' : 'linha sem unidade padrão'}: ${names}.`,
    metricUnit: (n, names) => `${n} ${n > 1 ? 'linhas usam' : 'linha usa'} unidade métrica (os orçamentos usam unidades dos EUA): ${names}.`,
    zeroQuantity: (n, names) => `${n} ${n > 1 ? 'linhas com preço e sem quantidade' : 'linha com preço e sem quantidade'}: ${names}.`,
    missingBasis: (n, total) => `O áudio traz medidas, mas ${n} de ${total} linhas não dizem de onde vem a quantidade.`,
    duplicates: (n, names) => `${n > 1 ? 'Linhas repetidas' : 'Linha repetida'}: ${names.join(', ')}.`,
    miscHeavy: (pct) => `${pct}% do total está em linhas "diversos / outros".`,
    noSummary: 'Sem resumo do escopo.',
    tooManyQuestions: (n) => `${n} perguntas em aberto: demais para serem úteis.`,
    priceBand: (n, names) => `${n} ${n > 1 ? 'linhas com preço fora da faixa usual' : 'linha com preço fora da faixa usual'} deste serviço: ${names}.`,
  },
  es: {
    thin: (n) => `Solo ${n} ${n === 1 ? 'línea' : 'líneas'} para un trabajo de este tamaño.`,
    emptySection: (t) => `${t.length > 1 ? 'Secciones vacías' : 'Sección vacía'}: ${t.join(', ')}.`,
    badUnit: (n, names) => `${n} ${n > 1 ? 'líneas sin unidad estándar' : 'línea sin unidad estándar'}: ${names}.`,
    metricUnit: (n, names) => `${n} ${n > 1 ? 'líneas usan' : 'línea usa'} unidad métrica (los presupuestos usan unidades de EE. UU.): ${names}.`,
    zeroQuantity: (n, names) => `${n} ${n > 1 ? 'líneas con precio y sin cantidad' : 'línea con precio y sin cantidad'}: ${names}.`,
    missingBasis: (n, total) => `La grabación trae medidas, pero ${n} de ${total} líneas no dicen de dónde sale la cantidad.`,
    duplicates: (n, names) => `${n > 1 ? 'Líneas repetidas' : 'Línea repetida'}: ${names.join(', ')}.`,
    miscHeavy: (pct) => `${pct}% del total está en líneas "varios / otros".`,
    noSummary: 'Sin resumen del alcance.',
    tooManyQuestions: (n) => `${n} preguntas abiertas: demasiadas para ser útiles.`,
    priceBand: (n, names) => `${n} ${n > 1 ? 'líneas con precio fuera del rango habitual' : 'línea con precio fuera del rango habitual'} de este oficio: ${names}.`,
  },
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
  const lang: Lang = input.language ?? 'en'
  const english = lang === 'en'
  const M = MESSAGES[lang] ?? MESSAGES.en
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
      message: M.thin(items.length),
      hint: `Break the work into more specific line items; ${items.length} line${items.length === 1 ? ' is' : 's are'} too coarse for a job this size.`,
    })
  }

  // Empty sections.
  const empty = sections.filter((s) => !s.items || s.items.length === 0)
  if (empty.length > 0) {
    add({
      code: 'empty_section',
      penalty: Math.min(20, empty.length * 10),
      message: M.emptySection(empty.map((s) => `"${s.title}"`)),
      hint: `Fill or remove the empty section${empty.length > 1 ? 's' : ''} ${empty.map((s) => `"${s.title}"`).join(', ')}.`,
    })
  }

  // Units from the closed list (every language).
  const known = new Set<string>(CANONICAL_UNITS)
  const badUnit = items.filter((i) => {
    const unit = (i.unit ?? '').trim()
    if (!unit) return true
    // Units stay in the closed (US) list in EVERY language: only the copy is translated.
    return !known.has(normalizeUnit(unit))
  })
  if (items.length > 0 && badUnit.length > 0) {
    const share = badUnit.length / items.length
    const metric = badUnit.filter((i) => isMetricUnit(i.unit))
    add({
      code: 'bad_unit',
      penalty: Math.min(20, Math.round(20 * Math.min(1, share * 1.5))),
      message: metric.length > 0 ? M.metricUnit(badUnit.length, quote(badUnit)) : M.badUnit(badUnit.length, quote(badUnit)),
      hint:
        metric.length > 0
          ? `Use US units (${CANONICAL_UNITS.join(', ')}), not metric ones, for ${quote(badUnit)}; convert the quantity.`
          : `Give ${quote(badUnit)} a unit from: ${CANONICAL_UNITS.join(', ')}.`,
    })
  }

  // Quantities that are zero on a priced line.
  const zeroQty = items.filter((i) => !(i.quantity > 0) && i.unit_price > 0)
  if (zeroQty.length > 0) {
    add({
      code: 'zero_quantity',
      penalty: Math.min(15, zeroQty.length * 5),
      message: M.zeroQuantity(zeroQty.length, quote(zeroQty)),
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
        message: M.missingBasis(noBasis.length, items.length),
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
      message: M.duplicates(dupes.length, dupes.slice(0, 2).map(([d]) => `"${d}"`)),
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
        message: M.miscHeavy(Math.round((miscTotal / total) * 100)),
        hint: 'Replace the "misc / other" lines with specific, itemised work; none may carry more than 15% of the total.',
      })
    }
  }

  if (!(input.summary ?? '').trim() || (input.summary ?? '').trim().length < 20) {
    add({
      code: 'missing_summary',
      penalty: 10,
      message: M.noSummary,
      hint: 'Write a 2-4 sentence summary of the work: what, where and for whom.',
    })
  }

  if ((input.openQuestions ?? 0) > 5) {
    add({
      code: 'too_many_questions',
      penalty: 5,
      message: M.tooManyQuestions(input.openQuestions ?? 0),
      hint: 'Keep only the 5 open questions that move the price the most.',
    })
  }

  // Playbook price bands (ESTIMATOR_PRICE_BANDS, default off): a model/researched price outside the
  // trade's usual range is a finding for the owner. The price is NEVER changed here.
  if (isPriceBandsEnabled() && input.playbook.priceBands?.length) {
    const out = items.filter((i) => priceOutsideBand(input.playbook, i, input.currencyCode ?? 'USD') !== null)
    if (out.length > 0) {
      add({
        code: 'price_out_of_band',
        penalty: Math.min(12, out.length * 4),
        message: M.priceBand(out.length, quote(out)),
        hint: `Check the unit price of ${quote(out)}: it is outside the usual range for this trade. Correct it, or keep it and say why in the basis.`,
      })
    }
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
