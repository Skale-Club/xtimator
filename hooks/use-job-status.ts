'use client'

/**
 * Phase 67 / Phase 91: useJobStatus — polls GET /api/jobs/[jobId] at 1.5s
 * intervals to drive long-running job UIs (e.g. capture stepper, voice
 * refinement). Stops on any terminal state.
 *
 * Implements: INNGEST-05 (frontend status delivery via polling), REC-05.
 *
 * REC-05: this layer interprets the discriminated-state contract delivered by
 * app/api/jobs/[jobId]/route.ts (JobStatusContract) and NEVER throws on a
 * non-200 / never converts a failure into a synthetic `Status <code>` error.
 * pollJob resolves a typed JobResult discriminant; useJobStatus exposes a
 * discriminated state object.
 *
 * Pre-launch audit fix (B8): a single transient network error (e.g. a ~1-2s
 * cell handoff on a job site) used to throw straight out of the poll loop —
 * `fetch()` rejects, nothing caught it, and the whole capture pipeline showed
 * a hard failure even though the job was still running server-side. Both
 * pollJob and useJobStatus now retry a failed poll attempt (network error OR
 * an unparseable response) with capped exponential backoff instead of
 * throwing immediately, and both give up after MAX_POLL_DURATION_MS total —
 * a stuck/never-starting job now surfaces a clear failed state instead of
 * polling forever.
 *
 * NOTE (Plan 91-02): pollJob's other production consumers (text-describe,
 * photos-input, use-ai-input-submit) and the capture-recorder path are rewired
 * to read this new discriminant in Plan 02 Tasks 3 + 4. Within this plan we only
 * deliver the new return type + the no-throw behavior; the aborted-signal throw
 * is preserved so callers' AbortError checks keep working.
 */
import { useEffect, useState } from 'react'

/**
 * Typed poll result mirroring the endpoint's JobStatusContract terminal states.
 * Exported so Plan 02 callers can import and narrow on the discriminant.
 */
export type JobResult =
  | { state: 'completed'; output: unknown | null }
  | { state: 'failed'; reason: string }
  | { state: 'config_unavailable' }
  | { state: 'not_found' }

/** The full set of states the hook can surface, including idle + processing. */
export type JobStatusState =
  | 'idle'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'config_unavailable'
  | 'not_found'

export type UseJobStatusState = {
  state: JobStatusState
  output: unknown | null
  reason: string | null
}

/** Wire shape parsed from the 200 JSON body (mirror of JobStatusContract). */
type ContractBody =
  | { state: 'processing' }
  | { state: 'completed'; output?: unknown | null }
  | { state: 'failed'; reason?: string }
  | { state: 'config_unavailable' }
  | { state: 'not_found' }

const POLL_MS = 1500
/** Give up after this long even if the job never leaves `processing` —
 * prevents an infinite spinner when a job silently never starts (e.g. an
 * Inngest sync outage). */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000
/** Inngest creates the run AFTER accepting the event — production evidence
 * (260707-kgn): event accepted, client polled at t+1s → not_found, run created
 * at t+3s, job then succeeded. Within this window a not_found body means
 * "not yet", not "gone" — keep polling. Past it, not_found is terminal. */
const NOT_FOUND_GRACE_MS = 20_000
/** Consecutive fetch/parse failures tolerated before giving up entirely. */
const MAX_CONSECUTIVE_POLL_ERRORS = 6
const NETWORK_RETRY_BASE_MS = 1000
const NETWORK_RETRY_MAX_MS = 10_000

const TIMEOUT_RESULT: Extract<JobResult, { state: 'failed' }> = {
  state: 'failed',
  reason: 'This is taking longer than expected. It may still finish — check back on the project page shortly.',
}
const NETWORK_ERROR_RESULT: Extract<JobResult, { state: 'failed' }> = {
  state: 'failed',
  reason: 'Network error while checking status. Please check your connection and try again.',
}

function toJobResult(body: ContractBody): JobResult {
  switch (body.state) {
    case 'completed':
      return { state: 'completed', output: body.output ?? null }
    case 'failed':
      return { state: 'failed', reason: body.reason ?? 'Estimate generation failed' }
    case 'config_unavailable':
      return { state: 'config_unavailable' }
    case 'not_found':
      return { state: 'not_found' }
    default:
      // Unreachable for terminal states; defensive fallback.
      return { state: 'failed', reason: 'Estimate generation failed' }
  }
}

