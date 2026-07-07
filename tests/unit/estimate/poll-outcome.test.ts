import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 260707-hhp (P1 client half / Wave 2): evaluateOutcomeTick — the pure decision
 * core of the dispatch-and-watch outcome watcher's fallback path.
 *
 * 260707-lyq (P4 Wave 2): pollEstimateOutcome coverage — journal-first via a
 * mocked getAttemptOutcome (Wave 1). Mocking follows
 * tests/unit/actions/recording-early-return-events.test.ts's conventions
 * (module-level vi.mock + vi.mocked for every cross-layer import).
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/actions/attempt-outcome', () => ({
  getAttemptOutcome: vi.fn(),
}))

import { createClient } from '@/lib/supabase/client'
import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'
import { evaluateOutcomeTick, pollEstimateOutcome } from '@/lib/estimate/poll-outcome'

const mockCreateClient = vi.mocked(createClient)
const mockGetAttemptOutcome = vi.mocked(getAttemptOutcome)

// Mutable fallback-query state read by the supabase mock below — set per test,
// reset in beforeEach. Mirrors the real estimates/projects fallback shape
// pollEstimateOutcome queries (select().eq()[.eq()].maybeSingle()).
let fallbackEstimateId: string | null = null
let fallbackProjectStatus: string | null = null

function buildSupabaseMock() {
  return {
    from: (table: string) => {
      if (table === 'estimates') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: fallbackEstimateId ? { id: fallbackEstimateId } : null }),
              }),
            }),
          }),
        }
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: fallbackProjectStatus ? { status: fallbackProjectStatus } : null }),
            }),
          }),
        }
      }
      throw new Error(`poll-outcome.test.ts: unexpected table "${table}"`)
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fallbackEstimateId = null
  fallbackProjectStatus = null
  mockCreateClient.mockReturnValue(buildSupabaseMock() as unknown as ReturnType<typeof createClient>)
})

describe('260707-hhp: evaluateOutcomeTick', () => {
  it('new current id + null previous -> completed', () => {
    expect(
      evaluateOutcomeTick({
        currentEstimateId: 'est-1',
        projectStatus: null,
        previousEstimateId: null,
      })
    ).toEqual({ state: 'completed', estimateId: 'est-1' })
  })

  it('new current id != previous -> completed', () => {
    expect(
      evaluateOutcomeTick({
        currentEstimateId: 'est-2',
        projectStatus: null,
        previousEstimateId: 'est-1',
      })
    ).toEqual({ state: 'completed', estimateId: 'est-2' })
  })

  it('current id === previous -> null (not completed by a stale estimate)', () => {
    expect(
      evaluateOutcomeTick({
        currentEstimateId: 'est-1',
        projectStatus: null,
        previousEstimateId: 'est-1',
      })
    ).toBeNull()
  })

  it('awaiting_details status (no new estimate) -> awaiting_details', () => {
    expect(
      evaluateOutcomeTick({
        currentEstimateId: null,
        projectStatus: 'awaiting_details',
        previousEstimateId: null,
      })
    ).toEqual({ state: 'awaiting_details' })
  })

  it('awaiting_details status even when a stale current estimate still exists -> awaiting_details', () => {
    // Edit-mode rerun: a current estimate already existed before dispatch and the
    // new attempt produced no line items (project flipped to awaiting_details).
    // The stale id must not be reported as completed.
    expect(
      evaluateOutcomeTick({
        currentEstimateId: 'est-1',
        projectStatus: 'awaiting_details',
        previousEstimateId: 'est-1',
      })
    ).toEqual({ state: 'awaiting_details' })
  })

  it('nothing (no new estimate, no awaiting_details) -> null', () => {
    expect(
      evaluateOutcomeTick({
        currentEstimateId: null,
        projectStatus: 'recording',
        previousEstimateId: null,
      })
    ).toBeNull()
  })

  it('nothing when current === previous and status is unrelated -> null', () => {
    expect(
      evaluateOutcomeTick({
        currentEstimateId: 'est-1',
        projectStatus: 'estimate_ready',
        previousEstimateId: 'est-1',
      })
    ).toBeNull()
  })
})

