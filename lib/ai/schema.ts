// lib/ai/schema.ts
//
// GUARD-01 — the authoritative zod schema for AI estimate output. This is the
// SECOND, authoritative validation gate over the OpenRouter/Gemini create_estimate
// tool-call JSON (the tool schema is advisory; models still drift). It mirrors the
// shape of `lib/ai/types.ts` EstimateOutput and is the single source of truth:
// `EstimateOutput = z.infer<typeof estimateOutputSchema>` (re-exported from types.ts)
// so the validator and the type can never drift.
//
// The D-15 price_source defensive coercion (anything != 'price_book' → 'ai_estimate')
// and the suggested_client_name trim/null transform live HERE (as a zod preprocess /
// transform) so `normalizeOutput` becomes a thin, non-throwing safeParse wrapper.
import { z } from 'zod'
import { normalizeUnit } from './units'

// SEED-057 Phase A — output contract v2. Every addition below is OPTIONAL and
// TOLERANT: a missing or malformed value becomes `undefined` instead of
// rejecting the whole generation, so legacy/cached outputs and sloppy models
// keep parsing.
const ENUM3 = ['low', 'medium', 'high'] as const
type Level = (typeof ENUM3)[number]

export function toLevel(v: unknown): Level | undefined {
  return typeof v === 'string' && (ENUM3 as readonly string[]).includes(v.toLowerCase())
    ? (v.toLowerCase() as Level)
    : undefined
}

export function toShortText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t.slice(0, max) : undefined
}

/** A list of short strings: trimmed, de-duplicated, capped. Not an array -> undefined. */
export function toTextList(v: unknown, maxItems: number, maxChars: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: string[] = []
  for (const entry of v) {
    const t = toShortText(entry, maxChars)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= maxItems) break
  }
  return out.length > 0 ? out : undefined
}

export const openQuestionSchema = z.object({
  question: z.string(),
  impact: z.enum(ENUM3),
})
export type OpenQuestion = z.infer<typeof openQuestionSchema>

export function toOpenQuestions(v: unknown): OpenQuestion[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: OpenQuestion[] = []
  for (const entry of v) {
    const asObject = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
    const question = toShortText(asObject ? asObject.question : entry, 300)
    if (!question || out.some((q) => q.question === question)) continue
    out.push({ question, impact: toLevel(asObject?.impact) ?? 'medium' })
    if (out.length >= 8) break
  }
  return out.length > 0 ? out : undefined
}

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().finite().nonnegative(), // >= 0
  // SEED-057: known synonyms (sqft, hrs, lf...) fold into the closed unit list;
  // anything else is kept as written (see lib/ai/units.ts).
  unit: z.string().transform(normalizeUnit).optional(),
  unit_price: z.number().finite().nonnegative(), // >= 0
  // D-15 defensive coercion expressed as a preprocess so a missing/garbage value
  // never rejects the whole parse — anything other than exact 'price_book' → 'ai_estimate'.
  price_source: z.preprocess(
    (v) => (v === 'price_book' || v === 'researched' ? v : 'ai_estimate'),
    z.enum(['price_book', 'ai_estimate', 'researched'])
  ),
  // TAX-02 — per-item AI CLASSIFICATION INPUT (labor vs materials). Both OPTIONAL
  // and additive: omitting them keeps existing AI output validating byte-identically.
  // NO `.default(true)` here — the schema must leave omitted fields as `undefined`
  // so the retrocompat path holds; the taxable=true default is applied SERVER-SIDE
  // in Plan 130-02. The AI never computes tax — it only labels the item.
  taxable: z.boolean().optional(),
  tax_category: z.enum(['labor', 'materials', 'other']).optional().nullable(),
  // DISC-01 — per-item line discount as an OPTIONAL AI INPUT (an AMOUNT, not a percent).
  // The AI may SUGGEST a line discount; it NEVER computes the subtotal/total — the server
  // engine subtracts it (compute-totals.ts `item.discount ?? 0`). NO `.default` so omission
  // stays byte-identical (the ENG-02 retrocompat posture); non-negative because a discount
  // is a positive reduction amount.
  discount: z.number().finite().nonnegative().optional(),
  // MARK-01 — optional cost + markup_pct AI INPUTS. The AI provides cost + markup; the SERVER
  // derives unit_price = round2(cost × (1 + markup_pct/100)). NO `.default` so omission stays
  // byte-identical (ENG-02). Non-negative. The AI NEVER computes the marked-up price.
  cost: z.number().finite().nonnegative().optional(),
  markup_pct: z.number().finite().nonnegative().optional(),
  // SEED-057 — per-line AI metadata (owner-facing, never on a client surface).
  confidence: z.unknown().transform(toLevel).optional(),
  basis: z.unknown().transform((v) => toShortText(v, 240)).optional(),
  optional: z.unknown().transform((v) => (typeof v === 'boolean' ? v : undefined)).optional(),
})

const sectionSchema = z.object({
  title: z.string(),
  // SEED-057: one line on what the section covers.
  purpose: z.unknown().transform((v) => toShortText(v, 200)).optional(),
  items: z.array(lineItemSchema),
})

export const estimateOutputSchema = z.object({
  suggested_project_name: z.string(),
  // mirror normalize's old trim + empty→null behavior as a transform.
  suggested_client_name: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null)),
  // QUICK-mv1-01 — the trade/category of the REQUESTED work, inferred by the AI
  // independent of company.industry (a soft prior — see prompt-builder.ts). Optional
  // so legacy/cached outputs (generated before this field existed) still parse.
  detected_trade: z.string().optional(),
  summary: z.string(),
  notes: z.string().optional(),
  timeline: z.string().optional(),
  payment_terms: z.string().optional(),
  warranty_terms: z.string().optional(),
  // SEED-057 — scope boundaries and uncertainty. Persisted in estimates.ai_meta
  // and shown to the OWNER only; never rendered for the client.
  assumptions: z.unknown().transform((v) => toTextList(v, 12, 300)).optional(),
  exclusions: z.unknown().transform((v) => toTextList(v, 12, 300)).optional(),
  open_questions: z.unknown().transform(toOpenQuestions).optional(),
  scope_confidence: z.unknown().transform(toLevel).optional(),
  sections: z.array(sectionSchema),
})

export type EstimateOutput = z.infer<typeof estimateOutputSchema>
