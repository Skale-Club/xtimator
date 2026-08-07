import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 190 Plan 04 — URL-03: the ORIGIN-LESS consumers of the branding logo.
 *
 * After Plan 02 the branding logo is persisted as a same-origin path
 * (`/storage/platform-brand/...`). A mail client has no app origin to resolve
 * that against, and neither does a schema.org consumer — Google's rich-results
 * crawler reads `logo.url` verbatim and does NOT resolve it against the page.
 * Both must therefore be absolutized at the point the value leaves the app.
 *
 * The single most important assertion in this file is the sweep at the bottom:
 * NO branded email may ever emit `src="/…"`. That is the regression net for any
 * future email template, not just the three that exist today.
 *
 * Deliberately does NOT mock `@/lib/utils/site-url` — the precedence of
 * APP_ORIGIN > NEXT_PUBLIC_SITE_URL is part of the contract under test (a
 * hard-coded production domain would pass a mocked test and break staging).
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('re_test_key'),
  getBranding: vi.fn(),
  getWhatsAppDisplayNumber: vi.fn().mockResolvedValue(null),
}))

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ id: 'email-id' }),
}))
vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

// app/page.tsx pulls the whole landing tree; stub it — the JSON-LD is built
// before it and is the only thing under test here.
vi.mock('@/components/landing/landing-page', () => ({
  LandingPage: () => null,
}))

import { sendWelcomeEmail, sendProfileUpdatedEmail } from '@/lib/email/account-emails'
import { sendInviteEmail } from '@/lib/email/invite-emails'
import { sendNotificationDigestEmail } from '@/lib/email/notification-emails'
import { getBranding } from '@/lib/platform-config'
import RootPage from '@/app/page'
import { JsonLd } from '@/components/seo/json-ld'

const RELATIVE_LOGO = '/storage/platform-brand/logo-123.webp'
const ABSOLUTE_LOGO =
  'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/platform-brand/logo-123.webp'

