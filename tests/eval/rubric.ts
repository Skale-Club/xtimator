/**
 * tests/eval/rubric.ts
 *
 * SEED-057 Phase F: the quality rubric. It scores ONE estimate against ONE
 * golden case, 0-100, and says exactly which checks failed.
 *
 *   structure   40   the PRODUCTION scoreStructure (lib/estimate/quality), so the
 *                    rubric judges by what ships, not by a parallel definition
 *    sections   15   the expected section vocabulary is present
 *    concepts   15   the expected kinds of line are present
 *  quantities   15   quantities the source states (or implies) are within tolerance
 *       total   10   the subtotal sits inside the case's band
 *       notes    5   assumptions / open questions exist when the case demands them
 *
 * A category with nothing to check (a case with no stated quantities) drops out
 * and the remaining weights are rescaled to 100, so a case is never penalised for
 * a check it does not have.
 *
 * Pure: no I/O, no clock, no network. CI scores the hand-written REFERENCE of
 * every case (tests/eval/rubric.test.ts) to keep this honest; the live canary
 * scores real model output with the same function.
 */
import { getPlaybook } from '@/lib/ai/playbooks'
import { normalizeUnit } from '@/lib/ai/units'
import type { EstimateOutput } from '@/lib/ai/types'
import { mentionsMeasurements, scoreStructure } from '@/lib/estimate/quality/structure-score'
import type { GoldenCase } from './golden/types'

export const RUBRIC_WEIGHTS = {
  structure: 40,
  sections: 15,
  concepts: 15,
  quantities: 15,
  total: 10,
  notes: 5,
} as const

export type RubricPart = keyof typeof RUBRIC_WEIGHTS

export interface RubricResult {
  /** 0-100, rounded. */
  score: number
  /** Per category, 0-1, or null when the case has nothing to check there. */
  parts: Record<RubricPart, number | null>
  /** One line per failed check, for the report. */
  failures: string[]
  /** The subtotal that was judged. */
  subtotal: number
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function subtotalOf(out: EstimateOutput): number {
  return out.sections.reduce(
    (sum, s) => sum + s.items.reduce((t, i) => t + i.quantity * i.unit_price, 0),
    0,
  )
}

export function scoreAgainstRubric(c: GoldenCase, out: EstimateOutput): RubricResult {
  const failures: string[] = []
  const parts = {} as Record<RubricPart, number | null>
  const items = out.sections.flatMap((s) => s.items)
  const descriptions = items.map((i) => ({ item: i, text: fold(i.description) }))

  // --- structure (the production scorer) -----------------------------------
  const structure = scoreStructure({
    summary: out.summary,
    sections: out.sections,
    playbook: getPlaybook(c.trade),
    openQuestions: out.open_questions?.length ?? 0,
    hasMeasurements: mentionsMeasurements(c.inputs.transcripts.concat(c.inputs.photoDescriptions ?? []).join('\n')),
    language: c.language,
  })
  parts.structure = structure.score / 100
  for (const f of structure.findings) failures.push(`structure: ${f.message}`)

  // --- sections -------------------------------------------------------------
  const titles = out.sections.map((s) => fold(s.title))
  if (c.expect.sections.length > 0) {
    const missing = c.expect.sections.filter((w) => !titles.some((t) => t.includes(fold(w))))
    parts.sections = (c.expect.sections.length - missing.length) / c.expect.sections.length
    for (const w of missing) failures.push(`sections: no section for "${w}"`)
  } else {
    parts.sections = null
  }

  // --- concepts -------------------------------------------------------------
  if (c.expect.concepts.length > 0) {
    const missing = c.expect.concepts.filter(
      (concept) => !descriptions.some((d) => concept.any.some((a) => d.text.includes(fold(a)))),
    )
    parts.concepts = (c.expect.concepts.length - missing.length) / c.expect.concepts.length
    for (const m of missing) failures.push(`concepts: no line for ${m.label}`)
  } else {
    parts.concepts = null
  }

  // --- stated quantities, within tolerance ----------------------------------
  const quantities = c.expect.quantities ?? []
  if (quantities.length > 0) {
    let ok = 0
    for (const q of quantities) {
      const tolerance = q.tolerance ?? 0.2
      const candidates = descriptions.filter((d) => q.any.some((a) => d.text.includes(fold(a))))
      const hit = candidates.some(({ item }) => {
        const within = Math.abs(item.quantity - q.value) <= q.value * tolerance
        // Units stay US in every language, so the unit is checked in every language.
        const unitOk = !q.unit || normalizeUnit(item.unit ?? '') === normalizeUnit(q.unit)
        return within && unitOk
      })
      if (hit) ok++
      else {
        const seen = candidates.map((d) => `${d.item.quantity} ${d.item.unit ?? ''}`.trim()).join(', ') || 'no matching line'
        failures.push(
          `quantities: ${q.label} expected ${q.value}${q.unit ? ` ${q.unit}` : ''} within ${Math.round(tolerance * 100)}%, got ${seen}`,
        )
      }
    }
    parts.quantities = ok / quantities.length
  } else {
    parts.quantities = null
  }

  // --- total band -----------------------------------------------------------
  const subtotal = subtotalOf(out)
  const [min, max] = c.expect.total
  parts.total = subtotal >= min && subtotal <= max ? 1 : 0
  if (parts.total === 0) failures.push(`total: ${Math.round(subtotal)} outside ${min}-${max}`)

  // --- assumptions / open questions ----------------------------------------
  const checks: boolean[] = []
  if (c.expect.needsAssumptions) {
    const ok = (out.assumptions?.length ?? 0) > 0
    checks.push(ok)
    if (!ok) failures.push('notes: the source omits a dimension but no assumption was written')
  }
  if (c.expect.needsOpenQuestions) {
    const ok = (out.open_questions?.length ?? 0) > 0
    checks.push(ok)
    if (!ok) failures.push('notes: the scope is ambiguous but no open question was raised')
  }
  parts.notes = checks.length > 0 ? checks.filter(Boolean).length / checks.length : null

  // --- weighted score, rescaled over the categories that apply --------------
  let weighted = 0
  let applicable = 0
  for (const part of Object.keys(RUBRIC_WEIGHTS) as RubricPart[]) {
    const value = parts[part]
    if (value === null) continue
    weighted += value * RUBRIC_WEIGHTS[part]
    applicable += RUBRIC_WEIGHTS[part]
  }
  const score = applicable === 0 ? 0 : Math.round((weighted / applicable) * 100)
  return { score, parts, failures, subtotal }
}

export interface RubricSummary {
  mean: number
  min: number
  perCase: Array<{ id: string; score: number }>
}

export function summarise(results: Array<{ id: string; result: RubricResult }>): RubricSummary {
  if (results.length === 0) return { mean: 0, min: 0, perCase: [] }
  const scores = results.map((r) => r.result.score)
  return {
    mean: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    min: Math.min(...scores),
    perCase: results.map((r) => ({ id: r.id, score: r.result.score })),
  }
}

/** The merge gate: a prompt or playbook change must not cost more than this many mean points. */
export const MAX_MEAN_DROP = 5
