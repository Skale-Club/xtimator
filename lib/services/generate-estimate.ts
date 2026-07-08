import { revalidatePath } from 'next/cache'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import { type EstimateInput } from '@/lib/ai'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'
import { anchorAndClampSections } from '@/lib/ai/price-anchoring'
import { researchUnmatchedPrices } from '@/lib/estimate/price-research/orchestrator'
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
import { getPriceBookItems } from '@/lib/queries/price-book'
import {
  resolveEstimateLanguage,
  type EstimateLanguage,
} from '@/lib/i18n/resolve-estimate-language'
import { normalizeCurrencyCode } from '@/lib/money/currency'
import { getWhatsAppSystemPrompt } from '@/lib/platform-config'
import { copyEstimatePhotos } from '@/lib/queries/estimate-photo'
import { generatePublicSlugToken } from '@/lib/estimate/public-url'

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
  }
}

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
        'industry, currency_code, default_tax_rate, default_payment_terms, default_warranty_terms, name, default_estimate_language, tax_config'
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

  const currencyCode = normalizeCurrencyCode(company.currency_code)
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

  const photoDescriptions = photos
    .filter((p) => p.ai_description && p.ai_description.trim().length > 0)
    .map((p, i) => `Photo ${i + 1}: ${p.ai_description}`)

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
    defaultPaymentTerms: company.default_payment_terms ?? null,
    defaultWarrantyTerms: company.default_warranty_terms ?? null,
    language,
    // Phase 110 (COST-01): non-LLM correlation context for cost capture. Comes
    // from the TRUSTED params (companyId is a function param, never LLM-derived).
    costContext: options.costContext,
  }

  // WhatsApp-only: append the platform admin's system-prompt addendum.
  // Not fetched for web/MCP so those channels are unaffected.
  if (options.channel === 'whatsapp') {
    const extra = await getWhatsAppSystemPrompt()
    if (extra) estimateInput.extraInstructions = extra
  }

  const provider = await getAIProviderWithFallback(companyId)
  const aiEstimate = await provider.generateEstimate(estimateInput)

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

  // GUARD-03 snapshot: capture the naive subtotal the AI's OWN numbers imply
  // BEFORE anchoring/clamping mutates any unit_price. Used for the discrepancy
  // metric below; the AI total itself is never persisted as authoritative.
  const aiProposedSubtotal = round2(
    aiEstimate.sections.reduce(
      (sum, section) =>
        sum +
        section.items.reduce(
          (s, item) => s + item.quantity * item.unit_price,
          0
        ),
      0
    )
  )

  // GUARD-02: anchor matched items to the (companyId-scoped, currency-filtered)
  // price book and clamp out-of-bounds ai_estimate prices. Pass ONLY mapped
  // { name, unit_price } so the pure helper stays tenant-safe. Non-fatal.
  const { sections: guardedSections, anchoredCount, clampedCount } =
    anchorAndClampSections(
      aiEstimate.sections,
      priceBookItems.map((p) => ({ name: p.name, unit_price: p.unit_price }))
    )

  // RPRICE-01/03 + RFALL-01 (THE PAYOFF): research the items anchoring left as
  // 'ai_estimate' (price_book + owner-edited items are NEVER touched). The
  // orchestrator is channel-neutral and NEVER-THROWS — a research failure must never
  // break generation (mirrors the anchoring non-fatal contract). This runs BEFORE the
  // server totals + persistence so researched regional prices flow into the
  // authoritative totals and the vagueness gate (assess) sees real numbers — the
  // originating "Couch cleaning 8seats → $0 → blocked as vague" fix. Region = the
  // project client's city+state; currency = the estimate currency; companyId is the
  // param (NEVER LLM-derived). projectId seeds the metering idempotency key (Warning #1:
  // the orchestrator builds ${attemptId ?? projectId ?? companyId}:... — no real
  // attemptId is reachable at this call site, so the project-scoped seed is the best
  // available per-generation token; it is retry-stable and finer than company-scoped).
  // Defensive try/catch in addition to the never-throws contract: a thrown research
  // error degrades to the anchored (pre-research) sections, never an estimate failure.
  let researchedSections = guardedSections
  let flaggedUnpriced = 0
  // WI-1 (HARDEN-OBS-01): attempted-vs-usable research telemetry for the quality signal.
  // Undefined until the research call sets it; on a research failure it stays undefined and
  // buildEstimateQualitySignal treats absent research as "no data ⇒ no alarm" (graceful fallback).
  let researchTelemetry:
    | { candidates: number; cacheHits: number; providerUsable: number; missed: number }
    | undefined
  try {
    const research = await researchUnmatchedPrices(guardedSections, {
      companyId, // param — NEVER LLM-derived
      region: { city: client?.city ?? null, state: client?.state ?? null },
      currency: currencyCode,
      supabase, // reuse the service client
      projectId, // best available per-generation metering seed (Warning #1)
    })
    researchedSections = research.sections
    flaggedUnpriced = research.flaggedUnpriced
    researchTelemetry = research.telemetry
  } catch (err) {
    // Non-fatal: keep the anchored sections; generation must still complete.
    console.warn('[generate-estimate] price research failed (non-fatal)', err)
  }

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
    deposit,
    balanceDue,
  } = computeEstimateTotals(researchedSections, { taxRate, taxConfig })

  // GUARD-03: the server recalculation above is the SINGLE authoritative source.
  // Defensively coerce each persisted total to a finite, >= 0 value (no-op on the
  // happy path — valid totals must not shift). Never throws.
  const safeSubtotal = assertFinitePositive(subtotal)
  const safeTaxAmount = assertFinitePositive(taxAmount)
  const safeGrandTotal = assertFinitePositive(grandTotal)
  const safeDiscountAmount = assertFinitePositive(discountAmount)
  // DEP-01: same finite, >= 0 persistence guard. assertFinitePositive floors negatives to 0 — a deposit
  // exceeding the total persists balance_due 0 (never a negative). At generation deposit is 0 here, so
  // balanceDue === grandTotal (byte-identical). deposit is the destructured GUARD-03 value; void it to
  // keep the LOCKED return contract explicit while deposit_value persists null at generation (no input).
  void deposit
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
    const aiProposedGrand = round2(aiProposedSubtotal * (1 + taxRate))
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

  // Version management
  await supabase
    .from('estimates')
    .update({ is_current: false })
    .eq('project_id', projectId)

  const { data: existingEstimates } = await supabase
    .from('estimates')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = (existingEstimates?.[0]?.version ?? 0) + 1

  // Persist estimate
  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .insert({
      project_id: projectId,
      company_id: companyId,
      currency_code: currencyCode,
      version: nextVersion,
      is_current: true,
      status: 'draft',
      workflow_status: 'draft',
      summary: aiEstimate.summary,
      notes: aiEstimate.notes ?? null,
      timeline: aiEstimate.timeline ?? null,
      payment_terms:
        aiEstimate.payment_terms ?? company.default_payment_terms ?? null,
      warranty_terms:
        aiEstimate.warranty_terms ?? company.default_warranty_terms ?? null,
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
    })
    .select('id')
    .single()

  if (estimateError || !estimate) {
    throw new Error('Failed to save estimate')
  }

  const estimateId = estimate.id as string

  // WI-1 (HARDEN-OBS-01): emit the quality signal now that estimate_id is known. This
  // ALWAYS fires the byte-identical console.info('[totals_discrepancy]', discrepancy) line
  // (tests/eval + ops depend on it) and, on an anomaly (>threshold discrepancy OR low
  // research hit-rate), raises a Sentry warning tagged with company_id/estimate_id.
  // reportEstimateQuality NEVER throws, so observability can never break generation.
  if (qualitySignal && qualityDiscrepancy) {
    reportEstimateQuality(qualityDiscrepancy, qualitySignal, {
      companyId,
      estimateId,
    })
  }

  // Insert sections and items
  for (let sIdx = 0; sIdx < calculatedSections.length; sIdx++) {
    const section = calculatedSections[sIdx]

    const { data: sectionRow, error: sectionError } = await supabase
      .from('estimate_sections')
      .insert({
        estimate_id: estimateId,
        company_id: companyId,
        title: section.title,
        sort_order: sIdx,
        subtotal: section.subtotal,
      })
      .select('id')
      .single()

    if (sectionError || !sectionRow) {
      throw new Error('Failed to save estimate section')
    }

    const sectionId = sectionRow.id as string

    if (section.items.length > 0) {
      const itemRows = section.items.map((item, iIdx) => ({
        section_id: sectionId,
        company_id: companyId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? null,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: iIdx,
        price_source: item.price_source,
        // TAX-03: persist the AI's per-item classification into the dormant Phase 129 columns.
        // These survive AI → anchoring → research → compute via the `...item` spreads. Defaults
        // (taxable=true, tax_category=null) keep retrocompat rows byte-identical.
        taxable: item.taxable ?? true,
        tax_category: item.tax_category ?? null,
        // DISC-01: persist the per-item line discount (AI INPUT, amount) — survives AI → anchoring →
        // research → compute via the ...item spreads. Default 0 keeps retrocompat rows byte-identical.
        discount: (item.discount as number | undefined) ?? 0,
        // MARK-01: persist the AI's cost + markup_pct (inputs) so the price book / editor can show how
        // the unit_price was derived. Survive AI → anchoring → research → compute via the ...item spreads.
        // null when absent (byte-identical retrocompat — the Phase-129 columns are nullable). The
        // persisted unit_price above already carries the server-resolved price from compute-totals (Task 2).
        cost: (item.cost as number | undefined) ?? null,
        markup_pct: (item.markup_pct as number | undefined) ?? null,
      }))

      const { error: itemsError } = await supabase
        .from('estimate_items')
        .insert(itemRows)

      if (itemsError) {
        throw new Error('Failed to save estimate items')
      }
    }
  }

  // Version carry-forward — copy the previous current version's attached
  // photos onto the new version (independent rows, own remove lifecycle).
  if (previousCurrent?.id) {
    await copyEstimatePhotos(supabase, previousCurrent.id, estimateId, companyId)
  }

  // Update project status. RFALL-01: when research flagged an unpriced item AND the
  // estimate still carries real value (total>0), surface it via the EXISTING
  // awaiting_details recourse path (the needs-details banner renders on this status)
  // — a partially-priced estimate is NOT blocked (the 108-02 vagueness gate permits a
  // total>0 estimate), the owner is just prompted to fill the flagged line. When
  // nothing is flagged (or total===0), status stays 'estimate_ready' — byte-identical
  // to before. projects.status is unconstrained TEXT (no migration).
  const projectStatus =
    flaggedUnpriced > 0 && safeGrandTotal > 0 ? 'awaiting_details' : 'estimate_ready'
  await supabase
    .from('projects')
    .update({ status: projectStatus, total: safeGrandTotal })
    .eq('id', projectId)

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

  if (!passIsVague) {
    // Patch project name only if it's still the eager-create placeholder (D-05).
    if (aiEstimate.suggested_project_name?.trim()) {
      const { data: currentProject } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single()
      if (
        currentProject?.name &&
        currentProject.name.startsWith(PLACEHOLDER_PREFIX)
      ) {
        await supabase
          .from('projects')
          .update({ name: aiEstimate.suggested_project_name.trim() })
          .eq('id', projectId)
      }
    }

    // detected_trade: the trade of the REQUESTED work, independent of
    // company.industry (soft prior — lib/ai/prompt-builder.ts). Persisted so
    // project_type reflects reality even when industry was configured for a
    // different trade.
    const detectedTrade =
      aiEstimate.detected_trade?.trim().toLowerCase() || null
    if (detectedTrade) {
      await supabase
        .from('projects')
        .update({ project_type: detectedTrade })
        .eq('id', projectId)
    }

    // trade_mismatch_detected: raw material for the future industry
    // auto-suggestion UX (no UI in this task) — recorded only when both sides
    // are known and disagree (case-insensitive).
    const configuredIndustry = company.industry?.trim().toLowerCase() || null
    if (
      detectedTrade &&
      configuredIndustry &&
      detectedTrade !== configuredIndustry
    ) {
      await supabase.from('estimate_activity').insert({
        project_id: projectId,
        company_id: companyId,
        estimate_id: estimateId,
        event_type: 'trade_mismatch_detected',
        metadata: { detected: detectedTrade, configured: configuredIndustry },
      })
    }
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

  return { estimateId, version: nextVersion, clientSuggestion, language }
}
