import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock sendWhatsAppWelcome so it doesn't hit the network
vi.mock('@/lib/whatsapp/send-welcome', () => ({
  sendWhatsAppWelcome: vi.fn().mockResolvedValue(undefined),
}))

import { syncOwnerPhone } from '@/lib/whatsapp/sync-owner-phone'
import { sendWhatsAppWelcome } from '@/lib/whatsapp/send-welcome'

function makeServiceClient(existingPhone: string | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingPhone ? { owner_phone: existingPhone } : null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })

  const from = vi.fn().mockReturnValue({ select, upsert })
  return { from, upsert, select, eq, maybeSingle }
}

describe('syncOwnerPhone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts the normalized owner phone and marks platform-managed WhatsApp active', async () => {
    const { from, upsert } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-1', '15551234567')

    expect(from).toHaveBeenCalledWith('company_whatsapp')
    expect(upsert).toHaveBeenCalledWith(
      { company_id: 'company-1', owner_phone: '+15551234567', status: 'active' },
      { onConflict: 'company_id' }
    )
  })

  it('sends welcome message when no previous phone exists', async () => {
    const { from } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-1', '+15551234567')

    expect(sendWhatsAppWelcome).toHaveBeenCalledWith('+15551234567')
  })

  it('sends welcome message when phone changes', async () => {
    const { from } = makeServiceClient('+15550000000')
    await syncOwnerPhone({ from } as never, 'company-1', '+15551234567')

    expect(sendWhatsAppWelcome).toHaveBeenCalledWith('+15551234567')
  })

  it('does NOT send welcome when phone is unchanged', async () => {
    const { from } = makeServiceClient('+15551234567')
    await syncOwnerPhone({ from } as never, 'company-1', '+15551234567')

    expect(sendWhatsAppWelcome).not.toHaveBeenCalled()
  })

  it('does NOT send welcome when phone is cleared', async () => {
    const { from } = makeServiceClient('+15551234567')
    await syncOwnerPhone({ from } as never, 'company-1', null)

    expect(sendWhatsAppWelcome).not.toHaveBeenCalled()
  })

  it('normalizes phone by adding + prefix', async () => {
    const { from, upsert } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-2', '447700900900')

    expect(upsert).toHaveBeenCalledWith(
      { company_id: 'company-2', owner_phone: '+447700900900', status: 'active' },
      { onConflict: 'company_id' }
    )
  })

  it('stores null for invalid / too-short phone', async () => {
    const { from, upsert } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-3', '123')

    expect(upsert).toHaveBeenCalledWith(
      { company_id: 'company-3', owner_phone: null, status: 'active' },
      { onConflict: 'company_id' }
    )
    expect(sendWhatsAppWelcome).not.toHaveBeenCalled()
  })
})
