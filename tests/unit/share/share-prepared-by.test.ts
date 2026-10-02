// @vitest-environment node
//
// "Prepared by" on the public share page must use the SAME rule as the PDF
// (lib/pdf/render-estimate-pdf.ts): company_members.display_name of the
// estimate's creator within the estimate's company, else company.owner_name.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { serviceClientMock } = vi.hoisted(() => ({ serviceClientMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientMock,
}))

import { getEstimateByShareToken, getEstimateByPublicToken } from '@/lib/queries/share'

type AnyRow = Record<string, unknown>

const memberEq = vi.fn()
let memberResult: { data: AnyRow | null } | Error = { data: null }

function installMock(estimateRow: AnyRow, companyRow: AnyRow) {
  memberEq.mockReset()
  serviceClientMock.from.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: estimateRow }) })),
        })),
      }
    }
    if (table === 'estimate_sections' || table === 'estimate_items' || table === 'estimate_photos') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })),
        })),
      }
    }
    if (table === 'projects') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { name: 'P', project_type: null, client_id: null, client: null },
            }),
          })),
        })),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: companyRow }) })),
        })),
      }
    }
    if (table === 'estimate_signatures') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })),
            })),
          })),
        })),
      }
    }
    if (table === 'company_members') {
      const chain = {
        select: vi.fn((cols: string) => {
          memberEq('select', cols)
          return chain
        }),
        eq: vi.fn((col: string, val: unknown) => {
          memberEq(col, val)
          return chain
        }),
        maybeSingle: vi.fn(async () => {
          if (memberResult instanceof Error) throw memberResult
          return memberResult
        }),
      }
      return chain
    }
    return { select: vi.fn() }
  })
}

const baseEstimate: AnyRow = {
  id: 'e1',
  project_id: 'p1',
  company_id: 'c1',
  total: 100,
  currency_code: 'USD',
  share_token: 'tok-SECRET',
  public_slug_token: 'short1',
  share_expires_at: null,
  created_by_user_id: 'u-staff',
}
const company: AnyRow = {
  id: 'c1', name: 'Co', owner_name: 'Owner Olive', phone: null, email: null, website: null,
  address: null, city: null, state: null, zip: null, logo_url: null, brand_primary_color: null,
  stripe_account_id: null, stripe_connect_status: null, digital_signature_enabled: false,
  estimate_terms_enabled: false, estimate_terms_text: null, estimate_template_style: 'classic',
}

describe.each([
  ['getEstimateByShareToken', () => getEstimateByShareToken('tok-SECRET')],
  ['getEstimateByPublicToken', () => getEstimateByPublicToken('short1')],
])('%s — preparedBy', (_name, load) => {
  beforeEach(() => {
    vi.clearAllMocks()
    memberResult = { data: null }
  })

  it('uses the creator\'s company_members.display_name, scoped to user AND company, selecting only display_name', async () => {
    memberResult = { data: { display_name: 'Sam Staff' } }
    installMock({ ...baseEstimate }, company)
    const result = await load()
    expect(result!.preparedBy).toBe('Sam Staff')
    expect(memberEq).toHaveBeenCalledWith('select', 'display_name')
    expect(memberEq).toHaveBeenCalledWith('user_id', 'u-staff')
    expect(memberEq).toHaveBeenCalledWith('company_id', 'c1')
  })

  it('falls back to company.owner_name when the member has no display_name', async () => {
    memberResult = { data: { display_name: null } }
    installMock({ ...baseEstimate }, company)
    expect((await load())!.preparedBy).toBe('Owner Olive')
  })

  it('falls back to owner_name when the lookup throws (non-fatal)', async () => {
    memberResult = new Error('boom')
    installMock({ ...baseEstimate }, company)
    expect((await load())!.preparedBy).toBe('Owner Olive')
  })

  it('skips the lookup entirely when the estimate has no created_by_user_id', async () => {
    installMock({ ...baseEstimate, created_by_user_id: null }, company)
    const result = await load()
    expect(result!.preparedBy).toBe('Owner Olive')
    expect(memberEq).not.toHaveBeenCalled()
  })

  it('is null when there is neither a member name nor an owner_name', async () => {
    installMock({ ...baseEstimate, created_by_user_id: null }, { ...company, owner_name: null })
    expect((await load())!.preparedBy).toBeNull()
  })
})
