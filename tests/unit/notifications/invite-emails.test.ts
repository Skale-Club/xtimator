import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('re_test_key'),
  getBranding: vi.fn().mockResolvedValue({
    appName: 'Xtimator',
    logoUrl: 'https://example.com/logo.png',
    primaryColor: '#111111',
    emailFromName: null,
    siteTitle: null,
    metaDescription: null,
    ogImageUrl: null,
    canonicalBaseUrl: null,
    faviconUrl: null,
    landingContent: {} as never,
  }),
}))
vi.mock('@/lib/utils/site-url', () => ({
  getCanonicalBaseUrl: vi.fn().mockReturnValue('https://xtimator.com'),
}))

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ id: 'email-id' }),
}))
vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

import { sendInviteEmail } from '@/lib/email/invite-emails'
import { getIntegrationKey } from '@/lib/platform-config'

// Literal placeholder — NOT a real secret (no re_/sk_/whsec_ prefix).
const TOKEN = 'test-token-abc123'
const ACCEPT_LINK = `https://xtimator.com/invite/accept?token=${TOKEN}`

function baseCtx(overrides: Partial<Parameters<typeof sendInviteEmail>[0]> = {}) {
  return {
    toEmail: 'a@b.co',
    token: TOKEN,
    role: 'member' as const,
    companyName: 'ACME',
    inviterName: 'Jo',
    expiresAt: new Date('2026-07-02'),
    ...overrides,
  }
}

describe('sendInviteEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIntegrationKey).mockResolvedValue('re_test_key')
    sendMock.mockResolvedValue({ id: 'email-id' })
  })

  it('sends a single email with the absolute accept link in html and text', async () => {
    await sendInviteEmail(baseCtx())

    expect(sendMock).toHaveBeenCalledOnce()
    const call = sendMock.mock.calls[0]![0]
    expect(call.to).toBe('a@b.co')
    expect(call.html).toContain(ACCEPT_LINK)
    expect(call.html).toContain('ACME')
    expect(call.html).toContain('member')
    expect(call.text).toContain(ACCEPT_LINK)
  })

  it('confines the raw token to the accept link — never in the subject', async () => {
    await sendInviteEmail(baseCtx())

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain(ACCEPT_LINK)
    expect(call.subject).not.toContain(TOKEN)
  })

  it('skips silently when no Resend key is configured', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    await sendInviteEmail(baseCtx())
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('skips silently when toEmail is empty', async () => {
    await sendInviteEmail(baseCtx({ toEmail: '' }))
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('never throws even when Resend send rejects', async () => {
    sendMock.mockRejectedValueOnce(new Error('send failed'))
    await expect(sendInviteEmail(baseCtx())).resolves.toBeUndefined()
  })
})
