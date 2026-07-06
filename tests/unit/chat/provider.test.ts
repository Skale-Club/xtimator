/**
 * Behavior contract for lib/chat/provider.ts (CHATBE-01).
 *
 * resolveChatModelId mirrors getAIProvider (lib/ai/index.ts) EXACTLY:
 *   1. companies.ai_model_override (per-company, via the service client)
 *   2. platform ai_config.openrouter_default_model (getOpenRouterDefaultModel)
 *   3. OR_DEFAULTS.chat ('anthropic/claude-sonnet-5')
 *
 * resolveChatModel sources the key via getIntegrationKey('openrouter') (NEVER
 * process.env directly — Pitfall 5), throws when it is null, and constructs
 * createOpenRouter({ apiKey, headers })(modelId), returning the AI-SDK model.
 *
 * A test seam (deps.modelOverride) lets the route's unit test inject a mock
 * model without a live key — when provided, the provider/key path is skipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
  getOpenRouterDefaultModel: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
// Spy factory: createOpenRouter returns a function that records the modelId it
// was called with and returns a sentinel "model" object.
const openrouterFactory = vi.fn((modelId: string) => ({ __model: modelId }))
const createOpenRouterMock = vi.fn((_settings: { apiKey?: string }) => openrouterFactory)
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: (settings: { apiKey?: string }) => createOpenRouterMock(settings),
}))

import { getIntegrationKey, getOpenRouterDefaultModel } from '@/lib/platform-config'
import { requireServiceClient } from '@/lib/supabase/service'
import { resolveChatModel, resolveChatModelId } from '@/lib/chat/provider'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'

const getIntegrationKeyMock = vi.mocked(getIntegrationKey)
const getOpenRouterDefaultModelMock = vi.mocked(getOpenRouterDefaultModel)
const requireServiceClientMock = vi.mocked(requireServiceClient)

/**
 * Chainable service-client mock: .from('companies').select(...).eq('id',...)
 * .maybeSingle() resolves { data }. Records the table + eqs for assertions.
 */
function makeServiceClientMock(companyRow: unknown) {
  const eqs: Array<[string, unknown]> = []
  const builder: Record<string, unknown> = {
    select() {
      return builder
    },
    eq(col: string, val: unknown) {
      eqs.push([col, val])
      return builder
    },
    maybeSingle() {
      return Promise.resolve({ data: companyRow })
    },
  }
  const client = { from: vi.fn(() => builder) }
  return { client, eqs }
}

beforeEach(() => {
  vi.clearAllMocks()
  openrouterFactory.mockImplementation((modelId: string) => ({ __model: modelId }))
  createOpenRouterMock.mockReturnValue(openrouterFactory)
})

describe('resolveChatModelId', () => {
  it('returns companies.ai_model_override when set (slot step 1)', async () => {
    const { client, eqs } = makeServiceClientMock({ ai_model_override: 'anthropic/claude-opus-4' })
    requireServiceClientMock.mockReturnValue(client as never)

    const id = await resolveChatModelId('company-1')

    expect(id).toBe('anthropic/claude-opus-4')
    expect(client.from).toHaveBeenCalledWith('companies')
    expect(eqs).toContainEqual(['id', 'company-1'])
    // Override short-circuits — the platform default is never consulted.
    expect(getOpenRouterDefaultModelMock).not.toHaveBeenCalled()
  })

  it('falls back to ai_config.openrouter_default_model when no override (slot step 2)', async () => {
    const { client } = makeServiceClientMock({ ai_model_override: null })
    requireServiceClientMock.mockReturnValue(client as never)
    getOpenRouterDefaultModelMock.mockResolvedValue('openai/gpt-5')

    const id = await resolveChatModelId('company-1')

    expect(id).toBe('openai/gpt-5')
  })

  it('falls back to OR_DEFAULTS.chat when neither override nor default is set (slot step 3)', async () => {
    const { client } = makeServiceClientMock({ ai_model_override: null })
    requireServiceClientMock.mockReturnValue(client as never)
    getOpenRouterDefaultModelMock.mockResolvedValue(null)

    const id = await resolveChatModelId('company-1')

    expect(id).toBe(OR_DEFAULTS.chat)
    expect(id).toBe('anthropic/claude-sonnet-5')
  })

  it('skips the company read when no companyId and uses the platform default', async () => {
    getOpenRouterDefaultModelMock.mockResolvedValue('openai/gpt-5')

    const id = await resolveChatModelId()

    expect(id).toBe('openai/gpt-5')
    expect(requireServiceClientMock).not.toHaveBeenCalled()
  })
})

describe('resolveChatModel', () => {
  it('throws when the OpenRouter API key is not configured', async () => {
    getIntegrationKeyMock.mockResolvedValue(null)
    const { client } = makeServiceClientMock({ ai_model_override: null })
    requireServiceClientMock.mockReturnValue(client as never)
    getOpenRouterDefaultModelMock.mockResolvedValue(null)

    await expect(resolveChatModel('company-1')).rejects.toThrow(
      'OpenRouter API key not configured',
    )
    expect(getIntegrationKeyMock).toHaveBeenCalledWith('openrouter')
  })

  it('constructs createOpenRouter({ apiKey })(modelId) with the resolved slot id', async () => {
    getIntegrationKeyMock.mockResolvedValue('test-key')
    const { client } = makeServiceClientMock({ ai_model_override: 'anthropic/claude-opus-4' })
    requireServiceClientMock.mockReturnValue(client as never)

    const model = await resolveChatModel('company-1')

    // Key sourced via getIntegrationKey('openrouter') — never process.env.
    expect(getIntegrationKeyMock).toHaveBeenCalledWith('openrouter')
    // The provider was constructed with the key.
    const settings = createOpenRouterMock.mock.calls[0]![0]
    expect(settings.apiKey).toBe('test-key')
    // The factory was called with the RESOLVED model id.
    expect(openrouterFactory).toHaveBeenCalledWith('anthropic/claude-opus-4')
    expect(model).toEqual({ __model: 'anthropic/claude-opus-4' })
  })

  it('returns the injected modelOverride without touching the key or provider (test seam)', async () => {
    const fakeModel = { __mock: true } as never

    const model = await resolveChatModel('company-1', { modelOverride: fakeModel })

    expect(model).toBe(fakeModel)
    expect(getIntegrationKeyMock).not.toHaveBeenCalled()
    expect(createOpenRouterMock).not.toHaveBeenCalled()
    expect(requireServiceClientMock).not.toHaveBeenCalled()
  })
})
