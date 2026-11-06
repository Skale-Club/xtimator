// lib/ai/tool-schema.ts
//
// SEED-056 Phase C: ONE place that decides which document-block fields the
// create_estimate tool exposes to the model, shared by every adapter
// (openrouter / anthropic / gemini) so they cannot drift apart.
//
//  - generate mode: the model does NOT author payment_terms / warranty_terms
//    (the company's own text is attached server-side). timeline and notes are
//    offered only when the company switched the matching block on.
//  - refine mode: the full schema stays, so the owner can still say "change
//    the payment terms to 50% upfront".
//
// The zod schema (lib/ai/schema.ts) keeps every field optional, so cached or
// legacy outputs that still carry them keep parsing.

export type EstimateToolMode = 'generate' | 'refine'

export interface EstimateToolFlags {
  mode: EstimateToolMode
  /** Which AI-authored prose blocks the company turned on. Absent = both off. */
  aiBlocks?: { timeline: boolean; notes: boolean }
}

/** Tool-schema property names to hide from the model for these flags. */
export function omittedEstimateFields(flags: EstimateToolFlags): string[] {
  if (flags.mode === 'refine') return []
  const omitted = ['payment_terms', 'warranty_terms']
  if (!flags.aiBlocks?.timeline) omitted.push('timeline')
  if (!flags.aiBlocks?.notes) omitted.push('notes')
  return omitted
}

/**
 * Returns a copy of a tool parameter schema (JSON-schema style, or Gemini's
 * Type.* flavour: both keep field definitions under `properties`) without the
 * fields the model must not author. The input is never mutated, so the shared
 * full schema constant stays intact.
 */
export function shapeEstimateToolSchema<T extends { properties?: Record<string, unknown> }>(
  schema: T,
  flags: EstimateToolFlags,
): T {
  const omitted = omittedEstimateFields(flags)
  if (omitted.length === 0 || !schema.properties) return schema
  const properties: Record<string, unknown> = { ...schema.properties }
  for (const key of omitted) delete properties[key]
  return { ...schema, properties }
}
