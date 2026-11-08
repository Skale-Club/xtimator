/**
 * lib/estimate/graph/patch-refine.ts
 *
 * Phase 4d (flag ESTIMATOR_PATCH_REFINE, default OFF): auto-refine as a SECTION PATCH.
 *
 * Today a poorly structured draft (structure band 'refine', score < 50) is re-generated from
 * scratch with the findings as hints, and the second version replaces the first even when it
 * scores worse. The patch path instead refines the CURRENT draft with an instruction built from
 * the findings, merges with mergeRefinement (lines the model did not touch keep their identity,
 * price and metadata), re-scores with scoreStructure and ACCEPTS the patched draft only if the
 * score went UP. Everything here is pure (no I/O, no clock) and never throws; the graph node in
 * ./nodes/patch-refine.ts does the loading, the refine call and the persistence hook.
 *
 * Channel-neutral (ENGINE-01): imports no channel module.
 */
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'
import type { EditorItem, EditorSection, RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'
import { mergeRefinement, normalizeText, priceEquals } from '@/lib/estimate/refine-merge'
import {
  scoreStructure,
  type StructureFinding,
  type StructureInput,
  type StructureResult,
} from '@/lib/estimate/quality/structure-score'

/** ESTIMATOR_PATCH_REFINE, read at CALL time (same pattern as ESTIMATOR_TWO_STEP). Default OFF. */
export function isPatchRefineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ESTIMATOR_PATCH_REFINE?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on' || v === 'yes'
}

/** The slice of an estimate the patch works on. */
export interface PatchableEstimate {
  summary: string
  notes?: string
  timeline?: string
  payment_terms?: string
  warranty_terms?: string
  sections: EstimateSectionOutput[]
}

const MAX_HINTS = 8

/**
 * The refine instruction for a patch: the structure findings, plus the rule that ONLY what they
 * point at may change. Everything else must come back exactly as given so mergeRefinement sees
 * it as untouched.
 */
export function buildPatchInstruction(hints: string[]): string {
  const list = hints
    .map((h) => (typeof h === 'string' ? h.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_HINTS)
  return [
    'A quality review of this estimate found these problems:',
    ...list.map((h) => `- ${h}`),
    '',
    'Fix ONLY these problems. Change ONLY the sections and lines the findings point at, and add',
    'a line or section only when a finding asks for one. Return every other section and line',
    'EXACTLY as given: same description, quantity, unit and unit_price, same order. Do not',
    'reprice, rename, reorder or remove lines that no finding names. Keep the estimate language.',
  ].join('\n')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toEditorSections(sections: EstimateSectionOutput[]): EditorSection[] {
  return sections.map((s, si) => {
    const items: EditorItem[] = s.items.map((it, ii) => ({
      id: `s${si}i${ii}`,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit ?? null,
      unit_price: it.unit_price,
      total: round2(it.quantity * it.unit_price),
      sort_order: ii,
      price_source: it.price_source ?? 'ai_estimate',
      isManuallyEdited: false,
      taxable: it.taxable,
      tax_category: it.tax_category ?? null,
      discount: it.discount ?? 0,
      cost: it.cost ?? null,
      markup_pct: it.markup_pct ?? null,
      confidence: it.confidence ?? null,
      basis: it.basis ?? null,
      ...(it.optional !== undefined ? { optional: it.optional } : {}),
    }))
    return { id: `s${si}`, title: s.title, sort_order: si, subtotal: items.reduce((t, i) => t + i.total, 0), items }
  })
}

/** An untouched line is the draft's own object, byte for byte; a changed or new line is rebuilt. */
function fromEditorItem(item: EditorItem, original: LineItemOutput | undefined): LineItemOutput {
  if (
    original &&
    normalizeText(original.description) === normalizeText(item.description) &&
    original.quantity === item.quantity &&
    priceEquals(original.unit_price, item.unit_price)
  ) {
    return original
  }
  const out: LineItemOutput = {
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    price_source: item.price_source ?? 'ai_estimate',
  }
  if (item.unit) out.unit = item.unit
  if (item.taxable !== undefined) out.taxable = item.taxable
  if (item.tax_category) out.tax_category = item.tax_category
  if (item.discount) out.discount = item.discount
  if (item.cost !== null && item.cost !== undefined) out.cost = item.cost
  if (item.markup_pct !== null && item.markup_pct !== undefined) out.markup_pct = item.markup_pct
  if (item.confidence) out.confidence = item.confidence
  if (item.basis) out.basis = item.basis
  if (item.optional !== undefined) out.optional = item.optional
  return out
}

/**
 * Merge the refined preview onto the draft with mergeRefinement (the same util the editor's review
 * dialog uses), then convert back to the AI output shape. The summary is the draft's unless the
 * draft has none worth keeping (< 20 chars, the structure score's own threshold); notes, timeline
 * and terms are always the draft's: a section patch never rewrites them.
 */
export function mergePatch(
  draft: PatchableEstimate,
  refined: PatchableEstimate
): { estimate: PatchableEstimate; changedLines: number; addedLines: number; removedLines: number } {
  const current = toEditorSections(draft.sections)
  const { mergedSections, diff } = mergeRefinement(
    {
      sections: current,
      summary: draft.summary,
      notes: draft.notes ?? null,
      timeline: draft.timeline ?? null,
      payment_terms: draft.payment_terms ?? null,
      warranty_terms: draft.warranty_terms ?? null,
    },
    {
      summary: refined.summary,
      notes: draft.notes,
      timeline: draft.timeline,
      payment_terms: draft.payment_terms,
      warranty_terms: draft.warranty_terms,
      sections: refined.sections.map((s) => ({
        title: s.title,
        items: s.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          price_source: i.price_source ?? 'ai_estimate',
          taxable: i.taxable,
          tax_category: i.tax_category,
          discount: i.discount,
          cost: i.cost,
          markup_pct: i.markup_pct,
          confidence: i.confidence,
          basis: i.basis,
          optional: i.optional,
        })),
      })),
    } as RefinementPayload
  )

  const draftItemById = new Map<string, LineItemOutput>()
  draft.sections.forEach((s, si) => s.items.forEach((it, ii) => draftItemById.set(`s${si}i${ii}`, it)))
  const draftSectionById = new Map(draft.sections.map((s, si) => [`s${si}`, s]))
  const refinedPurpose = new Map(refined.sections.map((s) => [normalizeText(s.title), s.purpose]))

  const sections: EstimateSectionOutput[] = mergedSections.map((ms) => {
    const purpose = draftSectionById.get(ms.id)?.purpose ?? refinedPurpose.get(normalizeText(ms.title))
    return {
      title: ms.title,
      ...(purpose ? { purpose } : {}),
      items: ms.items.map((mi) => fromEditorItem(mi, draftItemById.get(mi.id))),
    }
  })

  const keepSummary = (draft.summary ?? '').trim().length >= 20
  return {
    estimate: { ...draft, summary: keepSummary ? draft.summary : refined.summary || draft.summary, sections },
    changedLines: diff.changed.length,
    addedLines: diff.added.length,
    removedLines: diff.removed.length,
  }
}

