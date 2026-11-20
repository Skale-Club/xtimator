import { parseAiMeta } from '@/lib/estimate/ai-meta'
import { MAX_OWNER_QUESTIONS } from '@/lib/estimate/question-limits'

export interface OwnerEstimateReview {
  questions: string[]
  assumptions: string[]
  needsReview: boolean
  lowConfidenceLines: number
  unpricedLines: number
}

interface ReviewItem {
  confidence?: unknown
  unit_price?: unknown
  description?: unknown
}

const QUESTION_PRIORITY = { low: 0, medium: 1, high: 2 } as const
const MAX_TEXT_LENGTH = 240

function boundedText(value: string): string {
  return Array.from(value.trim()).slice(0, MAX_TEXT_LENGTH).join('').trimEnd()
}

/** Builds the owner-facing review from generation notes and the saved line items. */
export function buildOwnerEstimateReview(input: {
  ai_meta?: unknown
  sections?: readonly { items?: readonly ReviewItem[] }[]
}): OwnerEstimateReview | null {
  const meta = parseAiMeta(input.ai_meta)
  // The owner sees few questions, and only ones that move the price: a
  // low-impact question is noise (owner rule 2026-11-20, "not pesky").
  const questions = (meta?.open_questions ?? [])
    .filter((q) => q.impact !== 'low')
    .sort((a, b) => QUESTION_PRIORITY[b.impact] - QUESTION_PRIORITY[a.impact])
    .slice(0, MAX_OWNER_QUESTIONS)
    .map(({ question }) => boundedText(question))
  const assumptions = (meta?.assumptions ?? []).slice(0, 3).map(boundedText)

  let lowConfidenceLines = 0
  let unpricedLines = 0
  const sections = Array.isArray(input.sections) ? input.sections : []
  for (const section of sections) {
    const items = Array.isArray(section?.items) ? section.items : []
    for (const item of items) {
      if (typeof item?.description !== 'string' || !item.description.trim()) continue
      if (item.confidence === 'low') lowConfidenceLines++
      const price = item.unit_price
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) unpricedLines++
    }
  }

  const needsReview = questions.length > 0 ||
    (assumptions.length > 0 && meta?.scope_confidence === 'low') ||
    meta?.quality?.band === 'review' || meta?.quality?.band === 'refine' ||
    lowConfidenceLines > 0 || unpricedLines > 0

  if (!needsReview && assumptions.length === 0) return null
  return { questions, assumptions, needsReview, lowConfidenceLines, unpricedLines }
}
