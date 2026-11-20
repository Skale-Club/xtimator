// The owner-written texts of an estimate that change when its language
// changes: header texts, section titles and line descriptions. Pure (no I/O),
// shared by the translateEstimate action and its tests.

export type EstimateLanguageCode = 'en' | 'pt' | 'es'

type Item = { description: string | null }
type Section<I extends Item> = { title: string | null; items: I[] }

export interface TranslatableEstimate<I extends Item = Item, S extends Section<I> = Section<I>> {
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  sections: S[]
}

const HEADER_KEYS = ['summary', 'notes', 'timeline', 'payment_terms', 'warranty_terms'] as const

function worthTranslating(text: string | null | undefined): text is string {
  // Skip blanks and texts with no letters (numbers, "—", "N/A" stays as is too).
  return typeof text === 'string' && /\p{L}{2,}/u.test(text)
}

/** Unique texts to translate, in a stable order (header, then sections and their lines). */
export function collectEstimateTexts(estimate: TranslatableEstimate): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (t: string | null | undefined) => {
    if (!worthTranslating(t) || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  for (const key of HEADER_KEYS) add(estimate[key])
  for (const section of estimate.sections) {
    add(section.title)
    for (const item of section.items) add(item.description)
  }
  return out
}

/**
 * The estimate with every collected text replaced by its translation.
 * `translations` is aligned with collectEstimateTexts(estimate); a blank
 * translation keeps the original text.
 */
export function applyEstimateTranslations<I extends Item, S extends Section<I>, E extends TranslatableEstimate<I, S>>(
  estimate: E,
  translations: string[],
): E {
  const texts = collectEstimateTexts(estimate)
  const map = new Map<string, string>()
  texts.forEach((t, i) => {
    const next = translations[i]
    if (typeof next === 'string' && next.trim()) map.set(t, next)
  })
  const tr = <T extends string | null>(t: T): T => (t != null && map.has(t) ? (map.get(t) as T) : t)
  return {
    ...estimate,
    summary: tr(estimate.summary),
    notes: tr(estimate.notes),
    timeline: tr(estimate.timeline),
    payment_terms: tr(estimate.payment_terms),
    warranty_terms: tr(estimate.warranty_terms),
    sections: estimate.sections.map((s) => ({
      ...s,
      title: tr(s.title),
      items: s.items.map((i) => ({ ...i, description: tr(i.description) })),
    })),
  }
}
