// lib/ai/scope-plan.ts
//
// SEED-057 Phase C: the contract of the OPTIONAL first step of two-step
// generation. A fast, cheap model reads the whole job (transcripts, photo
// extractions, company knowledge) and produces a SCOPE PLAN: the trade, one
// consolidated measurement table (the same wall photographed three times is one
// row), the sections to fill, and the assumptions / exclusions / open questions.
// It prices nothing. The estimator (step two) then fills items and prices under
// the playbook, treating the measurement table as the only source of
// quantities.
//
// Behind ESTIMATOR_TWO_STEP, default OFF (decision E1). This module is the pure
// part: schema, type, flag. The model call lives in lib/ai/plan-scope.ts.
//
// The plan is model output derived from untrusted job-site text, so downstream
// it is treated as untrusted too: escaped and wrapped in a <scope_plan> tag in
// the USER message (lib/ai/prompt-sections.ts), never trusted as instructions.
import { z } from 'zod'
import {
  toLevel,
  toOpenQuestions,
  toShortText,
  toTextList,
  type OpenQuestion,
} from './schema'
import { normalizeUnit } from './units'

export interface PlanMeasurement {
  /** What was measured: "living room floor", "north wall". */
  subject: string
  value: number
  unit: string
  /** 'stated' = said aloud / written / measured; 'estimated' = judged from a photo. */
  source: 'stated' | 'estimated'
  /** Where it came from: "audio", "photo 2". */
  from?: string
}

export interface PlanSection {
  title: string
  purpose?: string
}

export interface ScopePlan {
  detected_trade?: string
  measurements: PlanMeasurement[]
  sections: PlanSection[]
  assumptions: string[]
  exclusions: string[]
  open_questions: OpenQuestion[]
  scope_confidence?: 'low' | 'medium' | 'high'
}

const MAX_MEASUREMENTS = 60
const MAX_SECTIONS = 12

function toMeasurements(v: unknown): PlanMeasurement[] {
  if (!Array.isArray(v)) return []
  const out: PlanMeasurement[] = []
  for (const entry of v) {
    if (!entry || typeof entry !== 'object') continue
    const o = entry as Record<string, unknown>
    const subject = toShortText(o.subject, 120)
    const unit = toShortText(o.unit, 24)
    const value = typeof o.value === 'number' ? o.value : Number(o.value)
    if (!subject || !unit || !Number.isFinite(value) || value <= 0) continue
    // Same subject + unit twice (a surface seen in two photos) collapses to the first.
    const key = `${subject.toLowerCase()}|${normalizeUnit(unit)}`
    if (out.some((m) => `${m.subject.toLowerCase()}|${m.unit}` === key)) continue
    const from = toShortText(o.from, 40)
    out.push({
      subject,
      value,
      unit: normalizeUnit(unit),
      source: o.source === 'stated' ? 'stated' : 'estimated',
      ...(from ? { from } : {}),
    })
    if (out.length >= MAX_MEASUREMENTS) break
  }
  return out
}

function toSections(v: unknown): PlanSection[] {
  if (!Array.isArray(v)) return []
  const out: PlanSection[] = []
  for (const entry of v) {
    const o = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
    const title = toShortText(o ? o.title : entry, 80)
    if (!title || out.some((s) => s.title.toLowerCase() === title.toLowerCase())) continue
    const purpose = o ? toShortText(o.purpose, 200) : undefined
    out.push({ title, ...(purpose ? { purpose } : {}) })
    if (out.length >= MAX_SECTIONS) break
  }
  return out
}

/** Tolerant: anything malformed degrades to an empty field, never a rejected plan. */
export const scopePlanSchema = z
  .object({
    detected_trade: z.unknown().transform((v) => toShortText(v, 60)).optional(),
    measurements: z.unknown().transform(toMeasurements).optional(),
    sections: z.unknown().transform(toSections).optional(),
    assumptions: z.unknown().transform((v) => toTextList(v, 12, 300)).optional(),
    exclusions: z.unknown().transform((v) => toTextList(v, 12, 300)).optional(),
    open_questions: z.unknown().transform(toOpenQuestions).optional(),
    scope_confidence: z.unknown().transform(toLevel).optional(),
  })
  .transform(
    (p): ScopePlan => ({
      ...(p.detected_trade ? { detected_trade: p.detected_trade.toLowerCase() } : {}),
      measurements: p.measurements ?? [],
      sections: p.sections ?? [],
      assumptions: p.assumptions ?? [],
      exclusions: p.exclusions ?? [],
      open_questions: p.open_questions ?? [],
      ...(p.scope_confidence ? { scope_confidence: p.scope_confidence } : {}),
    }),
  )

/** A plan with neither sections nor measurements adds nothing the estimator can use. */
export function isUsablePlan(plan: ScopePlan | null | undefined): plan is ScopePlan {
  return !!plan && (plan.sections.length > 0 || plan.measurements.length > 0)
}

/**
 * ESTIMATOR_TWO_STEP: read at CALL time (not module load) so it can be flipped
 * without a restart-order surprise and toggled per test. Default OFF.
 */
export function isTwoStepEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ESTIMATOR_TWO_STEP?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on' || v === 'yes'
}
