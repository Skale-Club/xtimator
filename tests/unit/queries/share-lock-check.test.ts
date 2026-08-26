// @vitest-environment node
//
// Phase 193-02 — getShareLockCheck / getShareLockCheckByPublicToken
// (lib/queries/share.ts). These are the lightweight, PII-free lookups the
// public share pages run BEFORE any full estimate fetch — asserting the
// exact object shape here is what proves no project/client/totals data can
// leak through the lock gate.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const { serviceClientMock } = vi.hoisted(() => ({ serviceClientMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientMock,
}))

import { getShareLockCheck, getShareLockCheckByPublicToken } from '@/lib/queries/share'

type Row = Record<string, unknown> | null

function installMock(estimateRow: Row, companyRow: Row = null) {
  serviceClientMock.from.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: estimateRow }),
          })),
        })),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: companyRow }),
          })),
        })),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getShareLockCheck', () => {
  it('returns { status: "missing" } for an unknown token', async () => {
    installMock(null)
    expect(await getShareLockCheck('nope')).toEqual({ status: 'missing' })
  })

  it('returns { status: "expired" } for a past share_expires_at', async () => {
    installMock({
      share_token: 'tok-1',
      company_id: 'co-1',
      share_password_hash: null,
      share_expires_at: '2000-01-01T00:00:00.000Z',
      language: 'en',
    })
    expect(await getShareLockCheck('tok-1')).toEqual({ status: 'expired' })
  })

  it('an OPEN link (no password) never queries companies -- branding stays empty', async () => {
    installMock({
      share_token: 'tok-1',
      company_id: 'co-1',
      share_password_hash: null,
      share_expires_at: null,
      language: 'en',
    })

    const result = await getShareLockCheck('tok-1')

    expect(result).toEqual({
      status: 'ok',
      shareToken: 'tok-1',
      passwordHash: null,
      branding: { companyName: '', logoUrl: null, brandColor: null },
      language: 'en',
    })
    expect(serviceClientMock.from).not.toHaveBeenCalledWith('companies')
  })

  it('a LOCKED link resolves branding fields only -- exact object shape, no PII/totals fields present', async () => {
    installMock(
      {
        share_token: 'tok-1',
        company_id: 'co-1',
        share_password_hash: 'saltvalue$hashvalue',
        share_expires_at: null,
        language: 'pt',
      },
      { name: 'Acme Co', logo_url: 'https://example.com/logo.png', brand_primary_color: '#112233' }
    )

    const result = await getShareLockCheck('tok-1')

    expect(result).toEqual({
      status: 'ok',
      shareToken: 'tok-1',
      passwordHash: 'saltvalue$hashvalue',
      branding: {
        companyName: 'Acme Co',
        logoUrl: 'https://example.com/logo.png',
        brandColor: '#112233',
      },
      language: 'pt',
    })
    // The whole point of this lightweight path: it must never reach into
    // sections/items/project/client tables.
    expect(serviceClientMock.from).not.toHaveBeenCalledWith('estimate_sections')
    expect(serviceClientMock.from).not.toHaveBeenCalledWith('estimate_items')
    expect(serviceClientMock.from).not.toHaveBeenCalledWith('projects')
  })

  it('defaults language to "en" when the row has a null language', async () => {
    installMock({
      share_token: 'tok-1',
      company_id: 'co-1',
      share_password_hash: null,
      share_expires_at: null,
      language: null,
    })
    const result = await getShareLockCheck('tok-1')
    expect(result).toMatchObject({ status: 'ok', language: 'en' })
  })
})

describe('getShareLockCheckByPublicToken', () => {
  it('resolves the estimate by public_slug_token and surfaces the REAL share_token for cookie binding', async () => {
    installMock({
      share_token: 'real-share-token',
      company_id: 'co-1',
      share_password_hash: 'salt$hash',
      share_expires_at: null,
      language: 'es',
    }, { name: 'Acme', logo_url: null, brand_primary_color: null })

    const result = await getShareLockCheckByPublicToken('short-tok')

    expect(result).toMatchObject({ status: 'ok', shareToken: 'real-share-token' })
  })

  it('returns { status: "missing" } for an unknown short token', async () => {
    installMock(null)
    expect(await getShareLockCheckByPublicToken('nope')).toEqual({ status: 'missing' })
  })
})
