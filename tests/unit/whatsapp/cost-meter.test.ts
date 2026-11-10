import { describe, it, expect, vi } from 'vitest'
import { createCostMeter, meteredFetch } from '@/lib/whatsapp/cost-meter'

/**
 * Phase 2a - the fetch wrapper that lets lib/whatsapp/llm.ts read OpenRouter's real
 * `usage.cost` off LangChain completions (LangChain itself does not expose it).
 */

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })

describe('meteredFetch', () => {
  it('sums usage.cost across calls and still returns a readable body to the caller', async () => {
    const meter = createCostMeter()
    const base = vi
      .fn()
      .mockResolvedValueOnce(json({ model: 'anthropic/claude-haiku-5.5', usage: { cost: 0.001 } }))
      .mockResolvedValueOnce(json({ model: 'anthropic/claude-sonnet-5.5', usage: { cost: 0.0125 } }))
    const f = meteredFetch(meter, base as unknown as typeof fetch)

    const res1 = await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' })
    await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST' })

    expect(await res1.json()).toMatchObject({ usage: { cost: 0.001 } }) // body not consumed
    expect(meter.calls).toBe(2)
    expect(meter.costUsd).toBeCloseTo(0.0135)
    expect(meter.model).toBe('anthropic/claude-sonnet-5.5')
  })

  it('a response with no numeric cost counts as a call but leaves the cost null (never 0)', async () => {
    const meter = createCostMeter()
    const f = meteredFetch(meter, vi.fn().mockResolvedValue(json({ usage: {} })) as unknown as typeof fetch)
    await f('x')
    expect(meter.calls).toBe(1)
    expect(meter.costUsd).toBeNull()
  })

  it('ignores non-ok responses and non-JSON (streaming) bodies without touching them', async () => {
    const meter = createCostMeter()
    const sse = new Response('data: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    const f = meteredFetch(
      meter,
      vi
        .fn()
        .mockResolvedValueOnce(new Response('nope', { status: 500 }))
        .mockResolvedValueOnce(sse) as unknown as typeof fetch
    )
    await f('x')
    await f('x')
    expect(meter.calls).toBe(1) // the 500 is not a completion; the SSE one is counted
    expect(meter.costUsd).toBeNull()
  })

  it('a malformed JSON body never breaks the LLM call', async () => {
    const meter = createCostMeter()
    const bad = new Response('{not json', { headers: { 'content-type': 'application/json' } })
    const f = meteredFetch(meter, vi.fn().mockResolvedValue(bad) as unknown as typeof fetch)
    await expect(f('x')).resolves.toBeDefined()
    expect(meter.costUsd).toBeNull()
  })
})

describe('createCostMeter', () => {
  it('ignores non-finite and negative costs', () => {
    const meter = createCostMeter()
    meter.addCost(NaN)
    meter.addCost(-1)
    meter.addCost('0.5')
    meter.addCost(undefined)
    expect(meter.costUsd).toBeNull()
    meter.addCost(0)
    expect(meter.costUsd).toBe(0)
  })
})
