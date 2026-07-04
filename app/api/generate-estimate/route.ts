import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'
import { rateLimit } from '@/lib/ratelimit'
import { XtimatorError, asResponse } from '@/lib/errors'
import { checkQuota } from '@/lib/quota'
import { checkCredits } from '@/lib/billing/credit-ledger'
import { buildOverageAffordance } from '@/lib/billing/overage-affordance'
import { isSupportedLanguage } from '@/lib/i18n/resolve-estimate-language'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Phase 91 (REC-03/REC-04): pure, exported helper deriving the Inngest event id
 * from the projectId + requestId. Stable for a given (projectId, requestId), so
 * a Retry that reuses the original requestId yields the SAME event id → Inngest
 * dedups the re-dispatch and an already-completed generate step is NOT re-charged.
 */
export function buildGenerateEventId(projectId: string, requestId: string) {
  return `estimate-${projectId}-${requestId}`
}

/**
 * Phase 67: route refactor. Returns { jobId } in <1s.
 *
 * The actual AI work (generateEstimateForProject + recordUsage) now runs
 * inside lib/inngest/functions/generate-estimate.ts:generateEstimateJob.
 * This route only performs synchronous pre-flight (auth + rate limit + quota)
 * and dispatches the event.
 *
 * Implements: INNGEST-02. Phase 91 (REC-03/REC-04): honors a client-supplied
 * requestId/attemptId so a user Retry reuses the original idempotency key.
 */
export async function POST(request: Request) {
  try {
    // Auth (synchronous, fast)
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      throw new XtimatorError('unauthorized', 'auth', 'Not authenticated')
    }

    // Read-only demo: never dispatch a (paid) AI generation job.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    // Rate limits (synchronous, Upstash Redis — typically <100ms)
    const userId = claims.sub
    const hourly = await rateLimit('userEstimatePerHour', userId)
    if (!hourly.allowed) {
      throw new XtimatorError(
        'rate_limit',
        'estimates',
        'Hourly estimate limit exceeded',
        undefined,
        { retryAfter: hourly.retryAfter, used: hourly.count, max: hourly.max }
      )
    }
    const daily = await rateLimit('userEstimatePerDay', userId)
    if (!daily.allowed) {
      throw new XtimatorError(
        'rate_limit',
        'estimates',
        'Daily estimate limit exceeded',
        undefined,
        { retryAfter: daily.retryAfter, used: daily.count, max: daily.max }
      )
    }

    // Company lookup — use active-company cookie so staff members resolve correctly
    const companyId = await getActiveCompanyId()
    if (!companyId) {
      throw new XtimatorError('not_found', 'company', 'No company found')
    }

    // GUARD-DEMO: demo estimate quota — blocks free demo companies after 3 estimates.
    // Paid tiers (pro/business) bypass this check entirely.
    const svc = requireServiceClient()
    const { data: companyRow } = await svc
      .from('companies')
      .select('demo_estimate_quota, tier')
      .eq('id', companyId)
      .single()

    if (
      companyRow &&
      companyRow.demo_estimate_quota !== null &&
      companyRow.tier !== 'pro' &&
      companyRow.tier !== 'business'
    ) {
      const { count } = await svc
        .from('estimates')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)

      if ((count ?? 0) >= companyRow.demo_estimate_quota) {
        return NextResponse.json(
          { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' },
          { status: 402 }
        )
      }
    }

    // Billing v2 — THE credit gate (the free-tier wall). Credits are the
    // customer-facing meter: a spent balance blocks generation with an upgrade
    // affordance. estimatedCredits: 1 = "block an empty balance" (per-op cost
    // estimation is a calibration refinement, not needed for the wall). BYOK
    // companies bypass inside checkCredits; enforcementEnabled=false (admin
    // panel) reverts this to record-only.
    const credit = await checkCredits(svc, companyId, 1)
    if (!credit.allowed) {
      const affordance = buildOverageAffordance(credit)
      return NextResponse.json(
        {
          error: 'plan_limit_reached',
          reason: 'credits',
          upgradeUrl: '/settings/billing',
          ...(affordance ? { topUpUrl: affordance.topUpUrl } : {}),
        },
        { status: 402 }
      )
    }

    // QUOTA-03: count-based ceilings (anti-abuse on paid tiers; free is
    // credit-gated above with null count limits). recordUsage lives inside the
    // Inngest function.
    const { allowed } = await checkQuota(supabase, companyId, 'estimate')
    if (!allowed) {
      const affordance = buildOverageAffordance(credit)
      return NextResponse.json(
        {
          error: 'plan_limit_reached',
          upgradeUrl: '/settings/billing',
          ...(affordance ? { topUpUrl: affordance.topUpUrl } : {}),
        },
        { status: 402 }
      )
    }

    // Body
    const body = await request.json().catch(() => null)
    if (!body?.projectId) {
      throw new XtimatorError(
        'bad_request',
        'estimates',
        'projectId is required'
      )
    }
    const projectId = body.projectId as string
    // Optional language override from the UI language selector (EN-first cascade
    // runs inside generateEstimateForProject when undefined).
    const language = isSupportedLanguage(body.language) ? body.language : undefined

    // REC-04: honor a client-supplied requestId so a user Retry reuses the
    // original idempotency key (stable event id → no re-charge of an
    // already-completed step). Mint only when the caller did not supply one.
    const requestId =
      typeof body?.requestId === 'string' && body.requestId.length > 0
        ? body.requestId
        : crypto.randomUUID()
    // REC-03 / Phase 92 (EVENT-03 / D-08): attempt lineage. Honor a client-minted
    // attemptId; fall back to a server uuid so an event is never dropped for a
    // legacy caller (e.g. MCP write.ts).
    const attemptId =
      typeof body?.attemptId === 'string' && body.attemptId.length > 0
        ? body.attemptId
        : crypto.randomUUID()
    // Phase 92 (EVENT-03 / D-07, RESEARCH Open Question 1): each client sends its
    // own inputType; the route forwards it. Default to manual_text (the text/MCP
    // path) when absent rather than doing brittle server-side inference.
    const inputType =
      body?.inputType === 'recording' ||
      body?.inputType === 'photo' ||
      body?.inputType === 'manual_text'
        ? body.inputType
        : 'manual_text'

    // Dispatch to Inngest. Event-level idempotency via `id` field — same
    // request never executes twice in 24h.
    const payload: EstimateGeneratePayload = {
      companyId,
      projectId,
      requestId,
      language,
      attemptId,
      inputType,
      createdByUserId: userId,
    }
    const { ids } = await inngest.send({
      name: EVENT_ESTIMATE_GENERATE,
      id: buildGenerateEventId(projectId, requestId),
      data: payload,
    })

    return NextResponse.json({ jobId: ids[0] }, { status: 202 })
  } catch (error) {
    return asResponse(error)
  }
}
