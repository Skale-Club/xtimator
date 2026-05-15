import { describe, it, expect } from 'vitest'

/**
 * INNGEST-05: useJobStatus polling hook (Wave 0 RED stub).
 *
 * Plan 67-05 delivers lib/hooks/use-job-status.ts. Contract:
 *   - polls /api/jobs/[jobId] every 1500ms
 *   - stops polling when status is 'Completed' | 'Failed' | 'Cancelled'
 *   - exposes { status, output, error } state for consumers
 *
 * Used by CaptureRecorder and (eventually) any other long-running job UI.
 */
describe('INNGEST-05: useJobStatus hook', () => {
  it('polls /api/jobs/[jobId] every 1500ms', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-05) delivers lib/hooks/use-job-status.ts')
  })

  it('stops polling when status is "Completed" | "Failed" | "Cancelled"', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-05) delivers lib/hooks/use-job-status.ts')
  })

  it('exposes { status, output, error } state', () => {
    expect.fail('not implemented — Wave 1 (Plan 67-05) delivers lib/hooks/use-job-status.ts')
  })
})
