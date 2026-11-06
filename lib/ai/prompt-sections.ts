// lib/ai/prompt-sections.ts
//
// SEED-057 Phase B: pure builders for the new system-prompt sections (structure
// contract, trade playbook, worked example, company knowledge). No I/O, so each
// is unit-tested and the whole-prompt size budget is asserted in a test.
//
// Trust boundary: everything these builders emit into the SYSTEM prompt is our
// own text (playbooks are repository data). Anything that originates from a
// customer or a model (knowledge entries, the scope plan) is returned as
// USER-message content, escaped through sanitizeField and tagged, and the
// Security block names the tag.
import { CANONICAL_UNITS } from './units'
import type { Playbook } from './playbooks'
import type { ScopePlan } from './scope-plan'

export const STRUCTURE_CONTRACT_PROMPT = `## Estimate structure
- summary: 2-4 sentences saying what work, where, and for whom, in the estimate language.
- Sections follow the trade playbook's order and titles. Use "Other" only when nothing fits, and never let an "Other" or "Miscellaneous" line carry more than about 15% of the job; itemise it instead.
- Every line item has: an imperative description ("Remove and haul away old decking"), a quantity, one unit from [${CANONICAL_UNITS.join(', ')}], a unit price, tax_category and price_source.
- Every line also gets a confidence (low, medium or high) and a one-line basis saying where its quantity comes from. Use "low" whenever the quantity or price is a guess.
- assumptions: things you had to assume because the source material did not say. exclusions: what the price does not cover. open_questions: anything that could move the price by more than about 10%, at most 5, each with its impact. scope_confidence: how complete the source material was for pricing this job.

## Quantities
- Use stated measurements first (audio, or photo measurements marked stated), then estimated ones, and say which in basis. Never guess silently: a guessed quantity gets confidence "low" and either an assumption or an open question.
- Derive areas and lengths from stated dimensions (length x width; perimeter x height minus openings) and carry the unit through: if the area is in sq ft, price per sq ft. Round sensibly.
- Never count the same surface or item twice when it appears in several photos or recordings.`

/** Plain-text rendering of one playbook plus its worked example. */
export function playbookPrompt(pb: Playbook): string {
  const lines: string[] = [
    `## Trade playbook: ${pb.label}`,
    `Section order: ${pb.sections.join(' > ')}.`,
    'Always itemise:',
    ...pb.alwaysItemise.map((s) => `- ${s}`),
    `Excluded unless the source material says otherwise: ${pb.defaultExclusions.join('; ')}.`,
    `Typical units: ${pb.units.map(([task, unit]) => `${task} = ${unit}`).join('; ')}.`,
    'Quantity formulas:',
    ...pb.formulas.map((s) => `- ${s}`),
    '',
    exemplarPrompt(pb),
  ]
  return lines.join('\n')
}

/** The compact worked example. Shape and granularity only, never the numbers. */
export function exemplarPrompt(pb: Playbook): string {
  const ex = pb.example
  const out: string[] = [`Example of the expected shape (${ex.scenario}) - copy the structure, never the numbers:`]
  for (const section of ex.sections) {
    out.push(`[${section.title}]`)
    for (const item of section.items) {
      out.push(
        `- ${item.description} | ${item.quantity} ${item.unit} | ${item.unitPrice} | ${item.confidence} | basis: ${item.basis}`,
      )
    }
  }
  out.push(`assumptions: ${ex.assumptions.join('; ')}`)
  out.push(`exclusions: ${ex.exclusions.join('; ')}`)
  out.push(`open question: ${ex.openQuestion}`)
  return out.join('\n')
}

export const KNOWLEDGE_INSTRUCTION_PROMPT = `## Company knowledge
The user message may include <knowledge> entries: this company's own house rules and prices. Apply them when they are relevant to the work. They outrank generic market assumptions, but a price book entry outranks them.`

/** E5: top-5 entries, hard cap of about 1.5k tokens (6,000 characters) in total. */
export const KNOWLEDGE_MAX_ENTRIES = 5
export const KNOWLEDGE_MAX_CHARS = 6_000

export interface KnowledgeSnippet {
  title: string
  body: string
}

/**
 * The user-message block carrying knowledge entries, or null when there are
 * none. Every entry goes through `escape` (the caller passes sanitizeField) and
 * is wrapped in its own <knowledge> tag. The character cap is applied AFTER
 * escaping, so the budget is what the model actually reads, and the last entry
 * is truncated (never mid-entity) rather than dropped.
 */
