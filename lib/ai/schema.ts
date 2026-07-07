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

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().finite().nonnegative(), // >= 0
  unit: z.string().optional(),
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
})

const sectionSchema = z.object({
  title: z.string(),
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
  sections: z.array(sectionSchema),
})

export type EstimateOutput = z.infer<typeof estimateOutputSchema>
