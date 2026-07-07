import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 260707-hhp (P2): pipeline watchdog cron tests.
 *
 * classifyLastEvent is a pure function — tested directly. sweepStuckAttempts
 * takes injected deps (svc, now) per the plan's preferred shape (mirrors
 * lib/inngest/functions/notification-cleanup.ts's runNotificationCleanup),
 * so the sweep decision logic is testable without standing up the Inngest
 * step-run harness.
 */

vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: vi.fn().mockResolvedValue(undefined),
}))

import {
  classifyLastEvent,
  sweepStuckAttempts,
  STUCK_AFTER_MS,
} from '@/lib/inngest/functions/pipeline-watchdog'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { notifyOps } from '@/lib/observability/ops-alert'

const mockRecordPipelineEvent = vi.mocked(recordPipelineEvent)
const mockNotifyOps = vi.mocked(notifyOps)

// ── classifyLastEvent ─────────────────────────────────────────────────────────
describe('260707-hhp: classifyLastEvent', () => {
  it('returns "failed" for a failed row regardless of step', () => {
    expect(classifyLastEvent({ step: 'transcribe', status: 'failed' })).toBe('failed')
  })

  it('returns "done" for generate_estimate succeeded', () => {
    expect(classifyLastEvent({ step: 'generate_estimate', status: 'succeeded' })).toBe('done')
  })

  it('returns "done" for preview_redirect succeeded', () => {
    expect(classifyLastEvent({ step: 'preview_redirect', status: 'succeeded' })).toBe('done')
  })

  it('returns "pending" for save_recording succeeded (not a terminal step)', () => {
    expect(classifyLastEvent({ step: 'save_recording', status: 'succeeded' })).toBe('pending')
  })

  it('returns "pending" for transcribe succeeded (not a terminal step)', () => {
    expect(classifyLastEvent({ step: 'transcribe', status: 'succeeded' })).toBe('pending')
  })

  it('returns "pending" for transcribe started', () => {
    expect(classifyLastEvent({ step: 'transcribe', status: 'started' })).toBe('pending')
  })
})

// ── sweepStuckAttempts ─────────────────────────────────────────────────────────
type Attempt = {
  attempt_id: string
  last_at: string
  company_id: string | null
  project_id: string | null
  user_id: string | null
  input_type: string | null
}

/**
 * Table-switch supabase mock (follows recording-early-return-events.test.ts's
 * convention). Distinguishes the two pipeline_events queries by inspecting the
 * `select()` args: a `{ count, head }` second arg means the "already marked"
 * head-count query; otherwise it's the "latest event" query.
 */
function makeSvc(params: {
  attempts: Attempt[]
  latestEventFor: Record<string, { step: string; status: string } | undefined>
  alreadyMarkedFor?: Set<string>
}) {
  const { attempts, latestEventFor, alreadyMarkedFor = new Set<string>() } = params

  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === 'pipeline_attempts') {
      return {
        select: vi.fn().mockReturnValue({
          lt: vi.fn().mockReturnValue({
            gt: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: attempts }),
              }),
            }),
          }),
        }),
      }
    }

    if (table === 'pipeline_events') {
      return {
        select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string }) => {
          if (opts?.count) {
            // "already marked" head-count query: .eq(attempt_id).eq(error_code)
            return {
              eq: vi.fn().mockImplementation((_c1: string, attemptId: string) => ({
                eq: vi.fn().mockResolvedValue({
                  count: alreadyMarkedFor.has(attemptId) ? 1 : 0,
                }),
              })),
            }
          }
          // "latest event" query: .eq(attempt_id).order(created_at desc).limit(1)
          return {
            eq: vi.fn().mockImplementation((_c: string, attemptId: string) => ({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: latestEventFor[attemptId] ? [latestEventFor[attemptId]] : [],
                }),
              }),
            })),
          }
        }),
      }
    }

    throw new Error(`unexpected table in test mock: ${table}`)
  })

  return { from: fromFn }
}

function makeAttempt(overrides: Partial<Attempt> = {}, now: number): Attempt {
  return {
    attempt_id: 'attempt-1',
    last_at: new Date(now - STUCK_AFTER_MS - 5 * 60 * 1000).toISOString(), // 20min stale
    company_id: 'company-1',
    project_id: 'project-1',
    user_id: 'user-1',
    input_type: 'recording',
    ...overrides,
  }
}

describe('260707-hhp: sweepStuckAttempts', () => {
  const now = Date.now()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks a pending stale attempt with ONE watchdog_timeout event + ONE notifyOps', async () => {
    const attempt = makeAttempt({}, now)
    const svc = makeSvc({
      attempts: [attempt],
      latestEventFor: { 'attempt-1': { step: 'transcribe', status: 'started' } },
    })

    const result = await sweepStuckAttempts({ svc: svc as never, now })

    expect(result).toEqual({ candidates: 1, marked: 1 })
    expect(mockRecordPipelineEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordPipelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-1',
        step: 'transcribe',
        status: 'failed',
        errorCode: 'watchdog_timeout',
        companyId: 'company-1',
        projectId: 'project-1',
        userId: 'user-1',
      })
    )
    expect(mockNotifyOps).toHaveBeenCalledTimes(1)
    expect(mockNotifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pipeline_stuck',
        severity: 'warning',
        dedupeKey: 'watchdog:attempt-1',
        suppressWindowSec: 86400,
      })
    )
  })

  it('skips an attempt that already has a watchdog_timeout row (no duplicate alert)', async () => {
    const attempt = makeAttempt({}, now)
    const svc = makeSvc({
      attempts: [attempt],
      latestEventFor: { 'attempt-1': { step: 'transcribe', status: 'started' } },
      alreadyMarkedFor: new Set(['attempt-1']),
    })

    const result = await sweepStuckAttempts({ svc: svc as never, now })

    expect(result).toEqual({ candidates: 1, marked: 0 })
    expect(mockRecordPipelineEvent).not.toHaveBeenCalled()
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('skips a "done" attempt (latest event succeeded on generate_estimate)', async () => {
    const attempt = makeAttempt({}, now)
    const svc = makeSvc({
      attempts: [attempt],
      latestEventFor: { 'attempt-1': { step: 'generate_estimate', status: 'succeeded' } },
    })

    const result = await sweepStuckAttempts({ svc: svc as never, now })

    expect(result).toEqual({ candidates: 1, marked: 0 })
    expect(mockRecordPipelineEvent).not.toHaveBeenCalled()
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('skips an attempt whose latest event already failed (onFailure/early-return already alerted)', async () => {
    const attempt = makeAttempt({}, now)
    const svc = makeSvc({
      attempts: [attempt],
      latestEventFor: { 'attempt-1': { step: 'transcribe', status: 'failed' } },
    })

    const result = await sweepStuckAttempts({ svc: svc as never, now })

    expect(result).toEqual({ candidates: 1, marked: 0 })
    expect(mockRecordPipelineEvent).not.toHaveBeenCalled()
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })

  it('returns {candidates: 0, marked: 0} when no attempts are stale', async () => {
    const svc = makeSvc({ attempts: [], latestEventFor: {} })

    const result = await sweepStuckAttempts({ svc: svc as never, now })

    expect(result).toEqual({ candidates: 0, marked: 0 })
    expect(mockRecordPipelineEvent).not.toHaveBeenCalled()
    expect(mockNotifyOps).not.toHaveBeenCalled()
  })
})
