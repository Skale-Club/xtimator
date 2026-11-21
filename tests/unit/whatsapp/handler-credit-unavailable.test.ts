import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Owner decision: paid AI fails CLOSED when the credit balance cannot be read.
 * The WhatsApp estimate path must answer with a plain "try again" (in the
 * owner's language, never the out-of-credits message), log it like the other
 * bot replies, create no draft project and dispatch nothing to Inngest.
 */

const mockCheckCredits = vi.fn()
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: (...args: unknown[]) => mockCheckCredits(...args),
}))
vi.mock('@/lib/billing/estimated-credits', () => ({
  getEstimatedCredits: async () => 100,
}))

const mockCreditBlockState = vi.fn()
vi.mock('@/lib/billing/access-guard', () => ({
  creditBlockState: (...args: unknown[]) => mockCreditBlockState(...args),
  billingCreateDenied: vi.fn().mockResolvedValue(null),
}))

const mockInngestSend = vi.fn().mockResolvedValue({ ids: ['evt-1'] })
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))
vi.mock('@/lib/entitlements-server', () => ({ getEntitlementsForTier: vi.fn() }))
vi.mock('@/lib/services/generate-estimate', () => ({ generateEstimateForProject: vi.fn() }))
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue('wamid.out'),
  downloadWhatsAppMedia: vi.fn(),
  markMessageAsRead: vi.fn().mockResolvedValue(undefined),
  sendTypingIndicator: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/whatsapp/confirm', () => ({ processConfirmationReply: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn() }))
const mockLogOutbound = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: (...args: unknown[]) => mockLogOutbound(...args),
}))
let ownerLanguage: 'en' | 'pt' | 'es' = 'en'
vi.mock('@/lib/whatsapp/owner-language', () => ({
  resolveOwnerLanguage: async () => ownerLanguage,
}))

import { processInboundMessages } from '@/lib/whatsapp/handler'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const mockSend = vi.mocked(sendWhatsAppMessage)
const mockGetEntitlements = vi.mocked(getEntitlementsForTier)

const TEXT_MSG: WhatsAppMessage = {
  id: 'wamid.text1',
  from: '15551234567',
  timestamp: '0',
  type: 'text',
  text: { body: 'kitchen reno' },
}

function makeSupabase() {
  const projectInsert = vi.fn().mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: 'project-wa-1' }, error: null }) }),
  })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { tier: 'pro' }, error: null }) }),
        }),
      }
    }
    if (table === 'projects') return { insert: projectInsert }
    return { insert: vi.fn().mockResolvedValue({ error: null }) }
  })
  return { client: { from } as never, projectInsert }
}

function sentBody(): string {
  const payload = mockSend.mock.calls[0][1] as { text: { body: string } }
  return payload.text.body
}

describe('WhatsApp estimate path: unreadable credit balance fails closed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ownerLanguage = 'en'
    mockGetEntitlements.mockResolvedValue({ whatsappEnabled: true } as never)
    mockSend.mockResolvedValue('wamid.out' as never)
  })

  it('asks checkCredits to fail closed', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: true, balance: 1000, shortfall: 0 })
    const { client } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    expect(mockCheckCredits).toHaveBeenCalledWith(client, 'company-1', 100, { failClosed: true })
  })

  it('unavailable: plain retry reply, logged, no draft project, nothing dispatched', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100, unavailable: true })
    const { client, projectInsert } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)

    expect(mockSend).toHaveBeenCalledTimes(1)
    const body = sentBody()
    expect(body).toMatch(/try again/i)
    expect(body).not.toMatch(/credits|subscribe|settings\/billing/i)
    expect(mockCreditBlockState).not.toHaveBeenCalled()
    expect(mockLogOutbound).toHaveBeenCalledTimes(1)
    expect(mockLogOutbound.mock.calls[0][1]).toMatchObject({ companyId: 'company-1', body, status: 'sent' })
    expect(projectInsert).not.toHaveBeenCalled()
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('unavailable: the retry reply follows the owner language (pt)', async () => {
    ownerLanguage = 'pt'
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100, unavailable: true })
    const { client } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    expect(sentBody()).toMatch(/Tente de novo/)
  })

  it('a re-check that comes back unavailable also gets the retry reply, not the credits message', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100 })
    mockCreditBlockState.mockResolvedValue('unavailable')
    const { client } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    expect(sentBody()).toMatch(/try again/i)
    expect(sentBody()).not.toMatch(/credits/i)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })

  it('a real out-of-credits block still gets the credits message', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100 })
    mockCreditBlockState.mockResolvedValue('out_of_credits')
    const { client } = makeSupabase()
    await processInboundMessages([TEXT_MSG], 'company-1', '15551234567', client)
    expect(sentBody()).toMatch(/out of credits/i)
    expect(mockInngestSend).not.toHaveBeenCalled()
  })
})
