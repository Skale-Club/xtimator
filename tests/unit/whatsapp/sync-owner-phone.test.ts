import { describe, expect, it, vi } from 'vitest'
import { syncOwnerPhone } from '@/lib/whatsapp/sync-owner-phone'

describe('syncOwnerPhone', () => {
  it('upserts the normalized owner phone and marks platform-managed WhatsApp active', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const serviceClient = {
      from: vi.fn().mockReturnValue({ upsert }),
    } as never

    await syncOwnerPhone(serviceClient, 'company-1', '15551234567')

    expect(serviceClient.from).toHaveBeenCalledWith('company_whatsapp')
    expect(upsert).toHaveBeenCalledWith(
      {
        company_id: 'company-1',
        owner_phone: '+15551234567',
        status: 'active',
      },
      { onConflict: 'company_id' }
    )
  })
})
