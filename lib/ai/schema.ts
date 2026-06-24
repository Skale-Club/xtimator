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
  summary: z.string(),
  notes: z.string().optional(),
  timeline: z.string().optional(),
  payment_terms: z.string().optional(),
  warranty_terms: z.string().optional(),
  sections: z.array(sectionSchema),
})

export type EstimateOutput = z.infer<typeof estimateOutputSchema>
