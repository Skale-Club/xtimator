/**
 * lib/estimate/graph/nodes/patch-refine.ts
 *
 * Phase 4d (flag ESTIMATOR_PATCH_REFINE, default OFF): the section-patch variant of auto-refine.
 * Reached only from the assess edge, only when the flag is on, a persistence hook was injected
 * into buildEstimateGraph and the draft is not vague (the $0 case keeps regenerating).
 *
 * Steps (all failures keep the first draft; the node NEVER throws and NEVER sets `failure`):
 *   1. load the CURRENT draft (company-scoped) as an estimate;
 *   2. run the refine node (the Phase 2 refine path, with its own price guardrails) on it, with
 *      an instruction built from the structure findings;
 *   3. merge with mergeRefinement, re-score with scoreStructure (draft and patch, same context);
 *   4. ACCEPT only if the score went up: hand the patched sections to the injected `persist` hook
 *      and move state to the persisted estimate. Otherwise nothing is written.
 *
 * The write path is injected because saving an estimate (totals, tax, ai_meta, versioning) lives
 * in lib/services/generate-estimate.ts, which this module must not import from for writing. With
 * no hook the graph never routes here and auto-refine regenerates exactly as before.
 *
 * companyId comes ONLY from state (trusted tenant scope, never LLM-derived).
 */
import { requireServiceClient } from '@/lib/supabase/service'
import { resolvePlaybook } from '@/lib/ai/playbooks'
import type { EstimateOutput, EstimateSectionOutput } from '@/lib/ai/types'
import { reportGeneratePhase } from '@/lib/observability/generation-phase'
import { mentionsMeasurements } from '@/lib/estimate/quality/structure-score'
import { buildPatchInstruction, evaluatePatch, sortedHints, type PatchableEstimate } from '../patch-refine'
import type { EstimateStateType } from '../state'
import type { StepRunner } from '../types'
import { makeRefineNode } from './refine'

/** What the persistence hook receives for an ACCEPTED patch. */
export interface PersistPatchArgs {
  companyId: string
  projectId: string
  /** The draft the patch was made from. */
  baseEstimateId: string
  /** The merged, price-guarded estimate content (sections already carry server prices). */
  patched: PatchableEstimate
  structure: { score: number; band: 'refine' | 'review' | 'ok'; hints: string[]; findings: string[] }
}

/**
 * Write an accepted patch and make it the project's current estimate. Resolve `{ estimateId }` of
 * the persisted estimate, or null when nothing was written (the first draft then stays current).
 * Must not throw (a throw is caught and treated as null).
 */
export type PersistPatch = (args: PersistPatchArgs) => Promise<{ estimateId: string } | null>

type LoadedDraft = {
  estimate: PatchableEstimate
  industry: string | null
  projectType: string | null
}

type Svc = ReturnType<typeof requireServiceClient>

async function loadDraft(svc: Svc, estimateId: string, companyId: string, projectId: string): Promise<LoadedDraft | null> {
  const { data } = await svc
    .from('estimates')
    .select(
      'summary, notes, timeline, payment_terms, warranty_terms, sections:estimate_sections(title, sort_order, items:estimate_items(description, quantity, unit, unit_price, price_source, taxable, tax_category, discount, cost, markup_pct, confidence, basis, optional, sort_order))'
    )
    .eq('id', estimateId)
    .eq('company_id', companyId)
    .maybeSingle()
  const row = data as {
    summary: string | null
    notes: string | null
    timeline: string | null
    payment_terms: string | null
    warranty_terms: string | null
    sections: Array<{
      title: string
      sort_order: number
      items: Array<Record<string, unknown> & { sort_order: number }> | null
    }> | null
  } | null
  if (!row || !Array.isArray(row.sections)) return null

  const sections: EstimateSectionOutput[] = [...row.sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      title: s.title,
      items: [...(s.items ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => {
          const item: EstimateSectionOutput['items'][number] = {
            description: String(i.description ?? ''),
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
            price_source: (i.price_source as EstimateSectionOutput['items'][number]['price_source']) ?? 'ai_estimate',
          }
          if (i.unit) item.unit = String(i.unit)
          if (i.taxable === false) item.taxable = false
          if (i.tax_category) item.tax_category = i.tax_category as 'labor' | 'materials' | 'other'
          if (Number(i.discount) > 0) item.discount = Number(i.discount)
          if (i.cost !== null && i.cost !== undefined) item.cost = Number(i.cost)
          if (i.markup_pct !== null && i.markup_pct !== undefined) item.markup_pct = Number(i.markup_pct)
          if (i.confidence) item.confidence = i.confidence as 'low' | 'medium' | 'high'
          if (i.basis) item.basis = String(i.basis)
          if (i.optional === true) item.optional = true
          return item
        }),
    }))

  // Trade context for the playbook the re-score uses (best-effort).
  let industry: string | null = null
  let projectType: string | null = null
  try {
    const { data: company } = await svc.from('companies').select('industry').eq('id', companyId).single()
    industry = (company as { industry?: string | null } | null)?.industry ?? null
    const { data: project } = await svc
      .from('projects')
      .select('project_type')
      .eq('id', projectId)
      .eq('company_id', companyId)
      .maybeSingle()
    projectType = (project as { project_type?: string | null } | null)?.project_type ?? null
  } catch {
    // neutral context
  }

  return {
    estimate: {
      summary: row.summary ?? '',
      ...(row.notes ? { notes: row.notes } : {}),
      ...(row.timeline ? { timeline: row.timeline } : {}),
      ...(row.payment_terms ? { payment_terms: row.payment_terms } : {}),
      ...(row.warranty_terms ? { warranty_terms: row.warranty_terms } : {}),
      sections,
    },
    industry,
    projectType,
  }
}

