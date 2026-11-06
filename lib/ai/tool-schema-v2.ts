// lib/ai/tool-schema-v2.ts
//
// SEED-057 Phase A: the output contract v2 additions to the create_estimate tool.
//
// The JSON-schema flavoured adapters (openrouter, anthropic) spread these
// property objects straight into their tool definitions; the Gemini adapter
// mirrors the SAME keys with its Type.* flavour and reuses ESTIMATE_V2_TEXT for
// the descriptions. tests/unit/ai/tool-schema-fields.test.ts locks the key sets
// across all three adapters, so a field added here but forgotten there fails
// the build.
//
// Everything is optional: the zod gate (lib/ai/schema.ts) turns a missing or
// malformed value into `undefined`, never into a rejected generation.
import { CANONICAL_UNITS } from './units'

const LEVELS = ['low', 'medium', 'high']

export const ESTIMATE_V2_TEXT = {
  assumptions:
    'Things you had to assume because the walkthrough did not say them, one short sentence each (e.g. "Assumes standard 8 ft ceilings"). Omit when there are none.',
  exclusions:
    'Work or materials that are NOT included in this price, one short sentence each (e.g. "Permit fees are not included"). Omit when there are none.',
  open_questions:
    'Questions the owner should answer because the answer would move the price by more than about 10%. At most 5. Omit when there are none.',
  open_question: 'The question, phrased for the business owner.',
  open_question_impact: "How much the answer could move the price: 'low', 'medium' or 'high'.",
  scope_confidence:
    "How complete the source material was for pricing this job: 'low', 'medium' or 'high'.",
  purpose: 'One line on what this section covers.',
  unit: `The unit of measure. Prefer one of: ${CANONICAL_UNITS.join(', ')}. In a non-English estimate use the translated unit.`,
  confidence:
    "How sure you are of this line (quantity and price together): 'low', 'medium' or 'high'.",
  basis:
    'One line saying where the quantity comes from, e.g. "12 x 14 ft room stated in the audio" or "estimated from the photo".',
  optional: 'true only for an add-on the client may decline; it is still priced.',
} as const

/** Top-level properties added by the v2 contract (JSON-schema flavour). */
export const ESTIMATE_V2_TOP_PROPERTIES = {
  assumptions: {
    type: 'array' as const,
    items: { type: 'string' as const },
    description: ESTIMATE_V2_TEXT.assumptions,
  },
  exclusions: {
    type: 'array' as const,
    items: { type: 'string' as const },
    description: ESTIMATE_V2_TEXT.exclusions,
  },
  open_questions: {
    type: 'array' as const,
    description: ESTIMATE_V2_TEXT.open_questions,
    items: {
      type: 'object' as const,
      required: ['question', 'impact'],
      properties: {
        question: { type: 'string' as const, description: ESTIMATE_V2_TEXT.open_question },
        impact: {
          type: 'string' as const,
          enum: LEVELS,
          description: ESTIMATE_V2_TEXT.open_question_impact,
        },
      },
    },
  },
  scope_confidence: {
    type: 'string' as const,
    enum: LEVELS,
    description: ESTIMATE_V2_TEXT.scope_confidence,
  },
}

/** Section-level property added by the v2 contract. */
export const ESTIMATE_V2_SECTION_PROPERTIES = {
  purpose: { type: 'string' as const, description: ESTIMATE_V2_TEXT.purpose },
}

/** Item-level properties added by the v2 contract. */
export const ESTIMATE_V2_ITEM_PROPERTIES = {
  confidence: {
    type: 'string' as const,
    enum: LEVELS,
    description: ESTIMATE_V2_TEXT.confidence,
  },
  basis: { type: 'string' as const, description: ESTIMATE_V2_TEXT.basis },
  optional: { type: 'boolean' as const, description: ESTIMATE_V2_TEXT.optional },
}

/** `unit` already existed; the v2 contract only redescribes it. */
export const ESTIMATE_V2_UNIT_PROPERTY = {
  type: 'string' as const,
  description: ESTIMATE_V2_TEXT.unit,
}