describe('260707-lyq (P4 Wave 2): pollEstimateOutcome — journal-first', () => {
  it('journal completed -> outcome completed (terminal, no fallback query needed)', async () => {
    mockGetAttemptOutcome.mockResolvedValueOnce({ state: 'completed', estimateId: 'est-journal' })

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
    })

    expect(outcome).toEqual({ state: 'completed', estimateId: 'est-journal' })
    expect(mockGetAttemptOutcome).toHaveBeenCalledWith('attempt-1')
  })

  it('journal needs_details -> outcome awaiting_details (maps onto the existing variant)', async () => {
    mockGetAttemptOutcome.mockResolvedValueOnce({ state: 'needs_details' })

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
    })

    expect(outcome).toEqual({ state: 'awaiting_details' })
  })

  it('journal failed -> outcome failed with the real step + server error_message', async () => {
    mockGetAttemptOutcome.mockResolvedValueOnce({
      state: 'failed',
      step: 'transcribe',
      reason: 'Whisper API returned a 500',
    })

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
    })

    expect(outcome).toEqual({
      state: 'failed',
      step: 'transcribe',
      reason: 'Whisper API returned a 500',
    })
  })

  it('journal pending -> falls through to the estimates/projects fallback (new estimate id wins)', async () => {
    mockGetAttemptOutcome.mockResolvedValue({ state: 'pending', lastStep: 'transcribe', lastStatus: 'started' })
    fallbackEstimateId = 'est-fallback'

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
      intervalMs: 5,
      timeoutMs: 500,
    })

    expect(outcome).toEqual({ state: 'completed', estimateId: 'est-fallback' })
  })

  it('journal unauthorized is treated as pending -> falls through without failing the UI', async () => {
    mockGetAttemptOutcome.mockResolvedValue({ state: 'unauthorized' })
    fallbackEstimateId = 'est-fallback-2'

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
      intervalMs: 5,
      timeoutMs: 500,
    })

    expect(outcome).toEqual({ state: 'completed', estimateId: 'est-fallback-2' })
  })

  it('onStageProgress fires with the journal lastStep on a pending tick', async () => {
    mockGetAttemptOutcome.mockResolvedValue({ state: 'pending', lastStep: 'transcribe', lastStatus: 'started' })
    const onStageProgress = vi.fn()

    // No fallback completion configured — the poll runs out the clock, proving
    // onStageProgress fired at least once along the way.
    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
      intervalMs: 5,
      timeoutMs: 30,
      onStageProgress,
    })

    expect(outcome).toEqual({ state: 'timeout' })
    expect(onStageProgress).toHaveBeenCalledWith('transcribe')
  })

  it('stale projects.status=awaiting_details is IGNORED when attemptId is present (production stale-status regression)', async () => {
    // Production evidence: a project row left at status='awaiting_details' from
    // a PRIOR attempt must not fool a brand-new, still-pending retry's poll —
    // the journal (not the fallback) owns vague detection once attemptId flows.
    mockGetAttemptOutcome.mockResolvedValue({
      state: 'pending',
      lastStep: 'generate_estimate',
      lastStatus: 'started',
    })
    fallbackProjectStatus = 'awaiting_details'
    fallbackEstimateId = null

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      attemptId: 'attempt-1',
      intervalMs: 5,
      timeoutMs: 30,
    })

    // Must NOT resolve awaiting_details from the stale project row — times out
    // instead, proving the fallback's awaiting_details branch was skipped.
    expect(outcome).toEqual({ state: 'timeout' })
  })

  it('without attemptId, the fallback awaiting_details branch still fires (backward compatible)', async () => {
    fallbackProjectStatus = 'awaiting_details'
    fallbackEstimateId = null

    const outcome = await pollEstimateOutcome({
      projectId: 'proj-1',
      previousEstimateId: null,
      signal: new AbortController().signal,
      // no attemptId — journal is never consulted
    })

    expect(outcome).toEqual({ state: 'awaiting_details' })
    expect(mockGetAttemptOutcome).not.toHaveBeenCalled()
  })
})