/** The kept-draft outcome: counts the attempt (so the loop ends) and touches nothing else. */
function keepDraft(state: EstimateStateType, outcome: string): Partial<EstimateStateType> {
  console.info('[estimate-graph] patch refine kept the first draft', { outcome })
  return { refineAttempts: (state.refineAttempts ?? 0) + 1, patchOutcome: 'rejected' }
}

export const makePatchRefineNode =
  (runner: StepRunner, persist: PersistPatch) =>
  async (state: EstimateStateType): Promise<Partial<EstimateStateType>> => {
    try {
      reportGeneratePhase({
        attemptId: state.attemptId,
        phase: 'refining',
        inputType: state.inputType,
        companyId: state.companyId,
        projectId: state.projectId,
        detail: { round: (state.refineAttempts ?? 0) + 1 },
      })

      if (!state.estimateId) return keepDraft(state, 'no_estimate')
      const svc = requireServiceClient()
      const draft = await loadDraft(svc, state.estimateId, state.companyId, state.projectId)
      if (!draft || draft.estimate.sections.length === 0) return keepDraft(state, 'draft_not_loadable')

      const existingEstimate = {
        suggested_project_name: '',
        summary: draft.estimate.summary,
        notes: draft.estimate.notes,
        timeline: draft.estimate.timeline,
        payment_terms: draft.estimate.payment_terms,
        warranty_terms: draft.estimate.warranty_terms,
        sections: draft.estimate.sections,
      } as unknown as EstimateOutput

      // The Phase 2 refine path, with its own price guardrails on the lines it changes.
      const refineResult = await makeRefineNode(runner)({
        ...state,
        existingEstimate,
        instruction: buildPatchInstruction(state.structureHints ?? []),
      })
      const refined = refineResult.refined
      if (refineResult.failure || !refined) return keepDraft(state, 'refine_failed')

      const language = state.estimateLanguage === 'pt' || state.estimateLanguage === 'es' ? state.estimateLanguage : 'en'
      const sourceText = draft.estimate.sections.flatMap((s) => s.items.map((i) => `${i.description} ${i.basis ?? ''}`)).join('\n')
      const evaluation = evaluatePatch(
        draft.estimate,
        {
          summary: refined.summary,
          sections: refined.sections as EstimateSectionOutput[],
        },
        {
          playbook: resolvePlaybook({
            industry: draft.industry,
            projectType: draft.projectType,
            text: sourceText,
          }),
          openQuestions: state.openQuestions?.length ?? 0,
          // The walkthrough text is not in graph state; both scores use the same value.
          hasMeasurements: mentionsMeasurements(''),
          language,
        }
      )

      if (!evaluation.decision.accept) return keepDraft(state, evaluation.decision.reason)

      const hints = sortedHints(evaluation.after.findings)
      const persisted = await persist({
        companyId: state.companyId,
        projectId: state.projectId,
        baseEstimateId: state.estimateId,
        patched: evaluation.merged,
        structure: {
          score: evaluation.after.score,
          band: evaluation.after.band,
          hints,
          findings: evaluation.after.findings.map((f) => f.message),
        },
      })
      if (!persisted?.estimateId) return keepDraft(state, 'persist_failed')

      return {
        estimateId: persisted.estimateId,
        refineAttempts: (state.refineAttempts ?? 0) + 1,
        structureBand: evaluation.after.band,
        structureHints: hints,
        structureScore: evaluation.after.score,
        patchOutcome: 'accepted',
      }
    } catch (err) {
      console.warn('[estimate-graph] patch refine failed; keeping the first draft:', err)
      return keepDraft(state, 'error')
    }
  }
