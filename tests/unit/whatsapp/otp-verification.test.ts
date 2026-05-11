import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ----- Mocks -----
const sendWhatsAppMessageMock = vi.fn()
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessageMock(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// In-memory DB row keyed by companyId (only one row at a time in this test)
let stored: Record<string, unknown> | null = null

function makeSupabase() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { id: 'company-1' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'company_whatsapp') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: stored, error: stored ? null : { code: 'PGRST116' } }),
            }),
          }),
          upsert: (data: Record<string, unknown>) => {
            stored = { ...stored, ...data }
            return Promise.resolve({ error: null })
          },
          update: (data: Record<string, unknown>) => ({
            eq: () => {
              stored = stored ? { ...stored, ...data } : { ...data }
              return Promise.resolve({ error: null })
            },
          }),
          delete: () => ({
            eq: () => {
              stored = null
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

const createClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}))

import {
  requestWhatsAppVerification,
  confirmWhatsAppVerification,
} from '@/lib/actions/whatsapp-settings'

beforeEach(() => {
  stored = null
  sendWhatsAppMessageMock.mockReset()
  sendWhatsAppMessageMock.mockResolvedValue(undefined)
  createClientMock.mockReset()
  createClientMock.mockReturnValue(makeSupabase())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('requestWhatsAppVerification', () => {
  it('stores pending row + sends 6-digit code via WhatsApp', async () => {
    const r = await requestWhatsAppVerification({
      phoneNumber: '+15551234567',
      phoneNumberId: 'p-id',
      wabaId: 'waba-id',
    })
    expect(r.ok).toBe(true)
    expect(stored).not.toBeNull()
    expect(stored!.status).toBe('pending')
    expect(stored!.verification_code).toMatch(/^\d{6}$/)
    expect(stored!.verification_attempts).toBe(0)
    expect(stored!.verification_expires_at).toBeTruthy()

    // Code was sent via WhatsApp
    expect(sendWhatsAppMessageMock).toHaveBeenCalledOnce()
    const [to, payload] = sendWhatsAppMessageMock.mock.calls[0]
    expect(to).toBe('+15551234567')
    expect(payload.text.body).toContain(stored!.verification_code as string)
  })

  it('rolls back the row when WhatsApp send fails', async () => {
    sendWhatsAppMessageMock.mockRejectedValueOnce(new Error('meta down'))
    const r = await requestWhatsAppVerification({
      phoneNumber: '+15551234567',
      phoneNumberId: 'p-id',
      wabaId: 'waba-id',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Could not send')
    expect(stored).toBeNull()
  })
})

describe('confirmWhatsAppVerification', () => {
  async function setupPending(code = '123456'): Promise<void> {
    stored = {
      status: 'pending',
      verification_code: code,
      verification_attempts: 0,
      verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
  }

  it('activates when code matches', async () => {
    await setupPending('555444')
    const r = await confirmWhatsAppVerification('555444')
    expect(r.ok).toBe(true)
    expect(stored!.status).toBe('active')
    expect(stored!.verification_code).toBeNull()
    expect(stored!.verification_attempts).toBe(0)
    expect(stored!.verified_at).toBeTruthy()
  })

  it('trims whitespace from input code', async () => {
    await setupPending('123456')
    const r = await confirmWhatsAppVerification('  123456  ')
    expect(r.ok).toBe(true)
  })

  it('increments attempts on wrong code and reports remaining', async () => {
    await setupPending('111111')
    const r = await confirmWhatsAppVerification('222222')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('attempts remaining')
    expect(stored!.verification_attempts).toBe(1)
  })

  it('wipes row after 3 wrong attempts', async () => {
    await setupPending('111111')
    await confirmWhatsAppVerification('222222')
    await confirmWhatsAppVerification('333333')
    const r3 = await confirmWhatsAppVerification('444444')
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.error).toContain('Too many')
    expect(stored).toBeNull()
  })

  it('rejects + wipes row when code is expired', async () => {
    stored = {
      status: 'pending',
      verification_code: '123456',
      verification_attempts: 0,
      verification_expires_at: new Date(Date.now() - 1000).toISOString(),
    }
    const r = await confirmWhatsAppVerification('123456')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('expired')
    expect(stored).toBeNull()
  })

  it('rejects when no pending verification exists', async () => {
    stored = null
    const r = await confirmWhatsAppVerification('123456')
    expect(r.ok).toBe(false)
  })

  it('rejects when row is not in pending status (already active)', async () => {
    stored = { status: 'active', verification_code: null }
    const r = await confirmWhatsAppVerification('123456')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('No verification in progress')
  })
})
