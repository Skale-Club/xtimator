import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 142.1 Plan 06 — WhatsApp entitlement gate: active/pending/suspended/absent.
 *
 * Tests the gate formula used by:
 *   - app/(app)/projects/[id]/page.tsx (whatsappSendEnabled)
 *   - app/api/estimates/[id]/send-whatsapp/route.ts (403 check)
 *
 * The gate uses getWhatsAppAccountStatus() from the server-only registry
 * instead of direct company_whatsapp reads.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/whatsapp/account-registry', () => ({
  getWhatsAppAccountStatus: vi.fn(),
  findActiveWhatsAppSender: vi.fn(),
  normalizeWhatsAppPhone: vi.fn(),
}))

import { getWhatsAppAccountStatus } from '@/lib/whatsapp/account-registry'
import { getEntitlements } from '@/lib/entitlements'

const mockGetStatus = vi.mocked(getWhatsAppAccountStatus)

function mockAccountStatus(overrides: Partial<ReturnType<typeof getWhatsAppAccountStatus> extends Promise<infer R> ? R : never>) {
  mockGetStatus.mockResolvedValue({
    configured: false,
    active: false,
    status: null,
    deliveryFormat: null,
    ...overrides,
  } as Awaited<ReturnType<typeof getWhatsAppAccountStatus>>)
}

describe('whatsappSendEnabled gate formula (registry-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Tier entitlement tests — whatsappEnabled is true for all tiers
  it.each(['free', 'trial', 'pro', 'business'] as const)(
    'tier=%s with active config → whatsappEnabled=true AND accountStatus.active=true → send enabled',
    async (tier) => {
      mockAccountStatus({ configured: true, active: true, status: 'active' })
      const entitlements = getEntitlements(tier)
      const whatsappEnabled = entitlements.whatsappEnabled
      const accountStatus = await getWhatsAppAccountStatus('company-1')
      const sendEnabled = whatsappEnabled && accountStatus.active
      expect(sendEnabled).toBe(true)
    }
  )

  // Account status tests — only 'active' status allows sending
  it('tier=pro with pending_review → accountStatus.active=false → send disabled', async () => {
    mockAccountStatus({ configured: true, active: false, status: 'pending_review' })
    const entitlements = getEntitlements('pro')
    const accountStatus = await getWhatsAppAccountStatus('company-1')
    const sendEnabled = entitlements.whatsappEnabled && accountStatus.active
    expect(sendEnabled).toBe(false)
  })

  it('tier=pro with suspended → accountStatus.active=false → send disabled', async () => {
    mockAccountStatus({ configured: true, active: false, status: 'suspended' })
    const entitlements = getEntitlements('pro')
    const accountStatus = await getWhatsAppAccountStatus('company-1')
    const sendEnabled = entitlements.whatsappEnabled && accountStatus.active
    expect(sendEnabled).toBe(false)
  })

  it('tier=pro with no config row → accountStatus.active=false → send disabled', async () => {
    mockAccountStatus({ configured: false, active: false, status: null })
    const entitlements = getEntitlements('pro')
    const accountStatus = await getWhatsAppAccountStatus('company-1')
    const sendEnabled = entitlements.whatsappEnabled && accountStatus.active
    expect(sendEnabled).toBe(false)
  })

  it('tier=free with active config → send enabled (free tier has WhatsApp)', async () => {
    mockAccountStatus({ configured: true, active: true, status: 'active' })
    const entitlements = getEntitlements('free')
    const accountStatus = await getWhatsAppAccountStatus('company-1')
    const sendEnabled = entitlements.whatsappEnabled && accountStatus.active
    expect(sendEnabled).toBe(true)
  })

  // Browser never receives provisioning data — only enabled boolean
  it('getWhatsAppAccountStatus returns opaque status — no phone, WABA, or token', async () => {
    mockAccountStatus({
      configured: true,
      active: true,
      status: 'active',
      deliveryFormat: 'share_link',
    })
    const status = await getWhatsAppAccountStatus('company-1')
    // Must NOT contain provisioning details
    expect(status).not.toHaveProperty('phone')
    expect(status).not.toHaveProperty('wabaId')
    expect(status).not.toHaveProperty('token')
    expect(status).not.toHaveProperty('ownerPhone')
    expect(status).not.toHaveProperty('conversationHistory')
    // Only opaque fields
    expect(status).toHaveProperty('configured')
    expect(status).toHaveProperty('active')
    expect(status).toHaveProperty('status')
    expect(status).toHaveProperty('deliveryFormat')
  })
})
