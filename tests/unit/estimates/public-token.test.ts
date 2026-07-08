import { describe, expect, it, vi, beforeEach } from 'vitest'

const { serviceClientMock } = vi.hoisted(() => ({ serviceClientMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientMock,
}))

import { getEstimateByPublicToken, getShareLinkStateByPublicToken } from '@/lib/queries/share'

type AnyRow = Record<string, unknown>

interface MockConfig {
  estimateRow?: AnyRow | null
  sections?: AnyRow[]
  projectRow?: AnyRow | null
  companyRow?: AnyRow | null
  stateRow?: AnyRow | null
}

// Captures the column lists passed to .select() per table for assertions.
const selectCols: Record<string, string> = {}

function installMock(cfg: MockConfig) {
  selectCols.companies = ''
  serviceClientMock.from.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn((cols: string) => {
          selectCols.estimates = cols
          return {
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: cfg.estimateRow ?? null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: cfg.stateRow ?? null }),
            })),
          }
        }),
      }
    }
    if (table === 'estimate_sections') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: cfg.sections ?? [] }) })),
        })),
      }
    }
    if (table === 'estimate_items') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
        })),
      }
    }
    if (table === 'projects') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: cfg.projectRow ?? null }) })),
        })),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn((cols: string) => {
          selectCols.companies = cols
          return {
            eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: cfg.companyRow ?? null }) })),
          }
        }),
      }
    }
    if (table === 'estimate_photos') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
        })),
      }
    }
    return { select: vi.fn() }
  })
}

const validEstimate: AnyRow = {
  id: 'e1',
  project_id: 'p1',
  company_id: 'c1',
  total: 100,
  currency_code: 'USD',
  summary: 'Job summary',
  share_token: 'tok-SECRET',
  public_slug_token: 'shorttok123',
  share_expires_at: null,
  payment_status: 'unpaid',
}

const validProject: AnyRow = {
  name: 'Kitchen Remodel',
  project_type: null,
  client: { name: 'Client', email: 'client@x.co', phone: '+15550001111', address: null, city: null, state: null, zip: null },
}

const validCompany: AnyRow = {
  id: 'c1', name: 'Co', owner_name: 'Owner', phone: '+15552223333', email: 'co@x.co',
  website: null, address: null, city: null, state: null, zip: null, logo_url: null,
  brand_primary_color: null, stripe_account_id: null, stripe_connect_status: null,
  digital_signature_enabled: false, estimate_terms_enabled: false, estimate_terms_text: null,
}

describe('getEstimateByPublicToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('strips internal fields (share_token) from the returned estimate', async () => {
    installMock({ estimateRow: { ...validEstimate }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByPublicToken('shorttok123')

    expect(result).not.toBeNull()
    expect('share_token' in result!.estimate).toBe(false)
    // Fields the document needs are preserved
    expect(result!.estimate.id).toBe('e1')
    expect(result!.estimate.summary).toBe('Job summary')
  })

  it('returns realShareToken equal to the row\'s ACTUAL share_token (not the shortToken)', async () => {
    installMock({ estimateRow: { ...validEstimate }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByPublicToken('shorttok123')

    expect(result).not.toBeNull()
    expect(result!.realShareToken).toBe('tok-SECRET')
    expect(result!.realShareToken).not.toBe('shorttok123')
  })

  it('does NOT over-fetch internal company prefs (notify_on_*) into the public payload', async () => {
    installMock({ estimateRow: { ...validEstimate }, sections: [], projectRow: validProject, companyRow: validCompany })
    await getEstimateByPublicToken('shorttok123')
    expect(selectCols.companies).not.toContain('notify_on')
  })

  it('returns null for an EXPIRED link (serves no PII)', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    installMock({ estimateRow: { ...validEstimate, share_expires_at: past }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByPublicToken('shorttok123')
    expect(result).toBeNull()
  })

  it('returns data for a link expiring in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    installMock({ estimateRow: { ...validEstimate, share_expires_at: future }, sections: [], projectRow: validProject, companyRow: validCompany })
    const result = await getEstimateByPublicToken('shorttok123')
    expect(result).not.toBeNull()
  })

  it('returns null when the shortToken is unknown', async () => {
    installMock({ estimateRow: null })
    const result = await getEstimateByPublicToken('nope')
    expect(result).toBeNull()
  })
})

describe('getShareLinkStateByPublicToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns "missing" for an unknown shortToken', async () => {
    installMock({ stateRow: null })
    expect(await getShareLinkStateByPublicToken('nope')).toBe('missing')
  })

  it('returns "expired" when share_expires_at is in the past', async () => {
    installMock({ stateRow: { share_expires_at: new Date(Date.now() - 1000).toISOString() } })
    expect(await getShareLinkStateByPublicToken('shorttok123')).toBe('expired')
  })

  it('returns "active" when not expired (or null expiry)', async () => {
    installMock({ stateRow: { share_expires_at: null } })
    expect(await getShareLinkStateByPublicToken('shorttok123')).toBe('active')
  })
})
