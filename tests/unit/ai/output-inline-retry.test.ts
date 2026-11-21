import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'
import {
  NoToolCallError,
  ProvidersUnavailableError,
  TruncatedOutputError,
} from '@/lib/ai/with-fallback'

const primaryGenerate = vi.fn()
const primaryRefine = vi.fn()

vi.mock('@/lib/ai', () => ({
  getAIProvider: vi.fn(async () => ({
    generateEstimate: primaryGenerate,
    refineEstimate: primaryRefine,
  })),
}))

const VALID_OUTPUT = {
  suggested_project_name: 'P',
  suggested_client_name: null,
  summary: 'S',
  sections: [],
}

const INPUT = {
  industry: null,
  projectName: 'P',
  projectType: null,
  targetBudget: null,
  clientName: null,
  clientAddress: null,
  transcripts: [],
  photoDescriptions: [],
  priceBookItems: [],
}

beforeEach(() => {
  primaryGenerate.mockReset()
  primaryRefine.mockReset()
})

describe('in-call retry when the model skips the tool or is cut off', () => {
  it('prose reply then a valid tool call -> success with exactly 2 calls and a tool nudge', async () => {
    primaryGenerate
      .mockRejectedValueOnce(new NoToolCallError('m'))
      .mockResolvedValueOnce(VALID_OUTPUT)
    const provider = await getAIProviderWithFallback('c1')
    await expect(provider.generateEstimate(INPUT)).resolves.toEqual(VALID_OUTPUT)
    expect(primaryGenerate).toHaveBeenCalledTimes(2)
    expect(primaryGenerate.mock.calls[0][0].retryHint).toBeUndefined()
    expect(primaryGenerate.mock.calls[1][0].retryHint).toMatch(/create_estimate tool/)
  })

  it('truncated then valid -> success with a concise nudge', async () => {
    primaryGenerate
      .mockRejectedValueOnce(new TruncatedOutputError('generate_estimate'))
      .mockResolvedValueOnce(VALID_OUTPUT)
    const provider = await getAIProviderWithFallback('c1')
    await expect(provider.generateEstimate(INPUT)).resolves.toEqual(VALID_OUTPUT)
    expect(primaryGenerate).toHaveBeenCalledTimes(2)
    expect(primaryGenerate.mock.calls[1][0].retryHint).toMatch(/concise/)
  })

  it('refine shares the same retry', async () => {
    primaryRefine
      .mockRejectedValueOnce(new NoToolCallError('m'))
      .mockResolvedValueOnce(VALID_OUTPUT)
    const provider = await getAIProviderWithFallback('c1')
    await expect(
      provider.refineEstimate({ instruction: 'x', existingEstimate: {} } as never)
    ).resolves.toEqual(VALID_OUTPUT)
    expect(primaryRefine).toHaveBeenCalledTimes(2)
  })

  it('two prose replies -> the old failure (ProvidersUnavailableError), no third call', async () => {
    primaryGenerate
      .mockRejectedValueOnce(new NoToolCallError('m'))
      .mockRejectedValueOnce(new NoToolCallError('m'))
    const provider = await getAIProviderWithFallback('c1')
    await expect(provider.generateEstimate(INPUT)).rejects.toBeInstanceOf(ProvidersUnavailableError)
    expect(primaryGenerate).toHaveBeenCalledTimes(2)
  })

  it('HTTP 5xx -> no extra in-call retry', async () => {
    primaryGenerate.mockRejectedValue(new Error('OpenRouter request failed (503): down'))
    const provider = await getAIProviderWithFallback('c1')
    await expect(provider.generateEstimate(INPUT)).rejects.toBeInstanceOf(ProvidersUnavailableError)
    expect(primaryGenerate).toHaveBeenCalledTimes(1)
  })
})
