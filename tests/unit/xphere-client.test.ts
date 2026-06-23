import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { XphereSyncPayload } from '@/lib/integrations/xphere/types'

// Mock the platform-config reader so we control whether Xphere is configured.
vi.mock('@/lib/platform-config', () => ({
  getXphereConfig: vi.fn(),
}))

import { getXphereConfig } from '@/lib/platform-config'
import { syncCompany } from '@/lib/integrations/xphere/client'

const mockGetXphereConfig = vi.mocked(getXphereConfig)

function makePayload(): XphereSyncPayload {
  return {
    source: 'xtimator',
    event: 'company.created',
    occurred_at: '2026-01-01T00:00:00.000Z',
    company: {
      id: 'company-uuid-1',
      name: 'Acme Landscaping',
      owner_name: 'Jane Doe',
      email: 'jane@acme.test',
      phone: '+15551234567',
      industry: 'landscaping',
      website: 'https://acme.test',
      address: '123 Main St',
      tags: ['xtimator:pro'],
      custom_fields: { xtimator_tier: 'pro' },
    },
    opportunity: {
      stage: 'Active — Pro',
      status: 'won',
      value: 0,
      title: 'Acme Landscaping — Subscription',
      pipeline: 'Xtimator Lifecycle',
    },
  }
}

describe('XPHERE-B3-CLIENT syncCompany', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('Test 1 (unconfigured): returns null and never calls fetch', async () => {
    mockGetXphereConfig.mockResolvedValue(null)

    const result = await syncCompany(makePayload())

    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('Test 2 (success): POSTs the payload to /api/v1/sync with Bearer auth and returns the response', async () => {
    mockGetXphereConfig.mockResolvedValue({
      apiKey: 'xph_test_key',
      baseUrl: 'https://crm.example.com',
    })
    const responseBody = {
      ok: true,
      account_id: 'a',
      contact_id: 'c',
      opportunity_id: 'o',
    }
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseBody,
    })

    const payload = makePayload()
    const result = await syncCompany(payload)

    expect(result).toEqual(responseBody)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://crm.example.com/api/v1/sync')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer xph_test_key')
    expect(init.body).toBe(JSON.stringify(payload))
  })

  it('Test 3 (non-2xx): throws an error whose message includes the status', async () => {
    mockGetXphereConfig.mockResolvedValue({
      apiKey: 'xph_test_key',
      baseUrl: 'https://crm.example.com',
    })
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    await expect(syncCompany(makePayload())).rejects.toThrow(/500/)
  })

  it('Test 4 (network error): rejects when fetch rejects', async () => {
    mockGetXphereConfig.mockResolvedValue({
      apiKey: 'xph_test_key',
      baseUrl: 'https://crm.example.com',
    })
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network down'),
    )

    await expect(syncCompany(makePayload())).rejects.toThrow(/network down/)
  })
})