const ORIGIN_KEYS = ['APP_ORIGIN', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL'] as const
let savedEnv: Record<string, string | undefined> = {}

function brandingWith(logoUrl: string | null) {
  return {
    appName: 'Xtimator',
    logoUrl,
    primaryColor: '#111111',
    emailFromName: null,
    siteTitle: null,
    metaDescription: 'AI estimates for service businesses',
    ogImageUrl: null,
    canonicalBaseUrl: null,
    faviconUrl: null,
    landingContent: { heroSubheadline: 'From voice note to estimate' } as never,
  }
}

function setBranding(logoUrl: string | null) {
  vi.mocked(getBranding).mockResolvedValue(brandingWith(logoUrl) as never)
}

/** Sends one of each branded email and returns the emitted HTML bodies. */
async function renderAllBrandedEmails(): Promise<Record<string, string>> {
  sendMock.mockClear()

  await sendWelcomeEmail({ toEmail: 'a@b.co', ownerName: 'Jo', companyName: 'ACME' })
  const welcome = sendMock.mock.calls.at(-1)![0].html as string

  await sendProfileUpdatedEmail({
    toEmail: 'a@b.co',
    ownerName: 'Jo',
    changes: [{ label: 'Phone', oldValue: '+1', newValue: '+2' }],
  })
  const profile = sendMock.mock.calls.at(-1)![0].html as string

  await sendInviteEmail({
    toEmail: 'a@b.co',
    token: 'tok_123',
    role: 'member',
    companyName: 'ACME',
    expiresAt: new Date('2026-09-01T00:00:00Z'),
  })
  const invite = sendMock.mock.calls.at(-1)![0].html as string

  const branding = await vi.mocked(getBranding)()
  await sendNotificationDigestEmail({
    toEmail: 'a@b.co',
    toName: 'Jo',
    branding: {
      logoUrl: branding.logoUrl,
      brandColor: '#111111',
      businessName: 'Xtimator',
    },
    items: [
      {
        category: 'estimate',
        title: 'New estimate',
        body: 'A body',
        createdAt: '2026-08-06T00:00:00Z',
      },
    ],
    groupedByCategory: false,
  })
  const digest = sendMock.mock.calls.at(-1)![0].html as string

  return { welcome, profile, invite, digest }
}

/** Walks the element tree returned by the page and returns the JsonLd `data`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findJsonLdData(node: any): any[] | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findJsonLdData(child)
      if (found) return found
    }
    return null
  }
  if (node.type === JsonLd) return node.props.data
  return findJsonLdData(node.props?.children)
}

describe('Phase 190 URL-03 — origin-less consumers of the branding logo', () => {
  beforeEach(() => {
    sendMock.mockClear()
    savedEnv = {}
    for (const key of ORIGIN_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    process.env.APP_ORIGIN = 'https://xtimator.com'
    setBranding(RELATIVE_LOGO)
  })

  afterEach(() => {
    for (const key of ORIGIN_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  describe('emails absolutize a same-origin logo path', () => {
    it('account welcome email: BOTH the header and the footer <img> are absolute', async () => {
      const { welcome } = await renderAllBrandedEmails()
      const srcs = [...welcome.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])

      expect(srcs).toHaveLength(2)
      expect(srcs.every((s) => s === 'https://xtimator.com/storage/platform-brand/logo-123.webp')).toBe(
        true,
      )
      // header (height:28px) and footer (height:24px) are both present
      expect(welcome).toContain(
        '<img src="https://xtimator.com/storage/platform-brand/logo-123.webp" alt="Xtimator" style="height:28px;display:inline-block;" />',
      )
      expect(welcome).toContain(
        '<img src="https://xtimator.com/storage/platform-brand/logo-123.webp" alt="Xtimator" style="height:24px;display:inline-block;margin-bottom:10px;" />',
      )
    })

    it('profile-updated email: both <img> tags are absolute', async () => {
      const { profile } = await renderAllBrandedEmails()
      const srcs = [...profile.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
      expect(srcs).toHaveLength(2)
      expect(new Set(srcs)).toEqual(
        new Set(['https://xtimator.com/storage/platform-brand/logo-123.webp']),
      )
    })

    it('invite email: both <img> tags are absolute', async () => {
      const { invite } = await renderAllBrandedEmails()
      const srcs = [...invite.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
      expect(srcs).toHaveLength(2)
      expect(new Set(srcs)).toEqual(
        new Set(['https://xtimator.com/storage/platform-brand/logo-123.webp']),
      )
    })

    it('notification digest email: the single header <img> is absolute', async () => {
      const { digest } = await renderAllBrandedEmails()
      const srcs = [...digest.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
      expect(srcs).toEqual(['https://xtimator.com/storage/platform-brand/logo-123.webp'])
    })
  })

  describe('existing absolute rows do not regress', () => {
    it('an absolute *.supabase.co logo is emitted BYTE-IDENTICALLY in every branded email', async () => {
      setBranding(ABSOLUTE_LOGO)
      const emails = await renderAllBrandedEmails()

      for (const [name, html] of Object.entries(emails)) {
        const srcs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
        expect(srcs.length, name).toBeGreaterThan(0)
        for (const src of srcs) expect(src, name).toBe(ABSOLUTE_LOGO)
      }
    })
  })

  describe('the no-logo fallback markup is untouched', () => {
    it('null logoUrl keeps the existing text fallbacks and emits no <img> at all', async () => {
      setBranding(null)
      const emails = await renderAllBrandedEmails()

      for (const [name, html] of Object.entries(emails)) {
        expect(html, name).not.toContain('<img')
      }
      // account/invite shell fallbacks
      expect(emails.welcome).toContain(
        '<span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Xtimator</span>',
      )
      expect(emails.welcome).toContain(
        '<div style="font-size:16px;font-weight:700;color:#333333;margin-bottom:10px;">Xtimator</div>',
      )
      expect(emails.invite).toContain(
        '<span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Xtimator</span>',
      )
      // notification digest fallback is its own <div>
      expect(emails.digest).toContain('<div style="font-weight:700;color:#fff;">Xtimator</div>')
    })
  })

  describe('the origin comes from the resolver, not a hard-coded domain', () => {
    it('falls back to NEXT_PUBLIC_SITE_URL when APP_ORIGIN is unset', async () => {
      delete process.env.APP_ORIGIN
      process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.example.test'

      const emails = await renderAllBrandedEmails()
      for (const [name, html] of Object.entries(emails)) {
        const srcs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1])
        expect(srcs.length, name).toBeGreaterThan(0)
        for (const src of srcs) {
          expect(src, name).toBe('https://staging.example.test/storage/platform-brand/logo-123.webp')
        }
      }
    })
  })

  describe('HTML escaping is unchanged — absolutize INSIDE, escape OUTSIDE', () => {
    it('an & in the logo path query string is still escaped to &amp;', async () => {
      setBranding('/storage/platform-brand/logo.webp?a=1&b=2')
      const emails = await renderAllBrandedEmails()

      for (const [name, html] of Object.entries(emails)) {
        expect(html, name).toContain(
          'src="https://xtimator.com/storage/platform-brand/logo.webp?a=1&amp;b=2"',
        )
        expect(html, name).not.toContain('logo.webp?a=1&b=2"')
      }
    })
  })

  describe('THE REGRESSION NET: no branded email may emit a relative src', () => {
    it('sweeps every branded email for src="/…" under relative, absolute and null logos', async () => {
      for (const logo of [RELATIVE_LOGO, ABSOLUTE_LOGO, null]) {
        setBranding(logo)
        const emails = await renderAllBrandedEmails()
        for (const [name, html] of Object.entries(emails)) {
          expect(html, `${name} (logo=${logo})`).not.toMatch(/src="\/[^/]/)
        }
      }
    })
  })

  describe('W1 — the organization JSON-LD emitted by app/page.tsx', () => {
    it('emits an ABSOLUTE logo url for a same-origin branding path', async () => {
      const element = await RootPage()
      const data = findJsonLdData(element)

      expect(data).not.toBeNull()
      const org = data!.find((d) => d['@type'] === 'Organization') as {
        logo?: { url?: string }
      }
      expect(org).toBeDefined()
      expect(org.logo?.url).toBe('https://xtimator.com/storage/platform-brand/logo-123.webp')
    })

    it('never emits the relative path verbatim in the serialized JSON-LD', async () => {
      const element = await RootPage()
      const data = findJsonLdData(element)
      const json = JSON.stringify(data)

      expect(json).toContain('https://xtimator.com/storage/platform-brand/logo-123.webp')
      expect(json).not.toContain('"' + RELATIVE_LOGO + '"')
    })

    it('leaves an already-absolute logo byte-identical', async () => {
      setBranding(ABSOLUTE_LOGO)
      const element = await RootPage()
      const data = findJsonLdData(element)
      const org = data!.find((d) => d['@type'] === 'Organization') as { logo?: { url?: string } }
      expect(org.logo?.url).toBe(ABSOLUTE_LOGO)
    })

    it('omits the logo entirely when branding has none (shaper behaviour preserved)', async () => {
      setBranding(null)
      const element = await RootPage()
      const data = findJsonLdData(element)
      const org = data!.find((d) => d['@type'] === 'Organization') as { logo?: unknown }
      expect(org.logo).toBeUndefined()
    })
  })
})
