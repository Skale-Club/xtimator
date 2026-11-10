/**
 * Owner rule: every AI call goes through OpenRouter. The WhatsApp LLM factory
 * must build ChatOpenAI against the OpenRouter base URL with the OpenRouter key
 * (BYOK key for BYOK companies) and never touch getIntegrationKey('openai').
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const ctorArgs: Array<Record<string, any>> = []
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(args: Record<string, any>) {
      ctorArgs.push(args)
    }
  },
}))

const mockGetIntegrationKey = vi.fn()
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: (...a: unknown[]) => mockGetIntegrationKey(...a),
}))

const mockGetByok = vi.fn()
vi.mock('@/lib/billing/byok', () => ({
  getByokOpenRouterKey: (...a: unknown[]) => mockGetByok(...a),
}))

vi.mock('@/lib/chat/provider', () => ({
  resolveChatModelId: async () => 'anthropic/claude-sonnet-5.5',
}))

vi.mock('@/lib/ai/openrouter-client', () => ({
  OPENROUTER_BASE: 'https://openrouter.ai/api/v1',
  OR_DEFAULTS: { chat: 'anthropic/claude-sonnet-5.5', fast: 'anthropic/claude-haiku-5.5' },
  getORKey: async () => {
    const k = await mockGetIntegrationKey('openrouter')
    if (!k) throw new Error('OpenRouter API key not configured')
    return k
  },
}))

import { makeWhatsAppLLM } from '@/lib/whatsapp/llm'
import { createCostMeter } from '@/lib/whatsapp/cost-meter'

describe('makeWhatsAppLLM', () => {
  beforeEach(() => {
    ctorArgs.length = 0
    vi.clearAllMocks()
    mockGetIntegrationKey.mockImplementation(async (p: string) =>
      p === 'openrouter' ? 'or-platform-key' : 'openai-key-must-not-be-used'
    )
    mockGetByok.mockResolvedValue(null)
  })

  it('uses the OpenRouter base URL and platform OpenRouter key, never the openai key', async () => {
    await makeWhatsAppLLM('co-1')
    expect(ctorArgs).toHaveLength(1)
    expect(ctorArgs[0].configuration.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(ctorArgs[0].apiKey).toBe('or-platform-key')
    expect(ctorArgs[0].model).toBe('anthropic/claude-sonnet-5.5')
    // Claude 5.5 rejects a non-default temperature (HTTP 400): none is set.
    expect(ctorArgs[0].temperature).toBeUndefined()
    expect(mockGetIntegrationKey).not.toHaveBeenCalledWith('openai')
  })

  it('uses the BYOK key for a BYOK company', async () => {
    mockGetByok.mockResolvedValue('or-byok-key')
    await makeWhatsAppLLM('co-byok')
    expect(mockGetByok).toHaveBeenCalledWith('co-byok')
    expect(ctorArgs[0].apiKey).toBe('or-byok-key')
    expect(ctorArgs[0].configuration.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(mockGetIntegrationKey).not.toHaveBeenCalledWith('openai')
  })

  it('classifier uses the cheap OR_DEFAULTS.fast slug', async () => {
    await makeWhatsAppLLM('co-1', 'classify')
    expect(ctorArgs[0].model).toBe('anthropic/claude-haiku-5.5')
  })
  it('Phase 2a: no meter -> no custom fetch; a meter installs a metering fetch on the OpenRouter client', async () => {
    await makeWhatsAppLLM('co-1')
    expect(ctorArgs[0].configuration.fetch).toBeUndefined()

    ctorArgs.length = 0
    const meter = createCostMeter()
    await makeWhatsAppLLM('co-1', 'chat', meter)
    expect(typeof ctorArgs[0].configuration.fetch).toBe('function')
    // Still OpenRouter, still the same key resolution (BYOK key is unaffected by metering).
    expect(ctorArgs[0].configuration.baseURL).toBe('https://openrouter.ai/api/v1')
  })

  it('Phase 2a: BYOK key + meter -> the company key is used and the cost is still measured', async () => {
    mockGetByok.mockResolvedValue('or-byok-key')
    await makeWhatsAppLLM('co-byok', 'classify', createCostMeter())
    expect(ctorArgs[0].apiKey).toBe('or-byok-key')
    expect(typeof ctorArgs[0].configuration.fetch).toBe('function')
  })
})
