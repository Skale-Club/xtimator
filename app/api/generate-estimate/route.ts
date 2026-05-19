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
import { isSupportedLanguage } from '@/lib/i18n/resolve-estimate-language'

/**
 * Phase 67: route refactor. Returns { jobId } in <1s.
 *
 * The actual AI work (generateEstimateForProject + recordUsage) now runs
 * inside lib/inngest/functions/generate-estimate.ts:generateEstimateJob.
 * This route only performs synchronous pre-flight (auth + rate limit + quota)
 * and dispatches the event.
 *
 * Implements: INNGEST-02.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  try {
    // Auth (synchronous, fast)
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      throw new XtimatorError('unauthorized', 'auth', 'Not authenticated')
    }

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

    // Company lookup
    const { data: companyRow } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', userId)
      .single()
    if (!companyRow) {
      throw new XtimatorError('not_found', 'company', 'No company found')
    }
    const companyId = (companyRow as { id: string }).id

    // QUOTA-03: gate dispatch — recordUsage now lives inside the Inngest function
    const { allowed } = await checkQuota(supabase, companyId, 'estimate')
    if (!allowed) {
      return NextResponse.json(
        { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' },
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

    // Dispatch to Inngest. Event-level idempotency via `id` field — same
    // request never executes twice in 24h.
    const payload: EstimateGeneratePayload = { companyId, projectId, requestId, language }
    const { ids } = await inngest.send({
      name: EVENT_ESTIMATE_GENERATE,
      id: `estimate-${projectId}-${requestId}`,
      data: payload,
    })

    return NextResponse.json({ jobId: ids[0] }, { status: 202 })
  } catch (error) {
    return asResponse(error)
  }
}
