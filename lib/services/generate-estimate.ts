import { revalidatePath } from 'next/cache'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { serializePhotoContext } from '@/lib/estimate/photo-context'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import { type EstimateInput } from '@/lib/ai'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'
import { resolveLinePrices } from '@/lib/estimate/pricing/resolve-prices'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'
import {
  round2,
  assertFinitePositive,
  computeTotalsDiscrepancy,
  TOTALS_EPSILON,
} from '@/lib/estimate/totals'
import {
  buildEstimateQualitySignal,
  reportEstimateQuality,
  resolveQualityThresholds,
} from '@/lib/estimate/quality/quality-signal'
import { isVagueEstimate } from '@/lib/estimate/quality/vagueness'
import {
  checkEstimateConsistency,
  type ConsistencyFlag,
} from '@/lib/estimate/quality/consistency'
import * as Sentry from '@sentry/nextjs'
import { getPriceBookItems } from '@/lib/queries/price-book'
import {
  resolveEstimateLanguage,
  type EstimateLanguage,
} from '@/lib/i18n/resolve-estimate-language'
import { normalizeCurrencyCode } from '@/lib/money/currency'
import { getWhatsAppSystemPrompt } from '@/lib/platform-config'
import { persistEstimateVersion } from '@/lib/services/persist-estimate-version'
import { generatePublicSlugToken } from '@/lib/estimate/public-url'
import {
  computeValidUntil,
  aiAuthoredFields,
  documentBlocksContext,
  initialSectionVisibility,
  resolveDocumentBlocks,
} from '@/lib/estimate/document-blocks'
import { buildAiMeta, type QualityBand } from '@/lib/estimate/ai-meta'
import { ceilingInCurrency } from '@/lib/estimate/pricing/price-bands'
import { resolveEstimateTotalCeiling, resolveProjectStatusAfterEstimate } from '@/lib/estimate/project-status'
import { playbookFor } from '@/lib/ai/prompt-builder'
import { mentionsMeasurements, scoreStructure } from '@/lib/estimate/quality/structure-score'
import { buildKnowledgeQuery, loadKnowledgeContext } from '@/lib/ai/knowledge-context'
import { planScope } from '@/lib/ai/plan-scope'
import { isTwoStepEnabled } from '@/lib/ai/scope-plan'
import { decideDraftEscalation } from '@/lib/ai/model-policy'
import { getEscalationConfig } from '@/lib/ai/step-models'
import { reportGeneratePhase } from '@/lib/observability/generation-phase'
import { billingCreateDenied, BillingBlockedError } from '@/lib/billing/access-guard'

/** 260927: minimum gap between two live drafting reports in the journal. */
const DRAFT_REPORT_MIN_INTERVAL_MS = 2_000
/** 260927: section titles carried per drafting report (the checklist shows the last few). */
const MAX_REPORTED_DRAFT_TITLES = 8

export type ClientSuggestion = {
  detectedName: string
  matchedClientId: string | null
  matchedClientName: string | null
  autoLinked: boolean
}

export type GenerateEstimateResult = {
  estimateId: string
  version: number
  clientSuggestion: ClientSuggestion | null
  language: EstimateLanguage
  /**
   * SEED-057 D: how well structured the draft is. Carried back through the
   * graph so assess can route a poor draft (< 50) to ONE targeted refine pass
   * built from `hints`, instead of the blind "be more detailed" retry. Read from
   * the result, never re-queried, so assess touches no new column.
   */
  structure?: { score: number; band: QualityBand; hints: string[] }
  /** SEED-057 D: the model's open questions, most impactful first (feeds needs-details). */
  openQuestions?: string[]
}

export interface GenerateEstimateOptions {
  /** Explicit override from the caller (UI dropdown, WhatsApp command). */
  language?: EstimateLanguage
  /** User app language to consider in the cascade (rarely set from server). */
  userAppLanguage?: EstimateLanguage
  /**
   * Free-form prompts from non-recording sources (MCP `create_estimate` tool,
   * WhatsApp text-only messages, future "describe in your own words" UI).
   * When provided, these satisfy the "at least one input" precondition even
   * if the project has no transcripts or photos. (Phase 89 deferral closed
   * 2026-05-27.)
   */
  prompts?: string[]
  /**
   * Channel that triggered generation. When 'whatsapp', the admin-configured
   * WhatsApp system-prompt addendum is fetched and appended to the base prompt.
   * Omit for web/MCP so those channels are unaffected.
   */
  channel?: 'whatsapp'
  /** SEED-057 D: guidance from the quality gate for a second attempt (see EstimateInput.qualityHints). */
  qualityHints?: string[]
  /** auth.users.id of the staff member or owner who triggered generation. Stored on the estimate for "Prepared by" attribution. */
  createdByUserId?: string
  /**
   * Phase 110 (COST-01): non-LLM cost-correlation context threaded into
   * EstimateInput.costContext so the OpenRouter adapter can attribute the real
   * captured cost. companyId/projectId here come from the TRUSTED params, never
   * from LLM output. All optional/additive.
   */
  costContext?: {
    attemptId?: string | null
    companyId?: string | null
    projectId?: string | null
    /** Input type of the attempt; stamps the journal's phase rows. */
    inputType?: 'recording' | 'photo' | 'manual_text'
  }
}

