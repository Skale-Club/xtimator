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
 * callers' AbortError checks still work) or a truly-unparseable response.
 */
export async function pollJob(jobId: string, signal: AbortSignal): Promise<JobResult> {
  while (!signal.aborted) {
    const res = await fetch(`/api/jobs/${jobId}`, { signal })
    const body = (await res.json()) as ContractBody
    if (body.state === 'processing') {
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

    const loop = async () => {
      while (!controller.signal.aborted) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { signal: controller.signal })
          const body = (await res.json()) as ContractBody
          if (cancelled) return

          if (body.state === 'processing') {
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
          // Truly-unexpected (e.g. unparseable response). Surface as a failed
          // state with a safe reason — NOT a synthetic `Status <code>` error.
          if (!cancelled) {
            setState({ state: 'failed', output: null, reason: 'Estimate generation failed' })
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
