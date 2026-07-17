// lib/ai/photo-extraction-schema.ts
//
// PEXT-01 — the authoritative zod schema for structured photo extraction
// (v4.20). Mirrors the GUARD-01 house pattern (lib/ai/schema.ts): the
// provider tool-call JSON (171-02's OpenRouter forced tool-call / Gemini
// functionDeclaration structured call) is advisory; THIS schema is the
// second, authoritative gate. `PhotoExtraction = z.infer<typeof
// photoExtractionSchema>` so the type and the validator can never drift.
//
// ELEMENT-DROP DISCIPLINE (the load-bearing subtlety — Opus plan-check
// BLOCKER): a bare `z.array(el).catch([])` wipes the ENTIRE array the
// moment ONE element fails to parse — the exact opposite of the required
// behavior ("a malformed single measurement is dropped, its siblings
// survive"). Instead, `dropInvalid` below is an ARRAY-LEVEL preprocess that
// filters out elements failing their OWN element schema BEFORE the array
// itself is parsed, so `z.array(el)` only ever sees already-valid elements
// and can never reject the batch. The outer `.catch([])` on the array
// schema is a non-array/non-parseable-input net ONLY (e.g. `null`, a
// string, `undefined` reaching the field) — by the time it would run,
// every surviving element is already guaranteed valid, so it practically
// never fires except on a totally wrong-shaped field value.
//
// This is a DIFFERENT pattern from schema.ts's `price_source` preprocess,
// which is a FIELD-level coercion (garbage -> a default enum value) that
// only ever touches one field on one object. `dropInvalid` operates one
// level up, on arrays of objects/strings, deciding per-element membership
// rather than per-field defaulting. Do not collapse the two patterns.
//
// `overall_description` (non-empty) is the ONE hard parse requirement —
// every other field is defensive (missing optional arrays default to `[]`,
// enum drift on an otherwise-valid element coerces via a field-level
// `.catch()` rather than dropping the element). A schema parse failure
// (i.e. missing/empty overall_description) is the caller's signal to fall
// back to the prose analysis path for that photo (PEXT-03 / 171-02's
// fallback ladder) — never retried, never partially trusted.
import { z } from 'zod'

/**
 * Array-level "drop invalid elements, keep the rest" preprocess.
 *
 * Filters the raw input array down to only the elements that independently
 * `safeParse` against `el`, THEN hands that already-valid, filtered array to
 * `z.array(el)`. Because every remaining element is known-valid before
 * `z.array` ever runs, `z.array(el)` cannot fail on element shape — its
 * `.catch([])` exists purely to net non-array input (null/undefined/a
 * string/etc.), not to swallow element-level failures.
 */
function dropInvalid<T extends z.ZodTypeAny>(el: T) {
  return z
    .preprocess(
      (v) => (Array.isArray(v) ? v.filter((x) => el.safeParse(x).success) : []),
      z.array(el)
    )
    .catch([])
}

const surfaceElement = z.object({
  name: z.string().min(1),
  material: z.string().optional().nullable().catch(null),
  condition: z.string().optional().nullable().catch(null),
})

const measurementElement = z.object({
  dimension: z.enum(['length', 'area', 'height', 'count']),
  value: z.number().finite().positive(),
  unit: z.string().min(1),
  subject: z.string().min(1),
  // Field-level defensive coercion (the schema.ts price_source pattern) —
  // any confidence value other than the exact enum members defaults to
  // 'estimated' (the conservative choice) rather than dropping the element.
  confidence: z.preprocess(
    (v) => (v === 'stated' || v === 'estimated' ? v : 'estimated'),
    z.enum(['stated', 'estimated'])
  ),
})

const damageElement = z.object({
  description: z.string().min(1),
  // Same field-level coercion pattern — drift defaults to 'moderate'.
  severity: z.preprocess(
    (v) => (v === 'minor' || v === 'moderate' || v === 'severe' ? v : 'moderate'),
    z.enum(['minor', 'moderate', 'severe'])
  ),
})

export const photoExtractionSchema = z.object({
  version: z.literal(1).catch(1),
  surfaces: dropInvalid(surfaceElement),
  measurements: dropInvalid(measurementElement),
  materials: dropInvalid(z.string().min(1)),
  damage: dropInvalid(damageElement),
  trade_signals: dropInvalid(z.string().min(1)),
  access_notes: z.string().optional().nullable(),
  // THE hard requirement — populates `ai_description` so every existing
  // consumer (share, PDF, prompt fallback) renders unchanged. Missing or
  // empty -> the whole parse fails -> caller falls back to prose.
  overall_description: z.string().min(1),
})

export type PhotoExtraction = z.infer<typeof photoExtractionSchema>

/**
 * JSON-schema mirror for the provider tool declarations (advisory layer
 * only — the zod schema above is the authoritative gate). Exported so
 * 171-02's OpenRouter tool + Gemini functionDeclaration both derive from
 * ONE source, and so the PEXT-04 parity test can assert the tool schema's
 * property keys/enums never drift from the zod shape (the AIREL-03
 * lesson). Hand-written object (house style — see
 * lib/ai/providers/openrouter.ts's estimateToolSchema), NOT a
 * zod-to-jsonschema dependency.
 */
export function photoExtractionToolSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['overall_description'],
    properties: {
      version: {
        type: 'number',
        description: 'Schema version. Always 1.',
      },
      surfaces: {
        type: 'array',
        description: 'Distinct surfaces visible in the photo (e.g. wall, floor, ceiling, roof).',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', description: 'e.g. "kitchen floor", "north wall"' },
            material: { type: 'string', description: 'e.g. "vinyl plank", "drywall"' },
            condition: { type: 'string', description: 'e.g. "worn", "new", "water damaged"' },
          },
        },
      },
      measurements: {
        type: 'array',
        description: 'Quantities directly observed or reasonably estimated from the photo.',
        items: {
          type: 'object',
          required: ['dimension', 'value', 'unit', 'subject'],
          properties: {
            dimension: {
              type: 'string',
              enum: ['length', 'area', 'height', 'count'],
              description: 'What kind of quantity this measurement represents.',
            },
            value: { type: 'number', description: 'The numeric quantity.' },
            unit: { type: 'string', description: 'e.g. "sq ft", "linear ft", "ft", "each"' },
            subject: { type: 'string', description: 'What was measured, e.g. "living room floor"' },
            confidence: {
              type: 'string',
              enum: ['stated', 'estimated'],
              description:
                "'stated' if a measurement was explicitly given (sign, tape measure, spoken), 'estimated' if visually inferred.",
            },
          },
        },
      },
      materials: {
        type: 'array',
        description: 'Distinct materials identified across the photo (flat string list).',
        items: { type: 'string' },
      },
      damage: {
        type: 'array',
        description: 'Visible damage or defects.',
        items: {
          type: 'object',
          required: ['description'],
          properties: {
            description: { type: 'string', description: 'What the damage is and where.' },
            severity: {
              type: 'string',
              enum: ['minor', 'moderate', 'severe'],
              description: 'How severe the damage appears.',
            },
          },
        },
      },
      trade_signals: {
        type: 'array',
        description:
          'Trade/category hints this photo implies (e.g. "flooring", "roofing", "electrical").',
        items: { type: 'string' },
      },
      access_notes: {
        type: 'string',
        description: 'Access/site constraints visible in the photo (e.g. narrow stairwell).',
      },
      overall_description: {
        type: 'string',
        description:
          'A prose summary of the photo — REQUIRED. Populates the existing photo description shown to the estimator.',
      },
    },
  }
}
