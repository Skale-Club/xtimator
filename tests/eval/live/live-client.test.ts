import { describe, expect, it, vi } from 'vitest'
import { GOLDEN_CASES } from '../golden/cases'
import { DEFAULT_ESTIMATE_MODEL, DEFAULT_PLAN_MODEL, inputFor, meanScore, median, runLiveCase } from './run-case'

// SEED-057 Phase F: the live harness's PLUMBING is exercised in CI with a stubbed
// fetch (zero cost, zero network), so the canary cannot rot unnoticed between the
// manual runs. The real-model run is golden-live.test.ts, skipped without EVAL_LIVE=1.

const painting = GOLDEN_CASES.find((c) => c.id === 'painting-en-bedroom')!

function stubFetch(handler: (body: Record<string, unknown>) => unknown, ok = true) {
  const calls: Array<Record<string, unknown>> = []
  const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push(body)
    return { ok, status: ok ? 200 : 500, json: async () => handler(body), text: async () => 'boom' } as Response
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

const toolResponse = (name: string, args: unknown, cost = 0.01) => ({
  choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] } }],
  usage: { cost },
})

describe('runLiveCase (stubbed network)', () => {
  it('builds the production request and scores the answer with the rubric', async () => {
    const { fetchImpl, calls } = stubFetch(() => toolResponse('create_estimate', painting.reference))
    const result = await runLiveCase(painting, { apiKey: 'test', fetchImpl })

    expect(result.ok).toBe(true)
    expect(result.rubric!.score).toBeGreaterThanOrEqual(90)
    expect(result.costUsd).toBe(0.01)
    expect(calls).toHaveLength(1)

    const body = calls[0] as { model: string; messages: Array<{ role: string; content: string }>; tool_choice: unknown }
    expect(body.model).toBe(DEFAULT_ESTIMATE_MODEL)
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'create_estimate' } })
    expect(body.messages[0].content).toContain('## Trade playbook: Painting')
    expect(body.messages[0].content.trimEnd().split('\n').pop()).toMatch(/untrusted data/)
    expect(body.messages[1].content).toContain('<transcript>')
    expect(body.messages[1].content).toContain('twelve by fourteen')
  })

  it('two-step mode plans first on the cheap model, then estimates with the plan', async () => {
    const plan = {
      detected_trade: 'painting',
      measurements: [{ subject: 'bedroom', value: 168, unit: 'sq ft', source: 'stated', from: 'audio' }],
      sections: [{ title: 'Walls' }],
    }
    const { fetchImpl, calls } = stubFetch((body) =>
      (body.tool_choice as { function: { name: string } }).function.name === 'plan_scope'
        ? toolResponse('plan_scope', plan, 0.002)
        : toolResponse('create_estimate', painting.reference, 0.01),
    )
    const result = await runLiveCase(painting, { apiKey: 'test', fetchImpl, twoStep: true })

    expect(calls).toHaveLength(2)
    expect(calls[0].model).toBe(DEFAULT_PLAN_MODEL)
    expect(calls[1].model).toBe(DEFAULT_ESTIMATE_MODEL)
    expect((calls[1].messages as Array<{ content: string }>)[1].content).toContain('<scope_plan>')
    expect(result.plan).toMatchObject({ usable: true, costUsd: 0.002 })
    expect(result.costUsd).toBeCloseTo(0.012, 6)
    expect(result.ok).toBe(true)
  })

  it('two-step mode falls back to one step when the plan call fails', async () => {
    const { fetchImpl, calls } = stubFetch((body) => {
      if ((body.tool_choice as { function: { name: string } }).function.name === 'plan_scope') throw new Error('plan down')
      return toolResponse('create_estimate', painting.reference)
    })
    const result = await runLiveCase(painting, { apiKey: 'test', fetchImpl, twoStep: true })
    expect(result.ok).toBe(true)
    expect(result.plan?.usable).toBe(false)
    expect((calls[1].messages as Array<{ content: string }>)[1].content).not.toContain('<scope_plan>')
  })

  it('reports a failure instead of throwing, and a failed case counts as 0 in the mean', async () => {
    const { fetchImpl } = stubFetch(() => ({}), false)
    const failed = await runLiveCase(painting, { apiKey: 'test', fetchImpl })
    expect(failed.ok).toBe(false)
    expect(failed.error).toMatch(/500/)

    const { fetchImpl: ok } = stubFetch(() => toolResponse('create_estimate', painting.reference))
    const good = await runLiveCase(painting, { apiKey: 'test', fetchImpl: ok })
    expect(meanScore([good, failed])).toBeCloseTo(good.rubric!.score / 2, 0)
  })

  it('a schema-invalid answer is a failure, not a crash', async () => {
    const { fetchImpl } = stubFetch(() => toolResponse('create_estimate', { summary: 'no sections' }))
    const result = await runLiveCase(painting, { apiKey: 'test', fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^schema:/)
  })

  it('a truncated answer is a failure', async () => {
    const { fetchImpl } = stubFetch(() => ({ choices: [{ finish_reason: 'length', message: {} }] }))
    expect((await runLiveCase(painting, { apiKey: 'test', fetchImpl })).error).toMatch(/truncated/)
  })
})

describe('helpers', () => {
  it('inputFor mirrors a production generate input', () => {
    const input = inputFor(painting)
    expect(input.language).toBe('en')
    expect(input.aiBlocks).toEqual({ timeline: false, notes: false })
    expect(input.priceBookItems).toEqual([])
  })

  it('median', () => {
    expect(median([])).toBe(0)
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})
