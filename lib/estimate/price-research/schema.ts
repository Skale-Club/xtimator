/**
 * Price-research payload validation (Phase 107 — RSRC-02).
 *
 * The zod schema that validates a model's price-research payload BEFORE it is
 * trusted — mirrors the estimateOutputSchema / normalizeOutput discipline
 * (GUARD-01: never trust a raw model number). `safeParse` never throws on garbage.
 *
 * NOTE: the schema validates only the SHAPE — null unit_price/source_url/snippet
 * are valid here. The EVIDENCE GATE that rejects a citation-less guess lives in
 * `isUsableCandidate` (provider.ts), not in the schema.
 */
import { z } from 'zod'

export const priceResearchResultSchema = z.object({
  name: z.string().min(1),
  unit_price: z.number().finite().nullable(),
  currency: z.string().min(1),
  source_url: z.string().nullable(),
  snippet: z.string().nullable(),
  confidence: z.number().finite().nullable().optional(),
})

export const priceResearchPayloadSchema = z.object({
  results: z.array(priceResearchResultSchema),
})

export type PriceResearchResultParsed = z.infer<typeof priceResearchResultSchema>
export type PriceResearchPayloadParsed = z.infer<typeof priceResearchPayloadSchema>
