import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const demoDenied = () =>
  NextResponse.json(
    {
      error: 'demo_readonly',
      message: 'This is a read-only demo. Create a free account to make changes.',
    },
    { status: 403 },
  )

const getClaims = vi.fn()
const demoGuardResponse = vi.fn()
const rateLimit = vi.fn()
const requireServiceClient = vi.fn()
const inngestSend = vi.fn()
const translateTextsOR = vi.fn()
const resolveChatModel = vi.fn()
const streamText = vi.fn()
const getBillingConfig = vi.fn()
const createConversation = vi.fn()
const appendMessage = vi.fn()
const getEstimateById = vi.fn()
const respondToEstimate = vi.fn()
const buildSignedContentSnapshot = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims }, from: vi.fn() })),
}))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: (...args: unknown[]) => demoGuardResponse(...args),
}))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...args: unknown[]) => rateLimit(...args) }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...args: unknown[]) => requireServiceClient(...args),
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: (...args: unknown[]) => inngestSend(...args) } }))
vi.mock('@/lib/inngest/events', () => ({
  EVENT_TRANSCRIBE_AUDIO: 'transcribe',
  EVENT_ANALYZE_PHOTOS: 'analyze',
  EVENT_ESTIMATE_GENERATE: 'generate',
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  translateTextsOR: (...args: unknown[]) => translateTextsOR(...args),
}))
vi.mock('@/lib/chat/provider', () => ({ resolveChatModel: (...args: unknown[]) => resolveChatModel(...args) }))
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamText(...args),
  convertToModelMessages: vi.fn(),
  stepCountIs: vi.fn(),
}))
vi.mock('@/lib/chat/tools', () => ({ buildChatTools: vi.fn() }))
vi.mock('@/lib/chat/system-prompt', () => ({ CHAT_SYSTEM_PROMPT: 'test' }))
vi.mock('@/lib/queries/chat', () => ({
  createConversation: (...args: unknown[]) => createConversation(...args),
  appendMessage: (...args: unknown[]) => appendMessage(...args),
  findMessageRow: vi.fn(),
}))
vi.mock('@/lib/entitlements-server', () => ({ getEntitlementsForTier: vi.fn() }))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: (...args: unknown[]) => getBillingConfig(...args),
}))
vi.mock('@/lib/quota', () => ({ checkQuota: vi.fn() }))
vi.mock('@/lib/billing/credit-ledger', () => ({ checkCredits: vi.fn() }))
vi.mock('@/lib/inngest/job-ownership', () => ({ recordJobOwnership: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn(async () => 'normal-company') }))
vi.mock('@/lib/errors', () => ({
  XtimatorError: class XtimatorError extends Error {},
  asResponse: vi.fn(() => new Response('error', { status: 500 })),
  throwIfNotFound: vi.fn(),
  throwIfForbidden: vi.fn(),
}))
vi.mock('@/lib/billing/overage-affordance', () => ({ buildOverageAffordance: vi.fn() }))
vi.mock('@/lib/i18n/resolve-estimate-language', () => ({ isSupportedLanguage: vi.fn() }))
vi.mock('@/lib/estimate/ingest/multimodal', () => ({ ingestMultimodal: vi.fn() }))
vi.mock('@/lib/estimate/graph/refine-graph', () => ({ buildRefineGraph: vi.fn() }))
vi.mock('@/lib/estimate/adapters/refine', () => ({ makeRefineAdapter: vi.fn() }))
vi.mock('@/lib/estimate/lock', () => ({ isEstimateLocked: vi.fn() }))
vi.mock('@/lib/queries/estimate', () => ({ getEstimateById: (...args: unknown[]) => getEstimateById(...args) }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/demo/config', () => ({ isDemoCompany: vi.fn() }))
vi.mock('@/app/estimate/[token]/actions', () => ({
  respondToEstimate: (...args: unknown[]) => respondToEstimate(...args),
}))
vi.mock('@/lib/estimate/signed-snapshot', () => ({
  buildSignedContentSnapshot: (...args: unknown[]) => buildSignedContentSnapshot(...args),
}))

type RouteCase = {
  name: string
  load: () => Promise<(request: Request, context?: { params: Promise<{ id: string }> }) => Promise<Response>>
  request: () => Request
  context?: { params: Promise<{ id: string }> }
}

const routeCases: RouteCase[] = [
  {
    name: 'chat',
    load: async () => (await import('@/app/api/chat/route')).POST,
    request: () => new Request('http://localhost/api/chat', { method: 'POST', body: '{}' }),
  },
  {
    name: 'translate',
    load: async () => (await import('@/app/api/translate/route')).POST,
    request: () => new Request('http://localhost/api/translate', { method: 'POST', body: '{}' }),
  },
  {
    name: 'transcribe',
    load: async () => (await import('@/app/api/transcribe/route')).POST,
    request: () => new Request('http://localhost/api/transcribe', { method: 'POST', body: '{}' }),
  },
  {
    name: 'analyze photos',
    load: async () => (await import('@/app/api/analyze-photos/route')).POST,
    request: () => new Request('http://localhost/api/analyze-photos', { method: 'POST', body: JSON.stringify({ projectId: 'project-id' }) }),
  },
  {
    name: 'generate estimate',
    load: async () => (await import('@/app/api/generate-estimate/route')).POST,
    request: () => new Request('http://localhost/api/generate-estimate', { method: 'POST', body: '{}' }),
  },
  {
    name: 'refine estimate',
    load: async () => (await import('@/app/api/estimates/[id]/refine/route')).POST,
    request: () => new Request('http://localhost/api/estimates/estimate-id/refine', { method: 'POST', body: '{}' }),
    context: { params: Promise.resolve({ id: 'estimate-id' }) },
  },
  {
    name: 'sign estimate',
    load: async () => (await import('@/app/api/estimates/[id]/sign/route')).POST,
    request: () => new Request('http://localhost/api/estimates/estimate-id/sign', {
      method: 'POST',
      body: JSON.stringify({ token: 'share-token', signerName: 'Demo', signatureData: 'data' }),
    }),
    context: { params: Promise.resolve({ id: 'estimate-id' }) },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  getClaims.mockResolvedValue({ data: { claims: { sub: 'normal-user', email: 'owner@example.com' } } })
  demoGuardResponse.mockResolvedValue(demoDenied())
  rateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 })
  getBillingConfig.mockResolvedValue({ absorbedChatRateLimitPerMin: 20 })
  requireServiceClient.mockReturnValue({
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => ({
          data: {
            id: 'estimate-id',
            company_id: 'normal-company',
            project_id: 'project-id',
            share_token: 'share-token',
            client_response: null,
          },
        })),
      }
      return query
    }),
  })
})

