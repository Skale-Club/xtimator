import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { rateLimit } from '@/lib/ratelimit'
import { XtimatorError, asResponse } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      throw new XtimatorError('unauthorized', 'auth', 'Not authenticated')
    }

    // Rate limit (per user, hour + day)
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

    const { data: companyRow } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!companyRow) {
      throw new XtimatorError('not_found', 'company', 'No company found')
    }
    const companyId = companyRow.id as string

    // Parse body
    const body = await request.json().catch(() => null)
    if (!body?.projectId) {
      throw new XtimatorError('bad_request', 'estimates', 'projectId is required')
    }
    const projectId = body.projectId as string

    const result = await generateEstimateForProject(companyId, projectId)
    return NextResponse.json(result)
  } catch (error) {
    // Pre-existing string-based error classification preserved for backwards compat
    // with callers checking for these specific messages.
    if (error instanceof Error && !(error instanceof XtimatorError)) {
      const knownClientErrors = [
        'Project not found',
        'Company not found',
        'At least one audio transcript or photo is required',
      ]
      if (knownClientErrors.includes(error.message)) {
        console.error('Estimate generation failed:', error)
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }
    return asResponse(error)
  }
}
