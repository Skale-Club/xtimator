// lib/estimate/ai-meta.ts
//
// SEED-057: the owner-facing, AI-produced context stored in estimates.ai_meta.
//
//   assumptions / exclusions / open_questions / scope_confidence   (Phase A)
//   quality: structure score + the findings behind it              (Phase D)
//
// OWNER-FACING ONLY. Nothing in here may reach a client surface (share page,
// PDF, WhatsApp, plain-text message); the editor panel is its only reader.
//
// Pure helpers, no I/O. `parseAiMeta` is tolerant: it is fed whatever JSONB a
// row holds (including rows written by a future version) and never throws.
import type { EstimateOutput } from '@/lib/ai/types'
import type { OpenQuestion } from '@/lib/ai/schema'
import type { PriceChange } from '@/lib/estimate/pricing/resolve-prices'

export type AiLevel = 'low' | 'medium' | 'high'

/** Verdict bands of the structure score (Phase D). */
export type QualityBand = 'refine' | 'review' | 'ok'

export interface AiQuality {
  /** 0-100, see lib/estimate/quality/structure-score.ts. */
  score: number
  band: QualityBand
  /** Human-readable findings, English, shown to the owner as-is. */
  findings: string[]
}

/** Pricing observability: how research did and which lines ended up priced differently from the AI. */
export interface AiPricingRecord {
  research?: { candidates: number; cacheHits: number; providerUsable: number; missed: number; searches?: number }
  changes?: PriceChange[]
}

export interface AiMeta {
  v: 1
  assumptions?: string[]
  exclusions?: string[]
  open_questions?: OpenQuestion[]
  scope_confidence?: AiLevel
  quality?: AiQuality
  /**
   * INTERNAL record: the model's notes about the source material itself (duplicated
   * transcript, unclear audio). Written by buildAiMeta, deliberately NOT returned by
   * parseAiMeta, so no surface (editor included) can render it. Read it in the database.
   */
  source_notes?: string[]
  /**
   * INTERNAL record: price research telemetry and the AI-vs-final price of changed lines.
   * Written by buildAiMeta, deliberately NOT returned by parseAiMeta, so no surface (editor
   * included) can render it. Read it in the database.
   */
  pricing?: AiPricingRecord
}

const LEVELS: readonly string[] = ['low', 'medium', 'high']

/** The slice of AI output that persists, or null when the model said nothing. */
export function buildAiMeta(
  out: Pick<EstimateOutput, 'assumptions' | 'exclusions' | 'open_questions' | 'scope_confidence'> &
    Partial<Pick<EstimateOutput, 'source_notes'>>,
  quality?: AiQuality | null,
  pricing?: AiPricingRecord | null,
): AiMeta | null {
  const meta: AiMeta = { v: 1 }
  if (out.source_notes?.length) meta.source_notes = out.source_notes
  if (out.assumptions?.length) meta.assumptions = out.assumptions
  if (out.exclusions?.length) meta.exclusions = out.exclusions
  if (out.open_questions?.length) meta.open_questions = out.open_questions
  if (out.scope_confidence) meta.scope_confidence = out.scope_confidence
  if (quality) meta.quality = quality
  if (pricing && (pricing.research || pricing.changes?.length)) meta.pricing = pricing
  return Object.keys(meta).length > 1 ? meta : null
}

function strings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  return out.length > 0 ? out : undefined
}

/** Tolerant reader for a stored ai_meta value. Never throws. */
export function parseAiMeta(raw: unknown): AiMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const meta: AiMeta = { v: 1 }
  const assumptions = strings(r.assumptions)
  if (assumptions) meta.assumptions = assumptions
  const exclusions = strings(r.exclusions)
  if (exclusions) meta.exclusions = exclusions
  if (Array.isArray(r.open_questions)) {
    const qs: OpenQuestion[] = []
    for (const q of r.open_questions) {
      if (!q || typeof q !== 'object') continue
      const o = q as Record<string, unknown>
      if (typeof o.question !== 'string' || !o.question.trim()) continue
      qs.push({
        question: o.question.trim(),
        impact: typeof o.impact === 'string' && LEVELS.includes(o.impact) ? (o.impact as AiLevel) : 'medium',
      })
    }
    if (qs.length > 0) meta.open_questions = qs
  }
  if (typeof r.scope_confidence === 'string' && LEVELS.includes(r.scope_confidence)) {
    meta.scope_confidence = r.scope_confidence as AiLevel
  }
  const q = r.quality
  if (q && typeof q === 'object') {
    const o = q as Record<string, unknown>
    if (typeof o.score === 'number' && Number.isFinite(o.score)) {
      const band: QualityBand =
        o.band === 'refine' || o.band === 'review' || o.band === 'ok' ? o.band : 'ok'
      meta.quality = { score: o.score, band, findings: strings(o.findings) ?? [] }
    }
  }
  return Object.keys(meta).length > 1 ? meta : null
}

/**
 * True when a PostgREST / Postgres error says one of `columns` does not exist
 * yet (the migration has not been applied). Used to retry a write WITHOUT the
 * new columns so generation keeps working across the deploy window.
 */
export function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  columns: readonly string[],
): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  const looksMissing =
    error.code === 'PGRST204' || // PostgREST: column not found in the schema cache
    error.code === '42703' || // Postgres: undefined_column
    message.includes('could not find the') ||
    message.includes('does not exist')
  if (!looksMissing) return false
  return columns.some((c) => message.includes(c.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Owner-only data must never reach a client surface.
//
// estimates.ai_meta and the per-line confidence / basis / optional columns are
// for the OWNER's editor only. The public share loaders read whole rows
// (select '*') and hand them to a client component, so they strip these fields
// at the source, before the row is spread into anything that is serialised to
// the browser. Everything else (PDF, WhatsApp, the plain-text message) reads
// explicit columns and never sees them; tests/unit/estimate/
// ai-meta-client-surfaces.test.ts guards both.
// ---------------------------------------------------------------------------

export const OWNER_ONLY_ESTIMATE_COLUMNS = ['ai_meta'] as const
export const OWNER_ONLY_ITEM_COLUMNS = ['confidence', 'basis', 'optional'] as const

function without<T extends object>(row: T, columns: readonly string[]): T {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  for (const column of columns) delete copy[column]
  return copy as T
}

/** An estimate row without its owner-only AI context. */
export function stripOwnerOnlyEstimate<T extends object>(row: T): T {
  return without(row, OWNER_ONLY_ESTIMATE_COLUMNS)
}

/** An estimate_items row without its owner-only AI metadata. */
export function stripOwnerOnlyItem<T extends object>(row: T): T {
  return without(row, OWNER_ONLY_ITEM_COLUMNS)
}