export type PatchDecisionReason = 'improved' | 'not_improved' | 'zero_total'

export interface PatchDecision {
  accept: boolean
  reason: PatchDecisionReason
  before: number
  after: number
}

export function sectionsTotal(sections: EstimateSectionOutput[]): number {
  let total = 0
  for (const s of sections) {
    for (const i of s.items) {
      const t = i.quantity * i.unit_price
      if (Number.isFinite(t)) total += t
    }
  }
  return total
}

/**
 * ACCEPT only if the score went up (equal is a rejection: no new version for nothing) and the
 * patched draft still has a priced total (a patch that empties the estimate is never taken).
 */
export function decidePatch(before: StructureResult, after: StructureResult, patchedTotal: number): PatchDecision {
  if (!(patchedTotal > 0)) return { accept: false, reason: 'zero_total', before: before.score, after: after.score }
  if (after.score > before.score) return { accept: true, reason: 'improved', before: before.score, after: after.score }
  return { accept: false, reason: 'not_improved', before: before.score, after: after.score }
}

/** Hints for the next pass or the owner banner, most impactful first (same order generate uses). */
export function sortedHints(findings: StructureFinding[]): string[] {
  return [...findings].sort((a, b) => b.penalty - a.penalty).map((f) => f.hint)
}

export interface PatchEvaluation {
  merged: PatchableEstimate
  before: StructureResult
  after: StructureResult
  decision: PatchDecision
  changedLines: number
  addedLines: number
  removedLines: number
}

/**
 * The whole pure decision: merge, score the draft and the patched draft with the SAME context (so
 * the comparison is apples to apples), decide. `ctx` is everything scoreStructure needs except the
 * sections and summary.
 */
export function evaluatePatch(
  draft: PatchableEstimate,
  refined: PatchableEstimate,
  ctx: Omit<StructureInput, 'sections' | 'summary'>
): PatchEvaluation {
  const { estimate: merged, changedLines, addedLines, removedLines } = mergePatch(draft, refined)
  const before = scoreStructure({ ...ctx, summary: draft.summary, sections: draft.sections })
  const after = scoreStructure({ ...ctx, summary: merged.summary, sections: merged.sections })
  return {
    merged,
    before,
    after,
    decision: decidePatch(before, after, sectionsTotal(merged.sections)),
    changedLines,
    addedLines,
    removedLines,
  }
}
