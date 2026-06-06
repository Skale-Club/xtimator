import { describe, expect, it, vi, beforeEach } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: sendMock,
}))

import { claimWhatsAppWelcome, welcomeOnFirstContact } from '@/lib/whatsapp/send-welcome'

/**
 * The claim does:
 *   update(company_whatsapp).set(welcome_sent_at=now).eq(company_id).is(welcome_sent_at,null).select(company_id)
 * Returning a non-empty array => this caller won the race (first contact).
 */
function makeClient(returnedRows: unknown[] | null, error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data: returnedRows, error })
  const is = vi.fn().mockReturnValue({ select })
  const eq = vi.fn().mockReturnValue({ is })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { from, update, eq, is, select }
}

describe('claimWhatsAppWelcome', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when the row was flipped (first contact)', async () => {
    const { from } = makeClient([{ company_id: 'c1' }])
    const won = await claimWhatsAppWelcome({ from } as never, 'c1')
    expect(won).toBe(true)
  })

  it('returns false when already welcomed (no rows updated)', async () => {
    const { from } = makeClient([])
    const won = await claimWhatsAppWelcome({ from } as never, 'c1')
    expect(won).toBe(false)
  })

  it('returns false on DB error', async () => {
    const { from } = makeClient(null, { message: 'boom' })
    const won = await claimWhatsAppWelcome({ from } as never, 'c1')
    expect(won).toBe(false)
  })

  it('targets company_whatsapp scoped to the company and only-when-null', async () => {
    const { from, update, eq, is } = makeClient([{ company_id: 'c1' }])
    await claimWhatsAppWelcome({ from } as never, 'c1')
    expect(from).toHaveBeenCalledWith('company_whatsapp')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ welcome_sent_at: expect.any(String) })
    )
    expect(eq).toHaveBeenCalledWith('company_id', 'c1')
    expect(is).toHaveBeenCalledWith('welcome_sent_at', null)
  })
})

describe('welcomeOnFirstContact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the welcome message when the claim is won', async () => {
    const { from } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(true)
    expect(sendMock).toHaveBeenCalledOnce()
    const [to, body] = sendMock.mock.calls[0]!
    expect(to).toBe('+15551234567')
    expect(body.type).toBe('text')
    expect(body.text.body).toContain('Welcome to Xtimator')
  })

  it('does NOT send when already welcomed', async () => {
    const { from } = makeClient([])
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('never throws when the send fails', async () => {
    sendMock.mockRejectedValueOnce(new Error('network'))
    const { from } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(false)
  })
})
