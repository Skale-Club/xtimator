// lib/estimate/document-blocks.ts
// SEED-056: which optional document blocks a NEW estimate carries.
//
// Pure -- no DB calls, no side effects. The company stores its preference in
// `companies.document_blocks` (nullable JSONB, all keys optional). At estimate
// creation we resolve that against what the company actually has configured
// (payment text, warranty text, fine print) and MATERIALISE the result into
// `estimates.presentation_settings.sections` (a copy, never a reference), so
// changing a company default later never alters an existing estimate.
//
// `resolvePresentationSettings` in ./presentation-settings keeps its
// all-visible fallback for NULL rows: legacy and sent/signed estimates are
// untouched by anything in this file.

import type { SectionVisibility } from './presentation-settings'

/** Optional blocks a company can switch on for new estimates. `sections`
 *  (line items) is core and not configurable. */
export const DOCUMENT_BLOCK_KEYS = [
  'summary',
  'payment_terms',
  'warranty_terms',
  'timeline',
  'notes',
  'photos',
  'estimate_terms',
  'valid_until',
] as const

export type DocumentBlockKey = (typeof DOCUMENT_BLOCK_KEYS)[number]

/** Raw shape persisted in companies.document_blocks (every key optional;
 *  absent = system default). */
export type DocumentBlocksRaw = Partial<Record<DocumentBlockKey, boolean>>

/** Fully-defaulted record: what a new estimate gets. */
export type DocumentBlocks = Record<DocumentBlockKey, boolean>

export interface DocumentBlocksContext {
  /** companies.default_payment_terms is non-empty. */
  hasPaymentText: boolean
  /** companies.default_warranty_terms is non-empty. */
  hasWarrantyText: boolean
  /** estimate_terms_enabled && estimate_terms_text non-empty. */
  hasEstimateTerms: boolean
  /** true for AI-generated estimates, false for blank manual ones. */
  isAiEstimate: boolean
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Tolerant parse of the JSONB column: NULL / malformed -> {}, non-boolean
 *  values are dropped. Never throws. */
export function parseDocumentBlocks(raw: unknown): DocumentBlocksRaw {
  if (!isPlainObject(raw)) return {}
  const out: DocumentBlocksRaw = {}
  for (const key of DOCUMENT_BLOCK_KEYS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean
  }
  return out
}

export function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

/** Build the context from a company row (any object carrying the columns). */
export function documentBlocksContext(
  company: {
    default_payment_terms?: string | null
    default_warranty_terms?: string | null
    estimate_terms_enabled?: boolean | null
    estimate_terms_text?: string | null
  },
  isAiEstimate: boolean,
): DocumentBlocksContext {
  return {
    hasPaymentText: hasText(company.default_payment_terms),
    hasWarrantyText: hasText(company.default_warranty_terms),
    hasEstimateTerms: !!company.estimate_terms_enabled && hasText(company.estimate_terms_text),
    isAiEstimate,
  }
}

/**
 * Resolve the company preference into the fully-defaulted block record.
 *
 *  - summary: AI estimates only; the company switch ("AI summary") can turn it
 *    off globally. Blank manual estimates never start with a summary.
 *  - payment_terms / warranty_terms: on iff the company has text AND has not
 *    switched the block off.
 *  - estimate_terms: on iff the company enabled its fine print AND has not
 *    switched the block off.
 *  - timeline / notes / valid_until: off unless the company opted in.
 *  - photos: on unless the company opted out (attachment is the real opt-in).
 */
export function resolveDocumentBlocks(
  raw: unknown,
  ctx: DocumentBlocksContext,
): DocumentBlocks {
  const blocks = parseDocumentBlocks(raw)
  return {
    summary: ctx.isAiEstimate && blocks.summary !== false,
    payment_terms: ctx.hasPaymentText && blocks.payment_terms !== false,
    warranty_terms: ctx.hasWarrantyText && blocks.warranty_terms !== false,
    timeline: blocks.timeline === true,
    notes: blocks.notes === true,
    photos: blocks.photos !== false,
    estimate_terms: ctx.hasEstimateTerms && blocks.estimate_terms !== false,
    valid_until: blocks.valid_until === true,
  }
}

/** The object written to estimates.presentation_settings.sections at creation.
 *  Every key is explicit so the estimate no longer depends on resolver
 *  fallbacks or on later company changes. */
export function initialSectionVisibility(blocks: DocumentBlocks): Required<SectionVisibility> {
  return {
    summary: blocks.summary,
    sections: true,
    payment_terms: blocks.payment_terms,
    timeline: blocks.timeline,
    warranty_terms: blocks.warranty_terms,
    notes: blocks.notes,
    photos: blocks.photos,
    estimate_terms: blocks.estimate_terms,
    valid_until: blocks.valid_until,
  }
}

/** Which prose fields the AI may author for this company. */
export function aiAuthoredFields(blocks: DocumentBlocks): { timeline: boolean; notes: boolean } {
  return { timeline: blocks.timeline, notes: blocks.notes }
}

/** Convenience: the full `presentation_settings` object for a new estimate. */
export function initialPresentationSettings(
  rawCompanyBlocks: unknown,
  ctx: DocumentBlocksContext,
): { sections: Required<SectionVisibility> } {
  return { sections: initialSectionVisibility(resolveDocumentBlocks(rawCompanyBlocks, ctx)) }
}

/**
 * D4: the "Valid until" date (YYYY-MM-DD) for a new estimate =
 * (estimate_date or today) + default_validity_days. Null when the company has
 * no usable validity. Calendar arithmetic is done in UTC so it never drifts by
 * a day with the server's timezone.
 */
export function computeValidUntil(
  estimateDate: string | null | undefined,
  validityDays: number | null | undefined,
  today: Date = new Date(),
): string | null {
  const days = Number(validityDays)
  if (!Number.isFinite(days) || days <= 0) return null
  const base = typeof estimateDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(estimateDate)
    ? new Date(`${estimateDate.slice(0, 10)}T00:00:00Z`)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + Math.floor(days))
  return base.toISOString().slice(0, 10)
}
