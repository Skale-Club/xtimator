import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import {
  EVENT_ANALYZE_PHOTOS,
  type AnalyzePhotosPayload,
} from '@/lib/inngest/events'
import { rateLimit } from '@/lib/ratelimit'
import { checkQuota } from '@/lib/quota'
import { checkCredits } from '@/lib/billing/credit-ledger'
import { demoGuardResponse } from '@/lib/demo/guard'
import { recordJobOwnership } from '@/lib/inngest/job-ownership'
import { getActiveCompanyId } from '@/lib/queries/active-company'

/**
 * Phase 67: route refactor. Returns { jobId } in <1s.
 *
 * Claude Vision work + recordUsage now run inside
 * lib/inngest/functions/analyze-photos.ts:analyzePhotosJob.
 * This route only performs synchronous pre-flight (auth + rate limit + quota +
 * cheap "any photos exist?" check) and dispatches the event.
 *
 * Implements: INNGEST-04.
 */
export async function POST(request: Request) {
  try {
    const requestId = crypto.randomUUID()

    // Body
    const body = await request.json().catch(() => null)
    if (!body?.projectId || typeof body.projectId !== 'string') {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }
    const { projectId } = body as { projectId: string }
    // Phase 92 (EVENT-03 / D-08): read the client-minted attemptId for lineage;
    // fall back to a server-minted uuid so a legacy caller never drops an event.
    const attemptId =
      typeof body?.attemptId === 'string' && body.attemptId.length > 0
        ? body.attemptId
        : crypto.randomUUID()

    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Read-only demo: never dispatch a (paid) photo-analysis job.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    // Rate limit (Vision is expensive)
    const rl = await rateLimit('photoAnalysisPerMinute', claims.sub)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many photo analysis requests', code: 'rate_limit:photos' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
        }
      )
    }

    // Company lookup (pre-launch audit fix M-3): getActiveCompanyId() resolves
    // via company_members, so this works for STAFF members too — the previous
    // companies.user_id = claims.sub lookup only ever matched the account
    // owner, breaking the capture flow for team members.
    const companyId = await getActiveCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 401 })
    }

    // QUOTA-04: gate dispatch — recordUsage now lives inside the Inngest function
    const { allowed } = await checkQuota(supabase, companyId, 'photo_batch')
    if (!allowed) {
      return NextResponse.json(
        { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' },
        { status: 402 }
      )
    }

    // Billing v2 credit gate — "everything on our AI spends credits": a spent
    // balance blocks photo analysis too. BYOK bypass lives inside checkCredits.
    const credit = await checkCredits(supabase, companyId, 1)
    if (!credit.allowed) {
      return NextResponse.json(
        { error: 'plan_limit_reached', reason: 'credits', upgradeUrl: '/settings/billing' },
        { status: 402 }
      )
    }

    // Confirm at least one photo exists (cheap pre-flight — avoids dispatching
    // a job that will immediately no-op)
    const { count } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
    if (!count || count === 0) {
      return NextResponse.json(
        { error: 'No photos found for this project' },
        { status: 400 }
      )
    }

    // Dispatch
    // Phase 92 (EVENT-03 / D-07): the analyze-photos path is always photo.
    const payload: AnalyzePhotosPayload = {
      companyId,
      projectId,
      requestId,
      attemptId,
      inputType: 'photo',
    }
    const { ids } = await inngest.send({
      name: EVENT_ANALYZE_PHOTOS,
      id: `photos-${projectId}-${requestId}`,
      data: payload,
    })
    // Awaited — see app/api/transcribe/route.ts for why this must not race
    // the client's first poll.
    if (ids[0]) await recordJobOwnership(ids[0], companyId)

    return NextResponse.json({ jobId: ids[0] }, { status: 202 })
  } catch (error) {
    console.error('analyze-photos dispatch error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
