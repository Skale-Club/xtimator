// lib/estimate/photo-context.ts
//
// PEXT-02 — pure serializer that turns one photo row into the single string
// fed to `photoDescriptions` (lib/services/generate-estimate.ts), which then
// flows through the EXISTING <photo_description>/sanitizeField wrapping in
// prompt-builder.ts (buildUserContent, :155-162) — no new prompt surface, no
// parallel unsanitized route.
//
// BYTE-IDENTITY (Opus plan-check gate): when `ai_extraction` is null/absent/
// invalid — every legacy photo, every fallback, kill-switch mode — the output
// is IDENTICAL to today's 168-02 caption-fold format:
//   - caption present (trimmed, non-empty): `Photo N (caption: X): desc`
//   - otherwise:                            `Photo N: desc`
// `desc` is the RAW, untrimmed `ai_description` — exactly as
// generate-estimate.ts:217-224 reads it today. This module reproduces that
// exact logic rather than approximating it; do not "clean up" the trim
// semantics here — tests/unit/services/generate-estimate-captions.test.ts
// locks the service-level contract and stays green UNMODIFIED.
//
// TYPE GATE (Opus plan-check): `getProjectPhotos` (lib/queries/photo.ts)
// returns the hand-written `Photo` interface, which does NOT have
// `ai_extraction` (171-01 only extended `database.types.ts`, not this
// interface — out of scope for 171-03). `ai_extraction` here MUST be OPTIONAL
// (`ai_extraction?: unknown`) so a `Photo` value is still assignable to this
// param and `tsc` passes. The runtime value nonetheless arrives via
// `select('*')`; `photoExtractionSchema.safeParse` is the runtime guard.
//
// RAW OUTPUT: this serializer never escapes. `sanitizeField`
// (prompt-builder.ts:159) is the ONE place escaping happens, applied to the
// whole returned string transitively (the 168-02-verified path). Do not add
// escaping here — that would double-escape downstream.
import {
  photoExtractionSchema,
  type PhotoExtraction,
} from '@/lib/ai/photo-extraction-schema'

export interface PhotoContextInput {
  ai_description: string | null
  caption: string | null
  /**
   * Optional + unknown by design (see TYPE GATE note above). Validated via
   * `photoExtractionSchema.safeParse` before use — an invalid/malformed
   * stored value degrades to prose-only output, never throws.
   */
  ai_extraction?: unknown
}

function renderMeasurement(m: PhotoExtraction['measurements'][number]): string {
  return `${m.subject} ${m.value} ${m.unit} (${m.confidence})`
}

function renderDamage(d: PhotoExtraction['damage'][number]): string {
  return `${d.description} (${d.severity})`
}

/**
 * Builds the compact ' | Measurements: … | Materials: … | Damage: …' suffix
 * from a validated extraction. Sections are omitted entirely when their
 * source array is empty — no dangling separators. Order: Measurements,
 * Materials, Damage, Trade signals, Access.
 */
function renderExtractionSuffix(extraction: PhotoExtraction): string {
  const sections: string[] = []

  if (extraction.measurements.length > 0) {
    sections.push(`Measurements: ${extraction.measurements.map(renderMeasurement).join('; ')}`)
  }
  if (extraction.materials.length > 0) {
    sections.push(`Materials: ${extraction.materials.join(', ')}`)
  }
  if (extraction.damage.length > 0) {
    sections.push(`Damage: ${extraction.damage.map(renderDamage).join('; ')}`)
  }
  if (extraction.trade_signals.length > 0) {
    sections.push(`Trade signals: ${extraction.trade_signals.join(', ')}`)
  }
  if (extraction.access_notes && extraction.access_notes.trim().length > 0) {
    sections.push(`Access: ${extraction.access_notes}`)
  }

  return sections.length > 0 ? ` | ${sections.join(' | ')}` : ''
}

/**
 * Pure serializer: one photo row (ai_description + caption + optional
 * ai_extraction) -> the single string fed to `photoDescriptions`.
 *
 * `index` is the POST-FILTER index (the same `i` generate-estimate.ts's
 * `.map((p, i) => ...)` produces after filtering to non-empty
 * `ai_description` photos) — `Photo ${index + 1}`, never a stored
 * `sort_order`.
 */
export function serializePhotoContext(photo: PhotoContextInput, index: number): string {
  const cap = photo.caption?.trim()
  const base = cap
    ? `Photo ${index + 1} (caption: ${cap}): ${photo.ai_description}`
    : `Photo ${index + 1}: ${photo.ai_description}`

  if (photo.ai_extraction == null) return base

  const parsed = photoExtractionSchema.safeParse(photo.ai_extraction)
  if (!parsed.success) return base

  return base + renderExtractionSuffix(parsed.data)
}
