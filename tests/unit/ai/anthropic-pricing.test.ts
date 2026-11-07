import { describe, it, expect } from 'vitest'
import { computeAnthropicCostUsd, ANTHROPIC_USD_PER_MTOK } from '@/lib/ai/pricing/anthropic'

describe('computeAnthropicCostUsd', () => {
  it('prices a dated Sonnet 4 id via family prefix match', () => {
    const cost = computeAnthropicCostUsd('claude-sonnet-4-20250514', { input_tokens: 1_000_000, output_tokens: 100_000 })
    expect(cost).toBeCloseTo(3 + 1.5, 8)
  })

  it('prices Haiku 4.5 and Opus 4.1 (longest prefix wins)', () => {
    expect(computeAnthropicCostUsd('claude-haiku-4-5-20251001', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(6, 8)
    expect(computeAnthropicCostUsd('claude-opus-4-1-20250805', { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(15, 8)
    expect(ANTHROPIC_USD_PER_MTOK['claude-opus-4']).toBeDefined()
  })

  it('adds web search ($10 per 1000) and cache multipliers', () => {
    const cost = computeAnthropicCostUsd('claude-sonnet-4-20250514', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      server_tool_use: { web_search_requests: 3 },
    })
    expect(cost).toBeCloseTo(3 * 1.25 + 3 * 0.1 + 0.03, 8)
  })

  it('returns null (never 0) for unknown model or missing/invalid usage', () => {
    expect(computeAnthropicCostUsd('claude-mystery-9', { input_tokens: 1, output_tokens: 1 })).toBeNull()
    expect(computeAnthropicCostUsd('claude-sonnet-4-20250514', null)).toBeNull()
    expect(computeAnthropicCostUsd('claude-sonnet-4-20250514', undefined)).toBeNull()
    expect(computeAnthropicCostUsd('claude-sonnet-4-20250514', {})).toBeNull()
    expect(computeAnthropicCostUsd('claude-sonnet-4-20250514', { input_tokens: Number.NaN, output_tokens: 5 })).toBeNull()
  })

  it('does not match a family by bare string prefix (claude-sonnet-40 is unknown)', () => {
    expect(computeAnthropicCostUsd('claude-sonnet-40', { input_tokens: 1, output_tokens: 1 })).toBeNull()
  })
})
