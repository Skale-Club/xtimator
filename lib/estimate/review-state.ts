/**
 * Notices review, stage 1 (2026-11-20): what still needs the owner's eye on a
 * draft estimate, in ONE place, so every surface agrees:
 *
 *   - the document row (an empty price slot, a "suggested by the AI" mark),
 *   - the "Edit with AI" dock counter and its question cards,
 *   - the "Ready to send?" checklist in the Share sheet.
 *
 * Owner-facing only. Copy built from this never explains HOW a price was
 * reached (business internals, owner rule 2026-11-20): a mark says "suggested
 * by the AI, check it", nothing more.
 *
 * Which AI questions the owner already answered or skipped lives in this
 * browser (localStorage), keyed by estimate id. Writing it to the estimate row
 * would restamp estimates.updated_at, the editor's compare-and-set token.
 */

export interface ReviewItemLike {
  description?: string | null
  unit_price?: number | null
  price_source?: string | null
  confidence?: string | null
  isManuallyEdited?: boolean
}

export interface ReviewSectionLike {
  items: readonly ReviewItemLike[]
}

function hasDescription(item: ReviewItemLike): boolean {
  return typeof item.description === 'string' && item.description.trim().length > 0
}

/** A real line with no positive price: the row shows the "Add price" slot. */
export function isUnpriced(item: ReviewItemLike): boolean {
  if (!hasDescription(item)) return false
  const p = item.unit_price
  return !(typeof p === 'number' && Number.isFinite(p) && p > 0)
}

/**
 * A priced line the AI was unsure about and the owner has not confirmed or
 * changed. Confirming sets isManuallyEdited, which saves price_source = null,
 * so the mark stays gone after a reload and on every device.
 */
export function needsPriceCheck(item: ReviewItemLike): boolean {
  if (!hasDescription(item) || isUnpriced(item)) return false
  if (item.isManuallyEdited) return false
  if (item.price_source == null) return false
  return item.confidence === 'low'
}

// ---------------------------------------------------------------------------
// Answered / skipped AI questions (per browser)
// ---------------------------------------------------------------------------

export interface ResolvedQuestions {
  answered: string[]
  skipped: string[]
}

export const REVIEW_CHANGED_EVENT = 'xtm:review-changed'

const EMPTY: ResolvedQuestions = { answered: [], skipped: [] }

function storageKey(estimateId: string): string {
  return `xtm:review:${estimateId}`
}

function normalize(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function readResolvedQuestions(estimateId: string | null | undefined): ResolvedQuestions {
  if (!estimateId) return EMPTY
  try {
    const raw = window.localStorage.getItem(storageKey(estimateId))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ResolvedQuestions>
    return {
      answered: Array.isArray(parsed.answered) ? parsed.answered.filter((s) => typeof s === 'string') : [],
      skipped: Array.isArray(parsed.skipped) ? parsed.skipped.filter((s) => typeof s === 'string') : [],
    }
  } catch {
    return EMPTY
  }
}

function writeResolvedQuestions(estimateId: string, value: ResolvedQuestions): void {
  try {
    window.localStorage.setItem(storageKey(estimateId), JSON.stringify(value))
  } catch {
    // Private mode / blocked storage: the marks just come back next time.
  }
  try {
    window.dispatchEvent(new CustomEvent(REVIEW_CHANGED_EVENT, { detail: { estimateId } }))
  } catch {
    // no window (tests without DOM)
  }
}

/** Record questions as answered (they leave the list) or skipped (they stay, marked). */
export function resolveQuestions(
  estimateId: string,
  questions: { answered?: readonly string[]; skipped?: readonly string[] },
): void {
  const cur = readResolvedQuestions(estimateId)
  const answered = new Set(cur.answered.map(normalize))
  const skipped = new Set(cur.skipped.map(normalize))
  for (const q of questions.answered ?? []) {
    answered.add(normalize(q))
    skipped.delete(normalize(q))
  }
  for (const q of questions.skipped ?? []) {
    if (!answered.has(normalize(q))) skipped.add(normalize(q))
  }
  writeResolvedQuestions(estimateId, { answered: [...answered], skipped: [...skipped] })
}

/** Questions still waiting for an answer (skipped ones included: they can still be answered). */
export function openQuestions(questions: readonly string[], resolved: ResolvedQuestions): string[] {
  const answered = new Set(resolved.answered.map(normalize))
  return questions.filter((q) => q.trim() && !answered.has(normalize(q)))
}

export function isSkipped(question: string, resolved: ResolvedQuestions): boolean {
  return resolved.skipped.map(normalize).includes(normalize(question))
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface ReviewSummary {
  unpriced: number
  priceChecks: number
  /** Open (unanswered, not skipped) AI questions: drives the dock counter. */
  pendingQuestions: string[]
  /** Every unanswered question, skipped ones included: the sheet lists these. */
  openQuestions: string[]
  /** Nothing left to look at. */
  clear: boolean
}

export function summarizeReview(input: {
  sections: readonly ReviewSectionLike[]
  questions?: readonly string[] | null
  resolved?: ResolvedQuestions
}): ReviewSummary {
  let unpriced = 0
  let priceChecks = 0
  for (const s of input.sections) {
    for (const item of s.items ?? []) {
      if (isUnpriced(item)) unpriced++
      else if (needsPriceCheck(item)) priceChecks++
    }
  }
  const resolved = input.resolved ?? EMPTY
  const open = openQuestions(input.questions ?? [], resolved)
  const pending = open.filter((q) => !isSkipped(q, resolved))
  return {
    unpriced,
    priceChecks,
    pendingQuestions: pending,
    openQuestions: open,
    clear: unpriced === 0 && priceChecks === 0 && pending.length === 0,
  }
}
