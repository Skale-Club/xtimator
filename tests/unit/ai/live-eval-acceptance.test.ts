import { describe, expect, it } from 'vitest'
import { inspectLiveResults, selectLiveCases } from '../../eval/live/acceptance'

const cases = [{ id: 'paint' }, { id: 'plumbing' }, { id: 'deck' }]
const scored = { id: 'paint', ok: true, rubric: { score: 82 } }

describe('live canary preflight and acceptance', () => {
  it('selects known cases safely before calls and still applies the cap', () => {
    expect(selectLiveCases(cases, 'paint, deck, paint', '1')).toEqual({ cases: [cases[0]], errors: [] })
    expect(selectLiveCases(cases, '', undefined)).toEqual({ cases, errors: [] })
    expect(selectLiveCases(cases, 'paint, missing', '1').errors).toContain('Unknown golden case IDs: missing')
    expect(selectLiveCases(cases, ',', '1').errors).toContain('EVAL_LIVE_CASES contains an empty case ID')
    expect(selectLiveCases(cases, 'missing', '1').errors).toContain('No golden cases were selected')
  })

  it('defaults to at most 18 cases', () => {
    const pool = Array.from({ length: 20 }, (_, index) => ({ id: `case-${index}` }))
    expect(selectLiveCases(pool, undefined, undefined).cases).toHaveLength(18)
  })

  it.each(['0', '-1', '1.5', '1e1', 'Infinity', '9007199254740993'])('rejects an invalid case cap (%s)', (cap) => {
    expect(selectLiveCases(cases, undefined, cap).errors).toContain('EVAL_LIVE_MAX_CASES must be a positive integer')
  })

  it('requires at least one selected case and an outcome for each selection', () => {
    expect(inspectLiveResults(0, []).errors).toContain('No golden cases were selected')
    expect(inspectLiveResults(2, [scored]).errors).toContain('Expected 2 case outcomes, got 1')
    expect(inspectLiveResults(1, [scored]).errors).toEqual([])
  })

  it('rejects provider failure, schema failure and absent or invalid scores independently of the baseline', () => {
    const failures = inspectLiveResults(6, [
      scored,
      { id: 'provider-error', ok: false, error: 'provider unavailable', rubric: null },
      { id: 'schema-error', ok: false, error: 'schema: missing sections', rubric: null },
      { id: 'missing-score', ok: true, rubric: null },
      { id: 'invalid-score', ok: true, rubric: { score: Number.NaN } },
      { id: 'out-of-range-score', ok: true, rubric: { score: 101 } },
    ])

    expect(failures.failedCases).toEqual([
      { id: 'provider-error', reason: 'case failed' },
      { id: 'schema-error', reason: 'schema validation failed' },
      { id: 'missing-score', reason: 'rubric score is missing or invalid' },
      { id: 'invalid-score', reason: 'rubric score is missing or invalid' },
      { id: 'out-of-range-score', reason: 'rubric score is missing or invalid' },
    ])
    expect(failures.errors).toHaveLength(5)
  })
})
