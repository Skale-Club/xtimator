import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Phase 77 plan 06 — Branded digest email tests (NOTIF-07 + NOTIF-12).
 *
 * Covers:
 *  - No Resend key → log warn, no send, no throw
 *  - items.length === 0 → no-op (no Resend call)
 *  - Single-item path → subject is the single title
 *  - Multi-item grouped path → subject "[N] new notifications", body contains all titles + category headers
 *  - Resend throwing → caught, logged, no rethrow (best-effort)
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
  getBranding: vi.fn().mockResolvedValue({
    appName: 'Xtimator',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColor: '#FF5500',
    emailFromName: 'Xtimator',
  }),
}))

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ id: 'em_1' }),
}))
vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

import {
  sendNotificationDigestEmail,
  type DigestEmailContext,
} from '@/lib/email/notification-emails'
import { getIntegrationKey } from '@/lib/platform-config'

const baseBranding = {
  logoUrl: 'https://cdn.example.com/logo.png',
  brandColor: '#FF5500',
  businessName: 'Xtimator',
}

function ctx(overrides: Partial<DigestEmailContext> = {}): DigestEmailContext {
  return {
    toEmail: 'user@example.com',
    toName: 'Test User',
    branding: baseBranding,
    items: [
      {
        category: 'estimate',
        title: 'Estimate viewed',
        body: 'Acme Co viewed your estimate',
        linkUrl: '/estimates/abc',
        createdAt: '2026-05-20T10:00:00Z',
      },
    ],
    groupedByCategory: false,
    ...overrides,
  }
}

describe('sendNotificationDigestEmail (NOTIF-07)', () => {
  beforeEach(() => {
    sendMock.mockClear()
    vi.mocked(getIntegrationKey).mockReset()
  })

  it('skips send + warns when Resend key is missing', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(sendNotificationDigestEmail(ctx())).resolves.toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('no-ops when items.length === 0', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('rk_test_x')

    await sendNotificationDigestEmail(ctx({ items: [] }))
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('uses single-item subject when items.length === 1', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('rk_test_x')

    await sendNotificationDigestEmail(ctx())
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0]![0] as { subject: string; html: string }
    expect(arg.subject).toBe('Estimate viewed')
    expect(arg.html).toContain('Acme Co viewed your estimate')
    expect(arg.html).toContain('/estimates/abc')
  })

  it('uses "[N] new notifications" subject + grouped sections for multi-item', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('rk_test_x')

    await sendNotificationDigestEmail(
      ctx({
        groupedByCategory: true,
        items: [
          {
            category: 'estimate',
            title: 'Estimate viewed A',
            body: 'b1',
            createdAt: '2026-05-20T10:00:00Z',
          },
          {
            category: 'estimate',
            title: 'Estimate viewed B',
            body: 'b2',
            createdAt: '2026-05-20T10:05:00Z',
          },
          {
            category: 'payment',
            title: 'Payment received',
            body: 'b3',
            createdAt: '2026-05-20T10:10:00Z',
          },
          {
            category: 'payment',
            title: 'Payment refunded',
            body: 'b4',
            createdAt: '2026-05-20T10:15:00Z',
          },
        ],
      }),
    )
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0]![0] as { subject: string; html: string }
    expect(arg.subject).toBe('4 new notifications')
    expect(arg.html).toContain('Estimate viewed A')
    expect(arg.html).toContain('Estimate viewed B')
    expect(arg.html).toContain('Payment received')
    expect(arg.html).toContain('Payment refunded')
    // brand color applied somewhere in the template
    expect(arg.html).toContain('#FF5500')
    // logo present
    expect(arg.html).toContain('https://cdn.example.com/logo.png')
  })

  it('swallows Resend send errors (best-effort, never throws)', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('rk_test_x')
    const err = new Error('Resend 500')
    sendMock.mockRejectedValueOnce(err)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(sendNotificationDigestEmail(ctx())).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