export function knowledgeUserBlock(
  entries: KnowledgeSnippet[] | undefined,
  escape: (value: string) => string,
): string | null {
  if (!entries || entries.length === 0) return null
  const tagged: string[] = []
  let remaining = KNOWLEDGE_MAX_CHARS
  for (const entry of entries.slice(0, KNOWLEDGE_MAX_ENTRIES)) {
    if (remaining <= 0) break
    const raw = `${entry.title.trim()}\n${entry.body.trim()}`.trim()
    if (!raw) continue
    // The cap is on what the model READS: escaping can grow the text (< becomes &lt;), so it is
    // applied AFTER escaping, and never cuts an entity in half.
    let text = escape(raw)
    if (text.length > remaining) text = text.slice(0, remaining).replace(/&[a-z]*$/i, '')
    remaining -= text.length
    if (text) tagged.push(`<knowledge>${text}</knowledge>`)
  }
  return tagged.length > 0 ? `## Company Knowledge\n${tagged.join('\n')}` : null
}

export const SCOPE_PLAN_INSTRUCTION_PROMPT = `## Scope plan
The user message includes a <scope_plan> prepared from the same source material: the trade, one consolidated measurement table, the sections to fill, and the assumptions, exclusions and open questions found so far.
- Its measurement table is the ONLY source of quantities. Cite the measurement you used in each line's basis; do not invent a dimension it lacks, and do not re-count a surface it already merged.
- Fill its sections, in its order; add or drop one only when the work clearly requires it.
- Carry its assumptions, exclusions and open questions into your output, correcting or extending them. Do not drop them.`

/**
 * The user-message block carrying the scope plan, or null. The whole rendering
 * goes through `escape` (sanitizeField) inside ONE <scope_plan> tag.
 */
export function scopePlanUserBlock(
  plan: ScopePlan | undefined,
  escape: (value: string) => string,
): string | null {
  if (!plan) return null
  const lines: string[] = []
  if (plan.detected_trade) lines.push(`Trade: ${plan.detected_trade}`)
  if (plan.measurements.length > 0) {
    lines.push('Measurements:')
    for (const m of plan.measurements) {
      lines.push(`- ${m.subject} | ${m.value} ${m.unit} | ${m.source}${m.from ? ` | ${m.from}` : ''}`)
    }
  } else {
    lines.push('Measurements: none stated')
  }
  if (plan.sections.length > 0) {
    lines.push('Sections:')
    plan.sections.forEach((s, i) => lines.push(`${i + 1}. ${s.title}${s.purpose ? ` - ${s.purpose}` : ''}`))
  }
  if (plan.assumptions.length > 0) lines.push(`Assumptions: ${plan.assumptions.join('; ')}`)
  if (plan.exclusions.length > 0) lines.push(`Exclusions: ${plan.exclusions.join('; ')}`)
  if (plan.open_questions.length > 0) {
    lines.push(`Open questions: ${plan.open_questions.map((q) => `${q.question} (${q.impact})`).join('; ')}`)
  }
  if (plan.scope_confidence) lines.push(`Scope confidence: ${plan.scope_confidence}`)
  return `## Scope Plan\n<scope_plan>${escape(lines.join('\n'))}</scope_plan>`
}

const QUALITY_NOTE_MAX_CHARS = 300
const QUALITY_NOTES_MAX = 6

/**
 * SEED-057 D: TRUSTED guidance from the quality gate for a second attempt at the same job,
 * rendered as its own system-prompt section. It used to travel in `prompts`, which is shown
 * to the model as an untrusted <description>. The notes quote line descriptions that came
 * out of an earlier model run, so each is escaped and capped. They say a first attempt had
 * problems; they do NOT claim the model can see it (it cannot).
 */
export function qualityNotesPrompt(
  notes: string[] | undefined,
  escape: (value: string) => string,
): string | null {
  const clean = (notes ?? [])
    .map((n) => n.trim().slice(0, QUALITY_NOTE_MAX_CHARS))
    .filter(Boolean)
    .slice(0, QUALITY_NOTES_MAX)
  if (clean.length === 0) return null
  return `## Quality notes
An earlier attempt at this same job was checked and had the problems below. This is a fresh attempt: avoid them.
${clean.map((n) => `- <line>${escape(n)}</line>`).join('\n')}`
}