const IMPACT_RANK = { low: 0, medium: 1, high: 2 } as const

function normalizeClientNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Core estimate generation pipeline — callable without an HTTP request or
 * authenticated user session. Uses the service-role client so it can be
 * invoked from webhook handlers, cron jobs, or other server-side contexts.
 *
 * Throws on unrecoverable errors (not found, no inputs, DB failure).
 */
export async function generateEstimateForProject(
  companyId: string,
  projectId: string,
  options: GenerateEstimateOptions = {}
): Promise<GenerateEstimateResult> {
  const supabase = requireServiceClient()

  // Sub-phase narration (lib/estimate/generation-phases.ts). The attempt
  // lineage is already threaded in here for cost attribution (COST-01), so the
  // phases need no new plumbing: they ride the SAME costContext. Absent
  // costContext (a direct service call outside the Inngest job) makes every
  // report a no-op, so nothing below is conditional on it.
  const phase = (
    name: Parameters<typeof reportGeneratePhase>[0]['phase'],
    detail?: Parameters<typeof reportGeneratePhase>[0]['detail']
  ) =>
    reportGeneratePhase({
      attemptId: options.costContext?.attemptId,
      phase: name,
      companyId,
      projectId,
      inputType: options.costContext?.inputType,
      detail,
    })

  phase('context')

  // Gather context data in parallel
  const [projectResult, recordings, photos, companyResult] = await Promise.all([
    supabase
      .from('projects')
      .select(
        '*, client:clients(name, email, phone, address, city, state, zip, preferred_language)'
      )
      .eq('id', projectId)
      .single(),
    getProjectRecordings(supabase, projectId),
    getProjectPhotos(supabase, projectId),
    supabase
      .from('companies')
      .select(
        'industry, industries, currency_code, default_tax_rate, default_payment_terms, default_warranty_terms, default_validity_days, document_blocks, estimate_terms_enabled, estimate_terms_text, name, default_estimate_language, tax_config, city, state'
      )
      .eq('id', companyId)
      .single(),
  ])

  const project = projectResult.data
  const company = companyResult.data

  if (!project) throw new Error('Project not found')
  if (!company) throw new Error('Company not found')
  // Security: this function runs on the service-role client (bypasses RLS),
  // so ownership must be checked explicitly. Without this, any caller that
  // can reach a valid projectId (web route, chat/MCP tool) could generate an
  // estimate against another tenant's project — reading its transcripts/
  // photos/client PII and writing destructive updates (version bump,
  // is_current flips) to that tenant's data.
  if (project.company_id !== companyId) throw new Error('Project not found')

  // SEED-055 Phase D: generating (a new estimate version) needs credits. The AI
  // routes pre-check too; this is the server-side backstop for every other
  // entry (WhatsApp confirm, MCP, agent tools, Inngest). Inert while
  // enforcement is OFF.
  const billingBlocked = await billingCreateDenied(companyId, 'estimate')
  if (billingBlocked) throw new BillingBlockedError(billingBlocked.code)

  const currencyCode = normalizeCurrencyCode(company.currency_code)
  // SEED-056: which optional blocks this company's new estimates carry. An AI
  // estimate keeps the summary (unless the company switched "AI summary" off).
  const documentBlocks = resolveDocumentBlocks(
    company.document_blocks,
    documentBlocksContext(company, true),
  )
  const priceBookItems = (await getPriceBookItems(supabase, companyId)).filter(
    (item) => normalizeCurrencyCode(item.currency_code) === currencyCode
  )

  const hasTranscripts = recordings.some(
    (r) => r.transcript && r.transcript.trim().length > 0
  )
  // D3 (quick-260705-2gp): count only ANALYZED photos — the prompt builder
  // below filters to ai_description, so an unanalyzed photo contributes zero
  // context and must not satisfy the precondition on its own.
  const hasPhotos = photos.some((p) => p.ai_description && p.ai_description.trim().length > 0)
  const hasPrompts =
    Array.isArray(options.prompts) &&
    options.prompts.some((p) => typeof p === 'string' && p.trim().length > 0)
  if (!hasTranscripts && !hasPhotos && !hasPrompts) {
    throw new Error(
      'At least one audio transcript, photo, or prompt is required'
    )
  }

  const client = project.client as {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    preferred_language: EstimateLanguage | null
  } | null

  // Phase 52: resolve target language via cascade
  const language = resolveEstimateLanguage({
    override: options.language ?? null,
    clientPreferred: client?.preferred_language ?? null,
    companyDefault:
      (company.default_estimate_language as EstimateLanguage | null) ?? null,
    userAppLanguage: options.userAppLanguage ?? null,
  })

  const clientAddress = client
    ? [client.address, client.city, client.state, client.zip]
        .filter(Boolean)
        .join(', ')
    : null

  const transcripts = recordings
    .filter((r) => r.transcript && r.transcript.trim().length > 0)
    .map((r) => r.transcript!)

  // PHOTO-01 (audit E2) + PEXT-02 (v4.20): fold the user-entered caption (e.g.
  // "north wall, 12ft ceiling" — already rendered in share/PDF) alongside the
  // AI vision description, plus a compact structured-extraction suffix when
  // one exists (serializePhotoContext), so both reach the estimator instead
  // of being discarded. The WHOLE resulting string is wrapped in sanitizeField
  // at prompt-builder.ts's <photo_description> tag — no parallel unsanitized
  // path. No-caption, no-extraction photos keep the exact pre-existing string
  // (byte-identical) — serializePhotoContext reproduces that format exactly.
  const photoDescriptions = photos
    .filter((p) => p.ai_description && p.ai_description.trim().length > 0)
    .map((p, i) => serializePhotoContext(p, i))

  const prompts = (options.prompts ?? [])
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => p.length > 0)

  const estimateInput: EstimateInput = {
    industry: company.industry,
    projectName: project.name,
    projectType: project.project_type,
    targetBudget: project.target_budget ? Number(project.target_budget) : null,
    clientName: client?.name ?? null,
    clientAddress,
    transcripts,
    photoDescriptions,
    prompts: prompts.length > 0 ? prompts : undefined,
    priceBookItems,
    currencyCode,
    aiBlocks: aiAuthoredFields(documentBlocks),
    ...(options.qualityHints?.length ? { qualityHints: options.qualityHints } : {}),
    language,
    // Phase 110 (COST-01): non-LLM correlation context for cost capture. Comes
    // from the TRUSTED params (companyId is a function param, never LLM-derived).
    costContext: options.costContext,
  }

  // SEED-057 E5: the company's own knowledge (house rules, prices). Never throws
  // and is bounded in time; a knowledge outage costs the estimate its extra
  // context, nothing else.
  const knowledge = await loadKnowledgeContext({
    companyId, // param, never LLM-derived
    industries: Array.isArray(company.industries) && company.industries.length > 0
      ? (company.industries as string[])
      : company.industry
        ? [company.industry as string]
        : [],
    query: buildKnowledgeQuery([
      // The eager-create placeholder name says nothing about the job.
      (project.name as string | null)?.startsWith(PLACEHOLDER_PREFIX) ? null : (project.name as string | null),
      ...transcripts.slice(0, 2),
      ...prompts.slice(0, 2),
    ]),
  })
  if (knowledge.length > 0) estimateInput.knowledge = knowledge

  // WhatsApp-only: append the platform admin's system-prompt addendum.
  // Not fetched for web/MCP so those channels are unaffected.
  if (options.channel === 'whatsapp') {
    const extra = await getWhatsAppSystemPrompt()
    if (extra) estimateInput.extraInstructions = extra
  }

  // The estimator LLM call, the single longest stretch of the whole capture
  // (the bulk of the 4m40s `generate_estimate` step measured on 2026-08-06).
  // inputCount is what the model actually has to work from.
  const inputCount = transcripts.length + photoDescriptions.length + prompts.length
  // SEED-057 Phase C (E1): two-step generation, behind ESTIMATOR_TWO_STEP and
  // OFF by default. Step one (a fast, cheap model) turns the whole job into a
  // scope plan: trade, ONE consolidated measurement table, sections,
  // assumptions and open questions. Step two (the configured model, below)
  // fills items and prices under the playbook with that table as the only
  // source of quantities. planScope never throws; a null plan means this
  // generation simply runs in one step, exactly as with the flag off.
  if (isTwoStepEnabled()) {
    phase('planning', { inputCount })
    const planned = await planScope(estimateInput)
    const plan = planned.plan
    // The planning spend rides on the drafting call's single cost row.
    if (planned.costUsd) {
      estimateInput.costContext = { ...estimateInput.costContext, extraCostUsd: planned.costUsd }
    }
    if (plan) {
      estimateInput.plan = plan
      if (plan.detected_trade) estimateInput.playbookTrade = plan.detected_trade
    }
  }

  phase('drafting', { inputCount })

  // 260927: live drafting progress. The estimator call streams its tool-call
  // arguments (lib/ai/providers/openrouter-stream.ts), so this stretch is no
  // longer blind: each NEW section the model starts is reported to the journal
  // as another `drafting` row, which the capture checklist shows as
  // "3 sections so far: Demo, Framing, Electrical". Rate-limited so a fast
  // model writing many short sections cannot flood the journal; the pricing
  // phase's entry report carries the final counts regardless.
  let reportedSections = 0
  let lastDraftReportAt = 0
  // Only when there is an attempt to report into: without one every phase
  // report is a no-op, so streaming would buy nothing.
  if (options.costContext?.attemptId) estimateInput.onDraftProgress = (progress) => {
    const now = Date.now()
    if (progress.sections <= reportedSections) return
    if (now - lastDraftReportAt < DRAFT_REPORT_MIN_INTERVAL_MS) return
    reportedSections = progress.sections
    lastDraftReportAt = now
    phase('drafting', {
      inputCount,
      sectionsDrafted: progress.sections,
      itemsDrafted: progress.items,
      draftSections: progress.titles.slice(-MAX_REPORTED_DRAFT_TITLES),
    })
  }

  // Phase 4g: optional Opus escalation of the DRAFT call for large jobs. Disabled
  // unless ai_config.metadata.escalation.enabled === true with an Opus model; with
  // nothing configured the provider resolves exactly as before.
  const escalationModel = await decideDraftModel({
    plan: estimateInput.plan,
    sourceChars: [...transcripts, ...prompts].reduce((n, t) => n + t.length, 0),
    targetBudget: estimateInput.targetBudget,
    companyId,
    projectId: options.costContext?.projectId ?? null,
  })
  const provider = escalationModel
    ? await getAIProviderWithFallback(companyId, { modelOverride: escalationModel })
    : await getAIProviderWithFallback(companyId)
  const aiEstimate = await provider.generateEstimate(estimateInput)

  // SEED-057 C: the estimator is told to carry the plan's assumptions,
  // exclusions and open questions forward. If it dropped a list, fall back to
  // the plan's own, so step one's work is never silently lost.
  const plan = estimateInput.plan
  const aiNotes = {
    assumptions: aiEstimate.assumptions?.length ? aiEstimate.assumptions : plan?.assumptions,
    exclusions: aiEstimate.exclusions?.length ? aiEstimate.exclusions : plan?.exclusions,
    open_questions: aiEstimate.open_questions?.length ? aiEstimate.open_questions : plan?.open_questions,
    scope_confidence: aiEstimate.scope_confidence ?? plan?.scope_confidence,
    // Internal record only (ai_meta.source_notes); parseAiMeta never returns it.
    source_notes: aiEstimate.source_notes,
  }

  // Client suggestion — only when project has no linked client.
  // When an exact-normalized match exists, auto-link inline (service-role context
  // bypasses RLS; cannot call an authenticated server action from Inngest/webhook).
  // Failure of the inline update is non-fatal — estimate generation still succeeds
  // and the toast falls back to manual "Link" via autoLinked: false.
  let clientSuggestion: ClientSuggestion | null = null
  const detectedClientName = aiEstimate.suggested_client_name?.trim()
  if (!client && detectedClientName) {
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, name')
      .eq('company_id', companyId)

    const normalizedDetectedName = normalizeClientNameForMatch(detectedClientName)
    const matchedClient = (existingClients ?? []).find(
      (c) =>
        normalizeClientNameForMatch(c.name as string) === normalizedDetectedName
    )

    let autoLinked = false
    if (matchedClient?.id) {
      const { error: linkError } = await supabase
        .from('projects')
        .update({ client_id: matchedClient.id as string })
        .eq('id', projectId)

      if (linkError) {
        // Non-fatal — estimate generation must still succeed.
        // Toast will fall back to manual "Link" path on the client.
        console.warn(
          '[generate-estimate] auto-link failed, falling back to manual link toast',
          linkError
        )
      } else {
        autoLinked = true
      }
    }

    clientSuggestion = {
      detectedName: detectedClientName,
      matchedClientId: (matchedClient?.id as string | undefined) ?? null,
      matchedClientName: (matchedClient?.name as string | undefined) ?? null,
      autoLinked,
    }
  }

  // Server-side math validation
  const taxRate = Number(company.default_tax_rate) || 0

  // AIREL-04: resolved once, reused by both the aiProposedSubtotal dedupe below and
  // the over-ceiling verdict evaluated after totals are computed.
  const estimateTotalCeiling = resolveEstimateTotalCeiling()
  // The ceiling is a USD figure. This is the value in the estimate's currency for the service's
  // OWN comparisons below (flag-aware: unchanged with ESTIMATOR_PRICE_BANDS off or a USD estimate).
  // resolveLinePrices takes the raw USD value and converts it internally, so it is never passed
  // this one (that would convert twice).
  const estimateTotalCeilingLocal = ceilingInCurrency(estimateTotalCeiling, currencyCode)

  // GUARD-03 snapshot: capture the sections the AI's OWN numbers imply
  // BEFORE anchoring/clamping mutates any unit_price. Used for the discrepancy
  // metric below (which prices them with the SAME computeEstimateTotals the server
  // total uses: tax_config, taxable=false lines, line discounts, cost+markup); the
  // AI total itself is never persisted as authoritative.
  //
  // AIREL-04 / Opus Warning C (metric coherence): dedupe the AI's OWN raw
  // sections FIRST (same exact-duplicate-collapse rule the server applies to the
  // anchored/researched sections below) before summing. Without this, a
  // hallucinated repeated line would inflate the AI-implied total but NOT the
  // (deduped) server total, producing an artificial totals_discrepancy delta
  // that has nothing to do with anchoring/research — dedupe would otherwise fire
  // unexplained Sentry anomalies. `computedTotal` is irrelevant to this call (0,
  // so overCeiling is always false here) — only the deduped `.sections` are used;
  // the real over-ceiling verdict is evaluated later against the server grand total.
  const aiProposedSections = checkEstimateConsistency(aiEstimate.sections, 0, {
    totalCeiling: estimateTotalCeilingLocal,
  }).sections

  // GUARD-02 / SEED-057 E3 / RPRICE / AIREL-04: the shared price pipeline
  // (lib/estimate/pricing/resolve-prices.ts): demote model-claimed server labels,
  // anchor + clamp to the price book, company history, web research, then collapse
  // exact duplicates BEFORE totals so duplicates never inflate the persisted total.
  // Never throws; research is metered from the trusted attemptId (projectId is the
  // fallback seed for a direct service call). Region = the project client's city+state, else the company's own.
  const {
    sections: dedupedSections,
    anchoredCount,
    clampedCount,
    flaggedUnpriced,
    researchTelemetry,
    researchDiagnostics,
    priceChanges,
    consistencyFlags: preComputeFlags,
  } = await resolveLinePrices(aiEstimate.sections, {
    companyId, // param, never LLM-derived
    currencyCode,
    // Extra price-book fields: an area_based / base_plus_addons row priced 0 must not anchor a
    // $0 line, and (flagged by ESTIMATOR_PRICE_BANDS) units are compared.
    priceBookItems: priceBookItems.map((p) => ({
      name: p.name,
      unit_price: p.unit_price,
      unit: p.unit,
      pricing_type: p.pricing_type,
      price_per_unit: p.price_per_unit,
      minimum_price: p.minimum_price,
    })),
    region:
      client?.city || client?.state
        ? { city: client?.city ?? null, state: client?.state ?? null }
        : { city: company.city ?? null, state: company.state ?? null },
    supabase,
    projectId,
    attemptId: options.costContext?.attemptId ?? undefined,
    totalCeiling: estimateTotalCeiling, // USD; resolveLinePrices converts it itself
    playbook: playbookFor(estimateInput),
    onProgress: (detail) => phase('pricing', detail),
  })

  // GUARD-03 totals. TAX-03: when companies.tax_config is present the engine computes tax
  // PER-CATEGORY (Σ taxable_base_per_category × rate_category); when it is null/absent this is
  // BYTE-IDENTICAL to the pre-v4.11 flat-rate computation (ENG-02). A malformed tax_config is
  // coerced to null so it degrades to the flat path (GUARD-03 never-throw discipline) rather
  // than throwing. DEP-01: deposit + balance_due are now ACTIVE (computed by the single GUARD-03
  // authority + persisted below). At generation there is no deposit input (the AI never supplies a
  // deposit — ENG-01) → depositType is absent → deposit 0 → balanceDue === grandTotal (byte-identical).
  const taxConfig =
    company.tax_config != null ? (company.tax_config as TaxConfig) : null
  const {
    sections: calculatedSections,
    subtotal,
    taxAmount,
    grandTotal,
    discountAmount,
    balanceDue,
  } = computeEstimateTotals(dedupedSections, { taxRate, taxConfig, currencyCode })

  // GUARD-03: the server recalculation above is the SINGLE authoritative source.
  // Defensively coerce each persisted total to a finite, >= 0 value (no-op on the
  // happy path — valid totals must not shift). Never throws.
  const safeSubtotal = assertFinitePositive(subtotal)
  const safeTaxAmount = assertFinitePositive(taxAmount)
  const safeGrandTotal = assertFinitePositive(grandTotal)
  const safeDiscountAmount = assertFinitePositive(discountAmount)
  // DEP-01: same finite, >= 0 persistence guard. assertFinitePositive floors negatives to 0 — a deposit
  // exceeding the total persists balance_due 0 (never a negative). At generation deposit is 0 here, so
  // balanceDue === grandTotal (byte-identical). deposit_value persists null at generation (no input).
  const safeBalanceDue = assertFinitePositive(balanceDue)

  // Log-only invariant guard (never blocks persistence): grand == subtotal + tax
  // within rounding epsilon. True by construction; asserted as a regression guard.
  const totalsSane =
    Math.abs(safeGrandTotal - round2(safeSubtotal + safeTaxAmount)) <=
    TOTALS_EPSILON
  if (!totalsSane) {
    console.warn('[generate-estimate] totals invariant violation', {
      safeSubtotal,
      safeTaxAmount,
      safeGrandTotal,
    })
  }

  // AIREL-04: over-ceiling verdict against the REAL server-computed grand total
  // (post-dedupe, post-tax) — the same `computedTotal > ceiling` comparison the
  // pure consistency module is unit-tested against, applied here directly (rather
  // than re-invoking the module a second time) since dedupe already ran above.
  // Merged with the duplicate/qty-0 flags from the pre-compute pass so
  // `consistencyFlags` carries every AIREL-04 signal for this generation.
  const overCeiling = safeGrandTotal > estimateTotalCeilingLocal
  const consistencyFlags: ConsistencyFlag[] = [...preComputeFlags]
  if (overCeiling) {
    consistencyFlags.push({
      kind: 'total_over_ceiling',
      total: safeGrandTotal,
      ceiling: estimateTotalCeilingLocal,
    })
  }

  // GUARD-03 discrepancy metric: server grand vs the naive AI-implied grand
  // (pre-anchor), with anchored/clamped counts. The AI total is NEVER persisted —
  // only the server safeGrandTotal writes to estimates.total. Best-effort: any
  // emission failure is swallowed so observability can never break generation.
  //
  // WI-1 (HARDEN-OBS-01): the discrepancy + quality signal are computed HERE (all inputs
  // are already in scope), but the reportEstimateQuality CALL is deferred until AFTER
  // persistence so the Sentry tag carries the real estimate_id (option (ii) in the plan —
  // no test asserts console.info ordering; the eval harness does not read the tag string).
  let qualitySignal: ReturnType<typeof buildEstimateQualitySignal> | null = null
  let qualityDiscrepancy: ReturnType<typeof computeTotalsDiscrepancy> | null = null
  try {
    // Like-with-like: the AI-implied grand total goes through the SAME totals engine (and the
    // same tax_config / currency) as the server total, on the AI's pre-anchoring prices, so
    // the metric only moves when anchoring/research/clamping changed a price.
    const aiProposedGrand = computeEstimateTotals(aiProposedSections, {
      taxRate,
      taxConfig,
      currencyCode,
    }).grandTotal
    const discrepancy = computeTotalsDiscrepancy({
      serverGrand: safeGrandTotal,
      aiGrand: aiProposedGrand,
      anchoredCount,
      clampedCount,
    })
    qualityDiscrepancy = discrepancy
    // Build the consolidated quality signal (pure): discrepancy magnitude + research
    // attempted-vs-usable telemetry (graceful fallback if absent) + flagged-unpriced count.
    qualitySignal = buildEstimateQualitySignal(
      { discrepancy, flaggedUnpriced, research: researchTelemetry },
      resolveQualityThresholds()
    )
  } catch (err) {
    console.warn('[generate-estimate] quality signal build failed', err)
  }

  // Phase narration: everything from here on is DB writes (blank replacement,
  // version bump, estimate + sections + items). The last stretch before the
  // journal's `succeeded` event lands.
  phase('saving', {
    itemCount: dedupedSections.reduce((n, s) => n + s.items.length, 0),
    sectionCount: dedupedSections.length,
  })

  // REPLACE-BLANK: an untouched blank estimate must not leave an empty version
  // behind. When the project's current estimate is a pristine blank — draft,
  // never AI-written (summary IS NULL), and zero total — delete it before
  // versioning so the AI result takes its place (typically version 1) instead of
  // versioning on top of an empty shell. AI estimates always carry a summary and
  // consolidated estimates aren't draft, so neither is matched; an edited blank
  // (total>0) is preserved as a real version. The delete cascades to the blank's
  // section/item rows.
  await supabase
    .from('estimates')
    .delete()
    .eq('project_id', projectId)
    .eq('is_current', true)
    .eq('workflow_status', 'draft')
    .is('summary', null)
    .eq('total', 0)

  // Version carry-forward (Quick-260704-pt2) — capture the currently-current
  // estimate's id AFTER the REPLACE-BLANK delete above: querying is_current=true
  // post-delete means a deleted pristine-blank naturally returns no row (nothing
  // to copy), while a real prior version (not deleted) is correctly captured.
  const { data: previousCurrent } = await supabase
    .from('estimates')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .maybeSingle()

  // Version management. The previous current version is NOT demoted here: the
  // new row is inserted as non-current and only promoted once its sections and
  // items are saved (see the swap below), so a failed save never leaves the
  // project without a current estimate.
  const { data: existingEstimates } = await supabase
    .from('estimates')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = (existingEstimates?.[0]?.version ?? 0) + 1

  // SEED-057: the AI's assumptions / exclusions / open questions travel with the
  // estimate in estimates.ai_meta (owner-facing only). Written in the SAME insert
  // when there is something to write; if the column does not exist yet (the
  // migration has not been applied) the insert is retried without it, so a deploy
  // that lands before the migration keeps generating.
  // SEED-057 D: how well structured is the draft? Scored on the server-side
  // sections (after anchoring, research and dedupe), against the playbook the
  // prompt used. Persisted only when there is something to tell the owner.
  const sourceText = [...transcripts, ...photoDescriptions, ...prompts].join('\n')
  const structure = scoreStructure({
    summary: aiEstimate.summary,
    sections: dedupedSections,
    playbook: playbookFor(estimateInput),
    openQuestions: aiNotes.open_questions?.length ?? 0,
    hasMeasurements: mentionsMeasurements(sourceText),
    language,
    currencyCode,
  })
  // Internal record only (ai_meta.pricing). Tolerates a missing priceChanges: observability
  // must never fail a generation.
  const lineChanges = priceChanges ?? []
  const pricingRecord =
    researchTelemetry || lineChanges.length || researchDiagnostics
      ? {
          ...(researchTelemetry ? { research: researchTelemetry } : {}),
          ...(lineChanges.length ? { changes: lineChanges } : {}),
          ...(researchDiagnostics ? { diagnostics: researchDiagnostics } : {}),
        }
      : undefined
  const aiMeta = buildAiMeta(
    aiNotes,
    structure.band === 'ok'
      ? null
      : { score: structure.score, band: structure.band, findings: structure.findings.map((f) => f.message) },
    pricingRecord,
  )

  // Persist estimate
  const estimateRow = {
      project_id: projectId,
      company_id: companyId,
      currency_code: currencyCode,
      version: nextVersion,
      // Promoted to current only after sections + items are saved.
      is_current: false,
      status: 'draft',
      workflow_status: 'draft',
      summary: aiEstimate.summary,
      // SEED-056: the model may only author timeline / notes when the company
      // switched those blocks on; anything it returns otherwise is discarded
      // (belt and braces against model drift). Payment and warranty are ALWAYS
      // the company's own text, so a fresh estimate is never "customized".
      notes: documentBlocks.notes ? (aiEstimate.notes ?? null) : null,
      timeline: documentBlocks.timeline ? (aiEstimate.timeline ?? null) : null,
      payment_terms: company.default_payment_terms ?? null,
      warranty_terms: company.default_warranty_terms ?? null,
      // SEED-056: materialised at creation (copy, not reference); legacy rows
      // keep NULL and the resolver's all-visible fallback.
      presentation_settings: { sections: initialSectionVisibility(documentBlocks) },
      valid_until: computeValidUntil(null, company.default_validity_days),
      subtotal: safeSubtotal,
      // DISC-02: persist the server-computed GLOBAL discount into the EXISTING estimates.discount_*
      // columns (no new column). At generation there is no global discount → null/0/0, byte-identical.
      discount_type: safeDiscountAmount > 0 ? 'amount' : null,
      discount_value: safeDiscountAmount,
      discount_amount: safeDiscountAmount,
      tax_rate: taxRate,
      tax_amount: safeTaxAmount,
      total: safeGrandTotal,
      // DEP-01: persist the server-computed deposit + balance_due into the Phase-129 columns.
      // At generation there is no deposit input → 'none' / null / grandTotal (byte-identical: the
      // dormant default deposit_type='none' is written explicitly, deposit_value null, balance_due=grandTotal).
      deposit_type: 'none',
      deposit_value: null,
      balance_due: safeBalanceDue,
      language,
      // PUBURL-01: every NEW estimate gets a friendly-URL token at creation time —
      // the backfill script (scripts/backfill-public-urls.ts) only covers
      // PRE-EXISTING rows. Same generator as the backfill script — one code path.
      public_slug_token: generatePublicSlugToken(),
      created_by_user_id: options.createdByUserId ?? null,
  }

  // The shared write path (lib/services/persist-estimate-version.ts): insert non-current, save
  // sections + items, cleanup on failure, then the safe is_current swap and photo carry-forward.
  const estimateId = await persistEstimateVersion(supabase, {
    companyId,
    projectId,
    estimateRow,
    aiMeta,
    calculatedSections,
    previousCurrentId: (previousCurrent?.id as string | undefined) ?? null,
    onInserted: (insertedId) => {
      // WI-1 (HARDEN-OBS-01): emit the quality signal now that estimate_id is known. This
      // ALWAYS fires the byte-identical console.info('[totals_discrepancy]', discrepancy) line
      // (tests/eval + ops depend on it) and, on an anomaly (>threshold discrepancy OR low
      // research hit-rate), raises a Sentry warning tagged with company_id/estimate_id.
      // reportEstimateQuality NEVER throws, so observability can never break generation.
      if (qualitySignal && qualityDiscrepancy) {
        reportEstimateQuality(qualityDiscrepancy, qualitySignal, {
          companyId,
          estimateId: insertedId,
        })
      }

      // AIREL-04: surface consistency flags (duplicate collapses / qty-0-with-price /
      // over-ceiling) in the SAME best-effort, never-throw observability channel as
      // the totals_discrepancy signal above. Additive — does not touch
      // quality-signal.ts's locked EstimateQualitySignal shape.
      if (consistencyFlags.length > 0) {
        try {
          console.info('[estimate_consistency]', {
            companyId,
            estimateId: insertedId,
            flags: consistencyFlags,
          })
          Sentry.captureMessage('[estimate-quality] consistency flag', {
            level: 'warning',
            tags: { company_id: companyId, estimate_id: insertedId },
            extra: { flags: consistencyFlags },
          })
        } catch {
          // Observability must never break generation.
        }
      }
    },
  })

  // Update project status. RFALL-01: when research flagged an unpriced item AND the
  // estimate still carries real value (total>0), surface it via the EXISTING
  // awaiting_details recourse path (the needs-details banner renders on this status)
  // — a partially-priced estimate is NOT blocked (the 108-02 vagueness gate permits a
  // total>0 estimate), the owner is just prompted to fill the flagged line. When
  // nothing is flagged (or total===0), status stays 'estimate_ready' — byte-identical
  // to before. projects.status is unconstrained TEXT (no migration).
  //
  // AIREL-04 (audit C4): a computed grand total that blows past the configured
  // absurdity ceiling (overCeiling) routes through this SAME non-destructive seam —
  // added with `||`, never replacing the flaggedUnpriced condition. The estimate
  // persists CURRENT and EDITABLE, exactly like the flaggedUnpriced case; it is
  // NEVER routed through assess/autoRefine/revertVagueEstimate (that destructive
  // vague path stays untouched) and NEVER deleted. flag > block (adaptive-first):
  // a false positive on a legitimate large job must never destroy the estimate —
  // it just asks the owner to review before proceeding.
  // The rule lives in lib/estimate/project-status.ts, shared with the patch-refine path.
  const projectStatus = resolveProjectStatusAfterEstimate({
    flaggedUnpriced,
    grandTotal: safeGrandTotal,
    ceilingLocal: estimateTotalCeilingLocal,
  }).status

  // QUICK-mv1-01 — zero side effects on discard: rename + project_type + mismatch
  // logging moved from the pre-persist position (formerly here, before the AI
  // output was even validated) to AFTER persistence, and gated on the SAME
  // vagueness verdict the assess node independently re-derives from these exact
  // rows (total=safeGrandTotal, sections=calculatedSections — byte-identical
  // inputs to assessNode's DB re-read). A pass this gate marks vague is the exact
  // pass auto-refine / the default adapter's finalize will revert — so skipping
  // these writes here means a reverted pass never had them in the first place;
  // no restore-on-revert logic is needed in auto-refine.ts / revert.ts.
  const passIsVague = isVagueEstimate({
    total: safeGrandTotal,
    sections: calculatedSections,
  })

  // Consolidate the up-to-4 sequential project writes (status/total, re-select
  // name, name patch, project_type) into ONE combined UPDATE. status + total are
  // always written; name + project_type join the same statement conditionally.
  // detected_trade is captured here so the trade-mismatch activity log below can
  // reuse it without an extra derivation.
  const projectUpdate: Record<string, unknown> = {
    status: projectStatus,
    total: safeGrandTotal,
  }

  // detected_trade: the trade of the REQUESTED work, independent of
  // company.industry (soft prior — lib/ai/prompt-builder.ts). Persisted so
  // project_type reflects reality even when industry was configured for a
  // different trade.
  const detectedTrade = !passIsVague
    ? aiEstimate.detected_trade?.trim().toLowerCase() || null
    : null

  if (!passIsVague) {
    // Patch project name only if it's still the eager-create placeholder (D-05).
    // Reuse the already-loaded `project` row rather than re-selecting: nothing in
    // this function mutates projects.name between the top-of-function load and
    // here, so project.name is the authoritative current value.
    const suggestedName = aiEstimate.suggested_project_name?.trim()
    const currentName = project.name as string | null
    if (suggestedName && currentName && currentName.startsWith(PLACEHOLDER_PREFIX)) {
      projectUpdate.name = suggestedName
    }

    if (detectedTrade) {
      projectUpdate.project_type = detectedTrade
    }
  }

  await supabase.from('projects').update(projectUpdate).eq('id', projectId)

  // trade_mismatch_detected: raw material for the future industry auto-suggestion
  // UX (no UI in this task) — recorded only on a non-vague pass when both sides
  // are known and disagree (case-insensitive). Separate table, so it stays its
  // own write.
  if (!passIsVague && detectedTrade) {
    const configuredIndustry = company.industry?.trim().toLowerCase() || null
    if (configuredIndustry && detectedTrade !== configuredIndustry) {
      await supabase.from('estimate_activity').insert({
        project_id: projectId,
        company_id: companyId,
        estimate_id: estimateId,
        event_type: 'trade_mismatch_detected',
        metadata: { detected: detectedTrade, configured: configuredIndustry },
      })
    }
  }

  // AIREL-04: a distinct, additive activity event for the over-ceiling case — so a
  // future banner/notification can differentiate "review — total unusually high"
  // from the flaggedUnpriced awaiting_details reason (which writes no such row
  // today). estimate_activity.event_type is unconstrained TEXT (no migration —
  // same as trade_mismatch_detected above).
  if (overCeiling) {
    await supabase.from('estimate_activity').insert({
      project_id: projectId,
      company_id: companyId,
      estimate_id: estimateId,
      event_type: 'estimate_over_ceiling_flagged',
      metadata: { total: safeGrandTotal, ceiling: estimateTotalCeilingLocal },
    })
  }

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: companyId,
    estimate_id: estimateId,
    event_type: 'estimate_generated',
    metadata: { version: nextVersion },
  })

  // Revalidate paths so workspace and sidebar see fresh data
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/', 'layout')

  return {
    estimateId,
    version: nextVersion,
    clientSuggestion,
    language,
    structure: {
      score: structure.score,
      band: structure.band,
      hints: [...structure.findings].sort((a, b) => b.penalty - a.penalty).map((f) => f.hint),
    },
    openQuestions: [...(aiNotes.open_questions ?? [])]
      .sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact])
      .map((q) => q.question),
  }
}


