import { describe, it, expect } from 'vitest'

/**
 * 260707-hhp (P1 client half / Wave 2): evaluateOutcomeTick — the pure decision
 * core of the dispatch-and-watch outcome watcher. `previousEstimateId` is the
 * baseline captured before dispatch; only a current estimate id that DIFFERS
 * from that baseline counts as a NEW estimate (completion) — a pre-existing
 * current estimate (edit-mode rerun) must not be mistaken for THIS attempt's
 * result.
 */
import { evaluateOutcomeTick } from '@/lib/estimate/poll-outcome'

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
