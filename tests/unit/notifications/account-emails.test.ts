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
  getWhatsAppDisplayNumber: vi.fn().mockResolvedValue('+15551234567'),
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

import { sendWelcomeEmail, sendProfileUpdatedEmail, diffProfileFields } from '@/lib/email/account-emails'
import { getIntegrationKey, getBranding, getWhatsAppDisplayNumber } from '@/lib/platform-config'

describe('diffProfileFields', () => {
  it('returns no changes when nothing changed', () => {
    const before = { name: 'ACME', ownerName: 'Jo', phone: '+1555', email: 'a@b.co', website: 'x.com' }
    expect(diffProfileFields(before, { ...before })).toEqual([])
  })

  it('treats null (DB) and empty string (form) as equal — no phantom change', () => {
    // The bug: a company with null fields saving a form that submits '' for blanks.
    const before = { name: 'ACME', ownerName: null, phone: null, email: null, website: null }
    const after = { name: 'ACME', ownerName: '', phone: '', email: '', website: '' }
    expect(diffProfileFields(before, after)).toEqual([])
  })

  it('detects a real phone change', () => {
    const changes = diffProfileFields(
      { name: 'ACME', phone: '+15550000000' },
      { name: 'ACME', phone: '+15551112222' }
    )
    expect(changes).toEqual([
      { label: 'Phone', oldValue: '+15550000000', newValue: '+15551112222' },
    ])
  })

  it('detects setting a previously-null field and clearing a set field', () => {
    const changes = diffProfileFields(
      { ownerName: null, website: 'old.com' },
      { ownerName: 'New Owner', website: '' }
    )
    expect(changes).toEqual([
      { label: 'Owner name', oldValue: null, newValue: 'New Owner' },
      { label: 'Website', oldValue: 'old.com', newValue: null },
    ])
  })

  it('reports each changed field with its human label, in order', () => {
    const changes = diffProfileFields(
      { name: 'Old Co', ownerName: 'A', phone: '+1', email: 'a@x.co', website: 'a.com' },
      { name: 'New Co', ownerName: 'B', phone: '+2', email: 'b@x.co', website: 'b.com' }
    )
    expect(changes.map((c) => c.label)).toEqual([
      'Company name',
      'Owner name',
      'Phone',
      'Email',
      'Website',
    ])
  })
})

