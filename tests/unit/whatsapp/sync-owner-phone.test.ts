import { describe, expect, it, vi, beforeEach } from 'vitest'
import { syncOwnerPhone } from '@/lib/whatsapp/sync-owner-phone'

function makeServiceClient(existingPhone: string | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: existingPhone ? { owner_phone: existingPhone } : null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select, upsert })
  return { from, upsert, select, eq, maybeSingle }
}

describe('syncOwnerPhone', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts the normalized owner phone and marks platform-managed WhatsApp active', async () => {
    const { from, upsert } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-1', '15551234567')

    expect(from).toHaveBeenCalledWith('company_whatsapp')
    // New phone (no prior row) → welcome_sent_at reset so first contact is welcomed.
    expect(upsert).toHaveBeenCalledWith(
      { company_id: 'company-1', owner_phone: '+15551234567', status: 'active', welcome_sent_at: null },
      { onConflict: 'company_id' }
    )
  })

  it('resets welcome_sent_at when the phone changes', async () => {
    const { from, upsert } = makeServiceClient('+15550000000')
    await syncOwnerPhone({ from } as never, 'company-1', '+15551234567')

    const payload = upsert.mock.calls[0]![0]
    expect(payload.owner_phone).toBe('+15551234567')
    expect(payload.welcome_sent_at).toBeNull()
  })

  it('does NOT touch welcome_sent_at when the phone is unchanged', async () => {
    const { from, upsert } = makeServiceClient('+15551234567')
    await syncOwnerPhone({ from } as never, 'company-1', '+15551234567')

    const payload = upsert.mock.calls[0]![0]
    expect(payload).toEqual({
      company_id: 'company-1',
      owner_phone: '+15551234567',
      status: 'active',
    })
    expect('welcome_sent_at' in payload).toBe(false)
  })

  it('normalizes a phone without + by adding the prefix', async () => {
    const { from, upsert } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-2', '447700900900')

    expect(upsert.mock.calls[0]![0].owner_phone).toBe('+447700900900')
  })

  it('stores null owner_phone for invalid/too-short input', async () => {
    const { from, upsert } = makeServiceClient(null)
    await syncOwnerPhone({ from } as never, 'company-3', '123')

    expect(upsert.mock.calls[0]![0].owner_phone).toBeNull()
  })

  it('clearing a previously-set phone counts as a change (resets welcome flag)', async () => {
    const { from, upsert } = makeServiceClient('+15551234567')
    await syncOwnerPhone({ from } as never, 'company-4', null)

    const payload = upsert.mock.calls[0]![0]
    expect(payload.owner_phone).toBeNull()
    expect(payload.welcome_sent_at).toBeNull()
  })
})
