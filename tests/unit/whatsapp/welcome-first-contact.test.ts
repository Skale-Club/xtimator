import { describe, expect, it, vi, beforeEach } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: sendMock,
}))

import {
  buildWelcomeMessage,
  claimWhatsAppWelcome,
  welcomeOnFirstContact,
} from '@/lib/whatsapp/send-welcome'

/**
 * The claim does:
 *   update(whatsapp_company_configs).set(welcome_sent_at=now).eq(company_id).is(welcome_sent_at,null).select(company_id)
 * Returning a non-empty array => this caller won the race (first contact).
 * After a won claim, welcomeOnFirstContact resolves the language via a single
 * select on companies.default_estimate_language — served by the same mock.
 */
function makeClient(
  returnedRows: unknown[] | null,
  error: unknown = null,
  companyLanguage: string | null = null
) {
  const select = vi.fn().mockResolvedValue({ data: returnedRows, error })
  const is = vi.fn().mockReturnValue({ select })
  const eq = vi.fn().mockReturnValue({ is })
  const update = vi.fn().mockReturnValue({ eq })
  const companiesSingle = vi.fn().mockResolvedValue({
    data: { default_estimate_language: companyLanguage },
    error: null,
  })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: companiesSingle }),
        }),
      }
    }
    return { update }
  })
  return { from, update, eq, is, select, companiesSingle }
}

describe('buildWelcomeMessage', () => {
  it('en: English welcome copy', () => {
    const msg = buildWelcomeMessage('en')
    expect(msg).toContain('Welcome to Xtimator')
    expect(msg).toMatch(/describe your first job/i)
  })

  it('pt: Portuguese welcome copy', () => {
    const msg = buildWelcomeMessage('pt')
    expect(msg).toContain('Bem-vindo ao Xtimator')
    expect(msg).toMatch(/orçamento/i)
    expect(msg).toMatch(/primeiro serviço/i)
  })

  it('es: Spanish welcome copy', () => {
    const msg = buildWelcomeMessage('es')
    expect(msg).toContain('Bienvenido a Xtimator')
    expect(msg).toMatch(/presupuesto/i)
    expect(msg).toMatch(/primer trabajo/i)
  })

  it('unknown language falls back to English', () => {
    expect(buildWelcomeMessage('de' as never)).toBe(buildWelcomeMessage('en'))
  })
})

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

  it('targets whatsapp_company_configs scoped to the company and only-when-null', async () => {
    const { from, update, eq, is } = makeClient([{ company_id: 'c1' }])
    await claimWhatsAppWelcome({ from } as never, 'c1')
    expect(from).toHaveBeenCalledWith('whatsapp_company_configs')
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

  it('defaults to English when the company has no default language', async () => {
    const { from } = makeClient([{ company_id: 'c1' }])
    await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    const [, body] = sendMock.mock.calls[0]!
    expect(body.text.body).toBe(buildWelcomeMessage('en'))
  })

  it('sends the localized welcome for the company default language (pt)', async () => {
    const { from } = makeClient([{ company_id: 'c1' }], null, 'pt')
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(true)
    const [, body] = sendMock.mock.calls[0]!
    expect(body.text.body).toBe(buildWelcomeMessage('pt'))
    expect(body.text.body).toContain('Bem-vindo ao Xtimator')
  })

  it('does NOT query the company language when the claim is lost', async () => {
    const { from, companiesSingle } = makeClient([], null, 'pt')
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(false)
    expect(companiesSingle).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
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