describe('sendWelcomeEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIntegrationKey).mockResolvedValue('re_test_key')
    vi.mocked(getBranding).mockResolvedValue({
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
    })
    vi.mocked(getWhatsAppDisplayNumber).mockResolvedValue('+15551234567')
    sendMock.mockResolvedValue({ id: 'email-id' })
  })

  it('sends welcome email to the right address with correct subject', async () => {
    await sendWelcomeEmail({
      toEmail: 'owner@example.com',
      ownerName: 'John',
      companyName: 'John Plumbing',
    })

    expect(sendMock).toHaveBeenCalledOnce()
    const call = sendMock.mock.calls[0]![0]
    expect(call.to).toBe('owner@example.com')
    expect(call.subject).toContain('Welcome to Xtimator')
  })

  it('includes owner name in the greeting', async () => {
    await sendWelcomeEmail({ toEmail: 'owner@example.com', ownerName: 'Maria', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('Maria')
    expect(call.text).toContain('Maria')
  })

  it('falls back to generic greeting when ownerName is absent', async () => {
    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('Hi there,')
    expect(call.text).toContain('Hi there,')
  })

  it('includes WhatsApp and dashboard references in the body', async () => {
    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('WhatsApp')
    expect(call.html).toContain('/dashboard')
    expect(call.text).toContain('WhatsApp')
  })

  it('renders a "Get Started on WhatsApp" wa.me button when a display number is set', async () => {
    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('https://wa.me/15551234567')
    expect(call.html).toContain('Get Started on WhatsApp')
    // Prefilled greeting is URL-encoded into the link
    expect(call.html).toContain('text=')
    expect(call.text).toContain('https://wa.me/15551234567')
  })

  it('omits the WhatsApp button gracefully when no display number is configured', async () => {
    vi.mocked(getWhatsAppDisplayNumber).mockResolvedValue(null)

    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).not.toContain('wa.me')
    expect(call.html).not.toContain('Get Started on WhatsApp')
    // Dashboard CTA still present so the email is never a dead end
    expect(call.html).toContain('/dashboard')
  })

  it('mentions bilingual (Portuguese) support when the WhatsApp section renders', async () => {
    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('Portuguese')
  })

  it('includes the logo URL in HTML when branding has one', async () => {
    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('https://example.com/logo.png')
  })

  it('falls back to text name when logo URL is null', async () => {
    vi.mocked(getBranding).mockResolvedValue({
      appName: 'Xtimator',
      logoUrl: null,
      primaryColor: '#111111',
      emailFromName: null,
      siteTitle: null,
      metaDescription: null,
      ogImageUrl: null,
      canonicalBaseUrl: null,
      faviconUrl: null,
      landingContent: {} as never,
    })

    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })

    const call = sendMock.mock.calls[0]![0]
    // Falls back to text in header; no img tag
    expect(call.html).not.toContain('<img src=')
    expect(call.html).toContain('Xtimator')
  })

  it('skips silently when toEmail is empty', async () => {
    await sendWelcomeEmail({ toEmail: '', companyName: 'ACME' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('skips when Resend key is not configured', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    await sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('never throws even when getBranding rejects', async () => {
    vi.mocked(getBranding).mockRejectedValue(new Error('branding down'))
    await expect(
      sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })
    ).resolves.toBeUndefined()
  })

  it('never throws even when Resend send rejects', async () => {
    sendMock.mockRejectedValue(new Error('send failed'))
    await expect(
      sendWelcomeEmail({ toEmail: 'owner@example.com', companyName: 'ACME' })
    ).resolves.toBeUndefined()
  })
})

describe('sendProfileUpdatedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getIntegrationKey).mockResolvedValue('re_test_key')
    vi.mocked(getBranding).mockResolvedValue({
      appName: 'Xtimator',
      logoUrl: null,
      primaryColor: '#111111',
      emailFromName: null,
      siteTitle: null,
      metaDescription: null,
      ogImageUrl: null,
      canonicalBaseUrl: null,
      faviconUrl: null,
      landingContent: {} as never,
    })
    sendMock.mockResolvedValue({ id: 'email-id' })
  })

  it('sends email with all changed fields visible', async () => {
    await sendProfileUpdatedEmail({
      toEmail: 'owner@example.com',
      ownerName: 'Jane',
      changes: [
        { label: 'Phone', oldValue: '+15550001111', newValue: '+15552223333' },
        { label: 'Company name', oldValue: 'Old Co', newValue: 'New Co' },
      ],
    })

    expect(sendMock).toHaveBeenCalledOnce()
    const call = sendMock.mock.calls[0]![0]
    expect(call.to).toBe('owner@example.com')
    expect(call.html).toContain('+15550001111')
    expect(call.html).toContain('+15552223333')
    expect(call.html).toContain('Old Co')
    expect(call.html).toContain('New Co')
  })

  it('escapes HTML in field values to prevent XSS', async () => {
    await sendProfileUpdatedEmail({
      toEmail: 'owner@example.com',
      changes: [
        { label: 'Name', oldValue: 'Old', newValue: '<script>alert("xss")</script>' },
      ],
    })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).not.toContain('<script>')
    expect(call.html).toContain('&lt;script&gt;')
  })

  it('includes a settings link so the user can review', async () => {
    await sendProfileUpdatedEmail({
      toEmail: 'owner@example.com',
      changes: [{ label: 'Phone', oldValue: null, newValue: '+15551234567' }],
    })

    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('/settings')
  })

  it('handles null old/new values gracefully', async () => {
    await sendProfileUpdatedEmail({
      toEmail: 'owner@example.com',
      changes: [
        { label: 'Website', oldValue: null, newValue: 'https://example.com' },
        { label: 'Email', oldValue: 'old@example.com', newValue: null },
      ],
    })

    expect(sendMock).toHaveBeenCalledOnce()
    const call = sendMock.mock.calls[0]![0]
    expect(call.html).toContain('https://example.com')
  })

  it('skips silently when changes array is empty', async () => {
    await sendProfileUpdatedEmail({ toEmail: 'owner@example.com', changes: [] })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('skips when toEmail is empty', async () => {
    await sendProfileUpdatedEmail({
      toEmail: '',
      changes: [{ label: 'Phone', oldValue: null, newValue: '+1555' }],
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('skips when Resend key is not configured', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)
    await sendProfileUpdatedEmail({
      toEmail: 'owner@example.com',
      changes: [{ label: 'Phone', oldValue: null, newValue: '+1555' }],
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('never throws even when getBranding rejects', async () => {
    vi.mocked(getBranding).mockRejectedValue(new Error('down'))
    await expect(
      sendProfileUpdatedEmail({
        toEmail: 'owner@example.com',
        changes: [{ label: 'Phone', oldValue: null, newValue: '+1555' }],
      })
    ).resolves.toBeUndefined()
  })
})
