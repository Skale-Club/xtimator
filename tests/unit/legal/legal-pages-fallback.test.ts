import { describe, it, expect, vi, beforeEach } from 'vitest'

const createServiceClient = vi.fn()
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => createServiceClient() }))

import { getLegalPage } from '@/lib/queries/legal-pages'
import { FALLBACK_LEGAL_PAGES, LEGAL_EFFECTIVE_DATE } from '@/lib/legal/fallback-content'

function clientReturning(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  }
  return { from: () => chain }
}

describe('getLegalPage', () => {
  beforeEach(() => {
    createServiceClient.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('falls back when the row is missing', async () => {
    createServiceClient.mockReturnValue(clientReturning({ data: null, error: null }))
    const page = await getLegalPage('privacy_policy')
    expect(page.content).toBe(FALLBACK_LEGAL_PAGES.privacy_policy.content)
    expect(page.effective_date).toBe(LEGAL_EFFECTIVE_DATE)
  })

  it('falls back when the read throws', async () => {
    createServiceClient.mockImplementation(() => {
      throw new Error('boom')
    })
    const page = await getLegalPage('terms_of_service')
    expect(page.title).toBe('Terms of Service')
  })

  it('falls back when the read errors or the client is unavailable', async () => {
    createServiceClient.mockReturnValue(clientReturning({ data: null, error: { message: 'x' } }))
    expect((await getLegalPage('privacy_policy')).id).toBe('privacy_policy')
    createServiceClient.mockReturnValue(null)
    expect((await getLegalPage('terms_of_service')).id).toBe('terms_of_service')
  })

  it('prefers the database row when present', async () => {
    const row = {
      id: 'privacy_policy',
      title: 'Custom',
      content: 'from db',
      effective_date: '2026-01-01',
      updated_at: '2026-01-01',
      updated_by_email: null,
    }
    createServiceClient.mockReturnValue(clientReturning({ data: row, error: null }))
    expect(await getLegalPage('privacy_policy')).toEqual(row)
  })
})

describe('fallback text', () => {
  it('has a real contact address, no placeholder and the deletion link', () => {
    for (const page of Object.values(FALLBACK_LEGAL_PAGES)) {
      expect(page.content).toContain('support@xtimator.com')
      expect(page.content).not.toContain('[your')
      expect(page.content).toContain('https://xtimator.com/delete-account')
    }
  })
})
