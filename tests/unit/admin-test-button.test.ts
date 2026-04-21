import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setTestEncryptionKey } from '../fixtures/test-encryption-key'

/**
 * Tests for testIntegrationKey() server action (ADMIN-10).
 *
 * Each provider branch is exercised twice:
 *   - happy path: SDK / fetch returns a canned success → action returns { ok: true, message: ... }
 *   - sad path: SDK / fetch throws → action returns { ok: false, message: <error> }
 *
 * Mocks:
 * - @/lib/auth/admin-context.requireAdmin → returns a fixed admin context
 * - @/lib/platform-config.getIntegrationKey → returns a fake key per provider
 * - resend.Resend → mock email send
 * - @anthropic-ai/sdk default export → mock messages.create
 * - global fetch → mock OpenAI /v1/models response
 */

const ADMIN_CTX = { userId: 'admin-uuid', email: 'admin@example.com' }

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn().mockResolvedValue(ADMIN_CTX),
}))

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
  invalidatePlatformConfig: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

const mockResendSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: (...args: unknown[]) => mockResendSend(...args) }
  },
}))

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))

// next/cache.revalidatePath is a no-op in tests
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('testIntegrationKey() (ADMIN-10)', () => {
  beforeEach(async () => {
    setTestEncryptionKey()
    vi.resetModules()
    mockResendSend.mockReset()
    mockAnthropicCreate.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns ok:false when no key is configured', async () => {
    const platformConfig = await import('@/lib/platform-config')
    ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    )
    const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
    const r = await testIntegrationKey({ provider: 'resend' })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no key configured/i)
  })

  describe('resend', () => {
    it('calls Resend.emails.send and returns success message', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        're_test_key'
      )
      mockResendSend.mockResolvedValue({ data: { id: '123' }, error: null })

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'resend' })

      expect(r.ok).toBe(true)
      expect(r.message).toMatch(/Sent a test email to admin@example\.com/i)
      expect(mockResendSend).toHaveBeenCalledTimes(1)
      expect(mockResendSend.mock.calls[0]?.[0]).toMatchObject({
        to: 'admin@example.com',
      })
    })

    it('returns ok:false when SDK throws', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        're_test_key'
      )
      mockResendSend.mockRejectedValue(new Error('Resend rejected the key (401)'))

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'resend' })

      expect(r.ok).toBe(false)
      expect(r.message).toMatch(/401/)
    })
  })

  describe('anthropic', () => {
    it('calls Anthropic.messages.create and returns latency message', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'sk-ant-test'
      )
      mockAnthropicCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'hi' }],
      })

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'anthropic' })

      expect(r.ok).toBe(true)
      expect(r.message).toMatch(/Claude responded in \d+ms/)
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
      expect(mockAnthropicCreate.mock.calls[0]?.[0]).toMatchObject({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
      })
    })

    it('returns ok:false when SDK throws', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'sk-ant-test'
      )
      mockAnthropicCreate.mockRejectedValue(new Error('Invalid API key'))

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'anthropic' })

      expect(r.ok).toBe(false)
      expect(r.message).toMatch(/Invalid API key/)
    })
  })

  describe('openai', () => {
    it('calls /v1/models and returns model count', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'sk-openai-test'
      )
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'gpt-4' }, { id: 'whisper-1' }] }),
      })

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'openai' })

      expect(r.ok).toBe(true)
      expect(r.message).toMatch(/Found 2 models available/i)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models')
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: 'Bearer sk-openai-test' },
      })
    })

    it('returns ok:false on non-200 response', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'sk-openai-bad'
      )
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Incorrect API key provided',
      })

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'openai' })

      expect(r.ok).toBe(false)
      expect(r.message).toMatch(/401/)
    })

    it('returns ok:false when fetch throws', async () => {
      const platformConfig = await import('@/lib/platform-config')
      ;(platformConfig.getIntegrationKey as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'sk-openai-test'
      )
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>
      fetchMock.mockRejectedValue(new Error('Network down'))

      const { testIntegrationKey } = await import('@/app/admin/integrations/actions')
      const r = await testIntegrationKey({ provider: 'openai' })

      expect(r.ok).toBe(false)
      expect(r.message).toMatch(/Network down/)
    })
  })
})
