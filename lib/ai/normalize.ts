// lib/ai/normalize.ts
//
// GUARD-01 — `normalizeOutput` is now a thin, NON-THROWING `safeParse` over the
// authoritative `estimateOutputSchema` (lib/ai/schema.ts). It returns a
// discriminated `NormalizeResult` so the caller (the provider boundary) can decide
// to retry-once vs. surface a typed error — `normalizeOutput` itself NEVER throws.
//
// The D-15 price_source defensive coercion and the suggested_client_name trim/null
// transform now live IN the schema (preprocess/transform), so on success `parsed.data`
// is already fully normalized; no manual casts remain.
import { estimateOutputSchema, type EstimateOutput } from './schema'
import type { ZodError } from 'zod'

export type NormalizeResult =
  | { ok: true; value: EstimateOutput }
  | { ok: false; error: ZodError }

export function normalizeOutput(raw: Record<string, unknown>): NormalizeResult {
  const parsed = estimateOutputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  return { ok: true, value: parsed.data }
}
