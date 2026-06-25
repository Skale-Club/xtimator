/**
 * Behavior contract for app/api/chat/route.ts (CHATBE-02).
 *
 * POST /api/chat:
 *   1. Authenticates the owner via supabase.auth.getClaims() → 401 when absent.
 *   2. Resolves the active company via getActiveCompanyId() → 4xx when absent.
 *      `company-SECRET` is the trusted-tenant tripwire — it is NEVER from the body.
 *   3. Reads the owner's industries/language from the companies row (service client).
 *   4. streamText({ model: resolveChatModel(companyId), system: CHAT_SYSTEM_PROMPT,
 *      messages: convertToModelMessages(messages), tools: buildChatTools(ctx),
 *      stopWhen: stepCountIs(5) }) → toUIMessageStreamResponse({ originalMessages, onFinish }).
 *   5. onFinish persists the NEW tail via appendMessage (createConversation first
 *      when conversationId is absent).
 *
 * The model is injected via a mock of @/lib/chat/provider returning a
 * MockLanguageModelV3 (ai/test) driven by simulateReadableStream (ai), so the
 * route is exercised end-to-end without a live OpenRouter key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { simulateReadableStream } from 'ai'

// --- Auth: getClaims is configurable per-test (no-claims → 401) -------------
const getClaimsMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}))

// --- Active company: the trusted tenant (never from the body) ---------------
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

// --- Service client: returns one companies row for the industries/language read
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

// --- Model provider: inject a deterministic MockLanguageModelV3 -------------
vi.mock('@/lib/chat/provider', () => ({
  resolveChatModel: vi.fn(),
}))

// --- Tools + system prompt: the route only wires them, no domain logic here -
const buildChatToolsMock = vi.fn((_ctx: unknown) => ({}))
vi.mock('@/lib/chat/tools', () => ({
  buildChatTools: (ctx: unknown) => buildChatToolsMock(ctx),
}))
vi.mock('@/lib/chat/system-prompt', () => ({
  CHAT_SYSTEM_PROMPT: 'TEST_SYSTEM_PROMPT',
}))

// --- Persistence (Phase 123 helpers) ----------------------------------------
vi.mock('@/lib/queries/chat', () => ({
  createConversation: vi.fn(),
  appendMessage: vi.fn(),
}))

import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { resolveChatModel } from '@/lib/chat/provider'
import { createConversation, appendMessage } from '@/lib/queries/chat'
import { POST } from '@/app/api/chat/route'

const getActiveCompanyIdMock = vi.mocked(getActiveCompanyId)
const requireServiceClientMock = vi.mocked(requireServiceClient)
const resolveChatModelMock = vi.mocked(resolveChatModel)
const createConversationMock = vi.mocked(createConversation)
const appendMessageMock = vi.mocked(appendMessage)

/** A chainable service-client mock that resolves the companies row. */
function makeServiceClientMock(companyRow: unknown) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: companyRow }),
  }
  return builder
}

/** A model that emits one short assistant text turn then finishes. */
function makeMockModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Done.' },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        ] as never,
      }),
    }),
  })
}

/** Build a POST Request with a UIMessage[] body. */
function chatRequest(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const userMessage = {
  id: 'm-user-1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text: 'Hello' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  // supabase.auth.getClaims() resolves { data: { claims }, error }.
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  getActiveCompanyIdMock.mockResolvedValue('company-SECRET')
  requireServiceClientMock.mockReturnValue(
    makeServiceClientMock({ industries: ['plumbing'], default_estimate_language: 'en' }) as never,
  )
  resolveChatModelMock.mockResolvedValue(makeMockModel() as never)
  createConversationMock.mockResolvedValue({ id: 'conv-1' } as never)
  appendMessageMock.mockResolvedValue({ id: 'msg-1' } as never)
})

describe('POST /api/chat', () => {
  it('returns 401 and never builds tools or streams when there are no auth claims', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } })

    const res = await POST(chatRequest({ messages: [userMessage] }))

    expect(res.status).toBe(401)
    expect(buildChatToolsMock).not.toHaveBeenCalled()
    expect(resolveChatModelMock).not.toHaveBeenCalled()
  })

  it('returns 4xx when there is no active company (no stream)', async () => {
    getActiveCompanyIdMock.mockResolvedValue(null)

    const res = await POST(chatRequest({ messages: [userMessage] }))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(resolveChatModelMock).not.toHaveBeenCalled()
  })

  it('builds tools with the trusted companyId + owner industries/language', async () => {
    const res = await POST(chatRequest({ messages: [userMessage] }))
    await new Response(res.body).text() // drain so onFinish settles within the test

    expect(buildChatToolsMock).toHaveBeenCalledTimes(1)
    const ctx = buildChatToolsMock.mock.calls[0][0] as {
      companyId: string
      industries: string[]
      language?: string
    }
    expect(ctx.companyId).toBe('company-SECRET')
    expect(ctx.industries).toEqual(['plumbing'])
    expect(ctx.language).toBe('en')
  })

  it('streams an authed turn via streamText + toUIMessageStreamResponse (200, body)', async () => {
    const res = await POST(chatRequest({ messages: [userMessage] }))

    expect(res.status).toBe(200)
    expect(res.body).toBeTruthy()
    expect(resolveChatModelMock).toHaveBeenCalledWith('company-SECRET')
    await new Response(res.body).text() // drain so onFinish settles within the test
  })

  it('persists the new assistant tail via appendMessage after the stream drains (conversationId present)', async () => {
    const res = await POST(
      chatRequest({ messages: [userMessage], conversationId: 'conv-existing' }),
    )

    // Drain the stream so onFinish fires.
    await new Response(res.body).text()

    expect(createConversationMock).not.toHaveBeenCalled()
    expect(appendMessageMock).toHaveBeenCalled()
    const call = appendMessageMock.mock.calls[0][0]
    expect(call.conversationId).toBe('conv-existing')
    expect(call.role).toBe('assistant')
  })

  it('creates the conversation first when conversationId is absent, then persists', async () => {
    const res = await POST(chatRequest({ messages: [userMessage] }))

    await new Response(res.body).text()

    expect(createConversationMock).toHaveBeenCalledWith('user-1')
    expect(appendMessageMock).toHaveBeenCalled()
    expect(appendMessageMock.mock.calls[0][0].conversationId).toBe('conv-1')
  })
})