describe('SAFE-01/SAFE-02: AI and estimate routes deny demo contexts before effects', () => {
  for (const routeCase of routeCases) {
    it(`returns the standard 403 before rate limits, providers, dispatches, or persistence for ${routeCase.name}`, async () => {
      const post = await routeCase.load()
      const response = await post(routeCase.request(), routeCase.context)

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({ error: 'demo_readonly' })
      expect(demoGuardResponse, `${routeCase.name} must use the shared demo guard`).toHaveBeenCalled()
      expect(rateLimit).not.toHaveBeenCalled()
      expect(resolveChatModel).not.toHaveBeenCalled()
      expect(translateTextsOR).not.toHaveBeenCalled()
      expect(streamText).not.toHaveBeenCalled()
      expect(inngestSend).not.toHaveBeenCalled()
      expect(createConversation).not.toHaveBeenCalled()
      expect(appendMessage).not.toHaveBeenCalled()
      expect(respondToEstimate).not.toHaveBeenCalled()
      expect(buildSignedContentSnapshot).not.toHaveBeenCalled()
    })
  }

  it('preserves the normal 401 response before a demo guard can run', async () => {
    getClaims.mockResolvedValue({ data: { claims: null } })
    const { POST } = await import('@/app/api/translate/route')

    await expect(POST(new Request('http://localhost/api/translate', { method: 'POST' }))).resolves.toMatchObject({ status: 401 })
    expect(demoGuardResponse).not.toHaveBeenCalled()
  })

  it('preserves the normal-tenant path when the shared guard allows it', async () => {
    demoGuardResponse.mockResolvedValue(null)
    const { POST } = await import('@/app/api/translate/route')

    await POST(new Request('http://localhost/api/translate', { method: 'POST' }))
    expect(rateLimit).toHaveBeenCalledWith('translatePerMinute', 'normal-user')
  })
})
