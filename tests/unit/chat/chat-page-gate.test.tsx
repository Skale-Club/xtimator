/**
 * CHATMETER-02 — page-level entitlement gate (the conversion-preserving UX half).
 *
 * The chat page (app/(app)/chat/[[...id]]/page.tsx) reads its OWN active-company
 * tier (the active-company helper omits `tier` — a pitfall that would silently
 * fall back to free and block paying users) and:
 *   - free tier (getEntitlements('free').chatEnabled === false) → renders
 *     ChatUpgradePrompt (CTA → /settings/billing), NOT the chat.
 *   - pro tier (chatEnabled === true) → renders ChatWorkspace unchanged.
 *
 * The REAL @/lib/entitlements is used so the gate reads the actual chatEnabled
 * values; everything else (auth, service client, queries, ChatWorkspace) is
 * mocked. The page is an async RSC — we await it then render the element.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// i18n passthrough so copy assertions run on plain English.
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

// Auth: the page only reads userId for the owner-scoped queries.
vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: vi.fn(async () => ({ sub: 'user-1' })),
}))

// Active company: the trusted tenant id (cookie-resolved).
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(async () => 'company-1'),
}))

// Service client: a chainable builder whose .maybeSingle() resolves the tier
// row. `tierRow` is reassigned per-test before awaiting the page.
let tierRow: { tier?: string | null } | null = { tier: 'free' }
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => {
    const builder: Record<string, unknown> = {
      from: () => builder,
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: tierRow }),
    }
    return builder
  }),
}))

// Owner-scoped chat queries (only reached when entitled).
vi.mock('@/lib/queries/chat', () => ({
  listConversations: vi.fn(async () => []),
  getConversationWithMessages: vi.fn(async () => null),
}))

// History mapper passthrough.
vi.mock('@/lib/chat/history-mapper', () => ({
  toUIMessages: vi.fn(() => []),
}))

// ChatWorkspace → a sentinel so we can assert it was (not) reached.
vi.mock('@/components/chat/chat-workspace', () => ({
  ChatWorkspace: () => <div>WORKSPACE_SENTINEL</div>,
}))

import ChatPage from '@/app/(app)/chat/[[...id]]/page'

beforeEach(() => {
  tierRow = { tier: 'free' }
})

describe('Chat page entitlement gate (CHATMETER-02)', () => {
  it('free tier → renders the upgrade prompt (CTA → /settings/billing), NOT the workspace', async () => {
    tierRow = { tier: 'free' }
    const element = await ChatPage({ params: Promise.resolve({}) })
    const { container } = render(element)
    const html = container.innerHTML
    expect(html).toContain('/settings/billing')
    expect(html).toContain('Upgrade your plan')
    expect(html).not.toContain('WORKSPACE_SENTINEL')
  })

  it('pro tier → renders the chat workspace, NOT the upgrade prompt', async () => {
    tierRow = { tier: 'pro' }
    const element = await ChatPage({ params: Promise.resolve({}) })
    const { container } = render(element)
    const html = container.innerHTML
    expect(html).toContain('WORKSPACE_SENTINEL')
    expect(html).not.toContain('/settings/billing')
  })

  it('missing/unknown tier → falls back to free → upgrade prompt', async () => {
    tierRow = null
    const element = await ChatPage({ params: Promise.resolve({}) })
    const { container } = render(element)
    expect(container.innerHTML).toContain('/settings/billing')
    expect(container.innerHTML).not.toContain('WORKSPACE_SENTINEL')
  })
})
