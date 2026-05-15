'use client'

/**
 * Phase 67: useJobStatus — polls GET /api/jobs/[jobId] at 1.5s intervals
 * to drive long-running job UIs (e.g. capture stepper, voice refinement).
 * Stops on terminal status (Completed | Failed | Cancelled).
 *
 * Implements: INNGEST-05 (frontend status delivery via polling).
 */
import { useEffect, useState } from 'react'

export type JobStatus = 'Running' | 'Completed' | 'Failed' | 'Cancelled'

export type JobStatusResponse = {
  status: JobStatus
  output: unknown | null
}

export type UseJobStatusState = {
  status: JobStatus | null // null = not yet polled / idle
  output: unknown | null
  error: string | null
}

const POLL_MS = 1500
const TERMINAL: ReadonlyArray<JobStatus> = ['Completed', 'Failed', 'Cancelled']

/**
 * Standalone helper — usable from non-React callers (e.g. inside an effect
 * that already drives its own state). Resolves with the terminal output for
 * Completed; throws for Failed / Cancelled / Aborted.
 */
export async function pollJob(jobId: string, signal: AbortSignal): Promise<unknown> {
  while (!signal.aborted) {
    const res = await fetch(`/api/jobs/${jobId}`, { signal })
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status}`)
    }
    const json = (await res.json()) as JobStatusResponse
    if (json.status === 'Completed') return json.output
    if (json.status === 'Failed' || json.status === 'Cancelled') {
      throw new Error(`Job ${json.status}`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
  throw new Error('Aborted')
}

/**
 * React hook variant — exposes live status state for components that
 * want to render mid-flight progress indicators.
 */
export function useJobStatus(jobId: string | null): UseJobStatusState {
  const [state, setState] = useState<UseJobStatusState>({
    status: null,
    output: null,
    error: null,
  })

  useEffect(() => {
    if (!jobId) {
      setState({ status: null, output: null, error: null })
      return
    }

    const controller = new AbortController()
    let cancelled = false

    const loop = async () => {
      while (!controller.signal.aborted) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { signal: controller.signal })
          if (!res.ok) {
            if (!cancelled) {
              setState({ status: 'Failed', output: null, error: `Status ${res.status}` })
            }
            return
          }
          const json = (await res.json()) as JobStatusResponse
          if (cancelled) return
          setState({ status: json.status, output: json.output, error: null })
          if (TERMINAL.includes(json.status)) return
          await new Promise((r) => setTimeout(r, POLL_MS))
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
          if (!cancelled) {
            setState({ status: 'Failed', output: null, error: (err as Error).message })
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
