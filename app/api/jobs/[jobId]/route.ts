import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Phase 67 / Phase 91: Server-side status proxy for Inngest jobs.
 *
 * The browser never sees INNGEST_SIGNING_KEY. Polled by the capture flow stepper
 * (and any future polling UI) at ~1.5s intervals.
 *
 * Implements: INNGEST-05, REC-01.
 *
 * REC-01 contract: this endpoint returns HTTP 200 with a discriminated `state`
 * for every KNOWN condition (processing | completed | failed | config_unavailable
 * | not_found). It NEVER returns an opaque 503/502/404 for a known job condition —
 * those would make the 1.5s polling loop throw, which was the original bug. The
 * only non-200 is the 401 auth gate (sign-in is not a job state).
 *
 * Auth note (MVP): requires sign-in. Per-job ownership check is NOT enforced
 * here — any signed-in user can poll any jobId. Tightening this is tracked as a
 * follow-up before production deploy (RESEARCH.md Architecture Pattern 4 callout).
 *
 * Security: the signing key is never leaked beyond the boolean-ish
 * `config_unavailable` state (Project Constraint: service-role key never beyond
 * a boolean).
 */
const INNGEST_CLOUD_API = 'https://api.inngest.com/v1'
const INNGEST_DEV_API = 'http://localhost:8288/v1'

/**
 * The graceful discriminated-state contract shared with the polling layer
 * (hooks/use-job-status.ts). Always delivered as HTTP 200 JSON.
 */
export type JobStatusContract =
  | { state: 'processing' }
  | { state: 'completed'; output: unknown | null }
  | { state: 'failed'; reason: string }
  | { state: 'config_unavailable' }
  | { state: 'not_found' }

function isDevMode() {
  const flag = process.env.INNGEST_DEV
  return flag === '1' || flag === 'true'
}

type InngestRun = {
  status?: string
  output?: unknown
  run_started_at?: string
  ended_at?: string
}

/**
 * Pick the most relevant run for the event. Per RESEARCH Pitfall 2, do NOT
 * blindly take data[0]: one event id can produce multiple runs (initial +
 * retries, plus separate onFailure handler runs). Prefer the most recent by an
 * available timestamp; fall back to the first entry.
 */
function pickRun(runs: InngestRun[]): InngestRun | undefined {
  if (runs.length === 0) return undefined
  const ts = (r: InngestRun) =>
    Date.parse(r.ended_at ?? r.run_started_at ?? '') || 0
  return [...runs].sort((a, b) => ts(b) - ts(a))[0] ?? runs[0]
}

/**
 * Derive a short, safe human summary for a failed run. Never leak a stack or
 * raw upstream body — only a plain trimmed string when the output is itself a
 * plain string, otherwise a generic literal.
 */
function safeFailureReason(output: unknown): string {
  if (typeof output === 'string' && output.trim().length > 0) {
    return output.trim().slice(0, 200)
  }
  return 'Estimate generation failed'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) {
    // Auth gate — NOT a job state, stays non-200.
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { jobId } = await params
  const devMode = isDevMode()
  const signingKey = process.env.INNGEST_SIGNING_KEY
  if (!devMode && !signingKey) {
    // Config-unavailable: signing key absent and not in dev mode. Actionable
    // state for the client (recording is saved; offer Edit manually). Do NOT
    // leak the key or any detail beyond this boolean-ish state.
    return NextResponse.json<JobStatusContract>({ state: 'config_unavailable' })
  }

  const baseUrl = devMode ? INNGEST_DEV_API : INNGEST_CLOUD_API
  const headers: Record<string, string> = {}
  if (signingKey) headers.Authorization = `Bearer ${signingKey}`

  let res: Response
  try {
    res = await fetch(`${baseUrl}/events/${jobId}/runs`, {
      headers,
      cache: 'no-store',
    })
  } catch {
    // Dev server unreachable / network failure — treat as config_unavailable,
    // not a job failure (RESEARCH Pattern 1: dev-server-down maps here).
    return NextResponse.json<JobStatusContract>({ state: 'config_unavailable' })
  }

  if (res.status === 404) {
    // Event id unknown to Inngest — folded into the contract (was a 404).
    return NextResponse.json<JobStatusContract>({ state: 'not_found' })
  }
  if (!res.ok) {
    // Inngest API errored (non-404) — folded into the contract (was a 502).
    return NextResponse.json<JobStatusContract>({
      state: 'failed',
      reason: 'Processing service error',
    })
  }

  const json = (await res.json()) as { data?: InngestRun[] }
  const run = pickRun(json.data ?? [])
  if (!run) {
    // Event accepted but no function run yet — still processing.
    return NextResponse.json<JobStatusContract>({ state: 'processing' })
  }

  if (run.status === 'Completed') {
    return NextResponse.json<JobStatusContract>({
      state: 'completed',
      output: run.output ?? null,
    })
  }
  if (run.status === 'Failed' || run.status === 'Cancelled') {
    return NextResponse.json<JobStatusContract>({
      state: 'failed',
      reason: safeFailureReason(run.output),
    })
  }

  // 'Running' or anything not-yet-terminal → still processing.
  return NextResponse.json<JobStatusContract>({ state: 'processing' })
}