/**
 * Standalone helper — usable from non-React callers (e.g. inside an effect that
 * already drives its own state). Resolves a typed JobResult for every terminal
 * state and NEVER throws on a non-200. While the contract reports `processing`
 * it keeps polling. Only throws on a genuinely-aborted signal (preserved so
 * callers' AbortError checks still work).
 *
 * A transient fetch/parse failure (flaky mobile network) is retried with
 * capped exponential backoff — up to MAX_CONSECUTIVE_POLL_ERRORS in a row —
 * before resolving a failed JobResult; it is NEVER thrown straight out of
 * this loop. The whole poll also gives up after MAX_POLL_DURATION_MS.
 */
export async function pollJob(jobId: string, signal: AbortSignal): Promise<JobResult> {
  const startedAt = Date.now()
  let consecutiveErrors = 0

  while (!signal.aborted) {
    if (Date.now() - startedAt > MAX_POLL_DURATION_MS) return TIMEOUT_RESULT

    let body: ContractBody
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { signal })
      body = (await res.json()) as ContractBody
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new Error('Aborted')
      consecutiveErrors += 1
      if (consecutiveErrors > MAX_CONSECUTIVE_POLL_ERRORS) return NETWORK_ERROR_RESULT
      const backoff = Math.min(NETWORK_RETRY_BASE_MS * 2 ** (consecutiveErrors - 1), NETWORK_RETRY_MAX_MS)
      await new Promise((resolve) => setTimeout(resolve, backoff))
      continue
    }

    consecutiveErrors = 0
    if (body.state === 'processing') {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      continue
    }
    if (body.state === 'not_found' && Date.now() - startedAt < NOT_FOUND_GRACE_MS) {
      // Inngest hasn't created the run yet — not gone, just not yet visible.
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      continue
    }
    return toJobResult(body)
  }
  throw new Error('Aborted')
}

/**
 * React hook variant — exposes live discriminated state for components that
 * want to render mid-flight progress and terminal outcomes.
 */
export function useJobStatus(jobId: string | null): UseJobStatusState {
  const [state, setState] = useState<UseJobStatusState>({
    state: 'idle',
    output: null,
    reason: null,
  })

  useEffect(() => {
    if (!jobId) {
      setState({ state: 'idle', output: null, reason: null })
      return
    }

    const controller = new AbortController()
    let cancelled = false
    const startedAt = Date.now()
    let consecutiveErrors = 0

    const loop = async () => {
      while (!controller.signal.aborted) {
        if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
          if (!cancelled) {
            setState({ state: 'failed', output: null, reason: TIMEOUT_RESULT.reason })
          }
          return
        }
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { signal: controller.signal })
          const body = (await res.json()) as ContractBody
          if (cancelled) return
          consecutiveErrors = 0

          if (body.state === 'processing') {
            setState({ state: 'processing', output: null, reason: null })
            await new Promise((r) => setTimeout(r, POLL_MS))
            continue
          }
          if (body.state === 'not_found' && Date.now() - startedAt < NOT_FOUND_GRACE_MS) {
            // Inngest hasn't created the run yet — not gone, just not yet visible.
            setState({ state: 'processing', output: null, reason: null })
            await new Promise((r) => setTimeout(r, POLL_MS))
            continue
          }

          const result = toJobResult(body)
          if (result.state === 'completed') {
            setState({ state: 'completed', output: result.output, reason: null })
          } else if (result.state === 'failed') {
            setState({ state: 'failed', output: null, reason: result.reason })
          } else {
            // config_unavailable | not_found
            setState({ state: result.state, output: null, reason: null })
          }
          return // terminal state — stop the loop
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
          // Pre-launch audit fix (B8): a transient network error (flaky mobile
          // connection) used to surface as an immediate failed state. Retry
          // with capped backoff instead — only give up after
          // MAX_CONSECUTIVE_POLL_ERRORS in a row.
          consecutiveErrors += 1
          if (consecutiveErrors <= MAX_CONSECUTIVE_POLL_ERRORS) {
            const backoff = Math.min(
              NETWORK_RETRY_BASE_MS * 2 ** (consecutiveErrors - 1),
              NETWORK_RETRY_MAX_MS
            )
            await new Promise((r) => setTimeout(r, backoff))
            continue
          }
          if (!cancelled) {
            setState({ state: 'failed', output: null, reason: NETWORK_ERROR_RESULT.reason })
          }
          return
        }
      }
    }

    void loop()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [jobId])

  return state
}
