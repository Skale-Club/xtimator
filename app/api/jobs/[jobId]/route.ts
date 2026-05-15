import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Phase 67: Server-side status proxy for Inngest jobs.
 *
 * The browser never sees INNGEST_SIGNING_KEY. Polled by the capture flow stepper
 * (and any future polling UI) at ~1.5s intervals.
 *
 * Implements: INNGEST-05.
 *
 * Auth note (MVP): requires sign-in. Per-job ownership check is NOT enforced
 * here — any signed-in user can poll any jobId. Tightening this is tracked as a
 * follow-up before production deploy (RESEARCH.md Architecture Pattern 4 callout).
 */
const INNGEST_API = 'https://api.inngest.com/v1'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { jobId } = await params
  const signingKey = process.env.INNGEST_SIGNING_KEY
  if (!signingKey) {
    return NextResponse.json(
      { error: 'Inngest not configured' },
      { status: 503 }
    )
  }

  const res = await fetch(`${INNGEST_API}/events/${jobId}/runs`, {
    headers: { Authorization: `Bearer ${signingKey}` },
    cache: 'no-store',
  })

  if (res.status === 404) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'Status check failed' }, { status: 502 })
  }

  const json = (await res.json()) as {
    data?: Array<{ status?: string; output?: unknown }>
  }
  const run = json.data?.[0]
  if (!run) {
    // Event accepted but function run hasn't started yet — treat as Running.
    return NextResponse.json({ status: 'Running', output: null })
  }

  return NextResponse.json({
    status: run.status ?? 'Running',
    output: run.output ?? null,
  })
}