/**
 * Phase 4g gate: returns the escalation (Opus) model for the draft call, or null
 * to keep today's model resolution. Never throws; null when disabled/unreadable.
 * Logs the decision (console.info + Langfuse generation metadata) whenever the
 * feature is enabled, whether or not it escalates.
 */
async function decideDraftModel(args: {
  plan: EstimateInput['plan']
  sourceChars: number
  targetBudget: number | null | undefined
  companyId: string
  projectId: string | null
}): Promise<string | null> {
  try {
    const cfg = await getEscalationConfig()
    if (!cfg) return null
    const decision = decideDraftEscalation(cfg, {
      plan: args.plan,
      sourceChars: args.sourceChars,
      targetBudget: args.targetBudget,
    })
    const meta = {
      escalated: decision.escalate,
      reason: decision.reason,
      model: decision.escalate ? cfg.model : null,
      hasPlan: Boolean(args.plan),
      planSections: args.plan?.sections.length ?? null,
      scopeConfidence: args.plan?.scope_confidence ?? null,
      sourceChars: args.sourceChars,
      companyId: args.companyId,
      projectId: args.projectId,
    }
    console.info('[draft_escalation]', meta)
    try {
      const { langfuseClient } = await import('@/lib/observability/langfuse')
      langfuseClient
        .generation({ name: 'draft_model_decision', model: meta.model ?? undefined, input: meta, metadata: meta })
        .end({ output: meta })
      await langfuseClient.flushAsync()
    } catch (err) {
      console.warn('[draft_escalation] langfuse trace failed:', err)
    }
    return decision.escalate ? cfg.model : null
  } catch (err) {
    console.warn('[draft_escalation] decision failed (using default model):', err)
    return null
  }
}
