import { describe, expect, it, vi, beforeEach } from 'vitest'

const { sendMock, configMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue(undefined),
  configMock: vi.fn(),
}))
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: sendMock,
}))
vi.mock('@/lib/platform-config', () => ({
  getWhatsAppWelcomeConfig: configMock,
}))

const NO_VIDEO = {
  templateNames: { pt: null, en: null, es: null },
  videoUrls: { pt: null, en: null, es: null },
}

import {
  buildWelcomeSequence,
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

describe('buildWelcomeSequence', () => {
  it('pt: three short messages with the video URL in the second', () => {
    const msgs = buildWelcomeSequence('pt', 'https://example.com/pt.mp4')
    expect(msgs).toHaveLength(3)
    expect(msgs[0]).toBe(
      'Olá! Eu sou o assistente da Xtimator. Por aqui você cria orçamentos profissionais mandando áudio e fotos do serviço.'
    )
    expect(msgs[1]).toBe('Veja em 1 minuto como funciona: https://example.com/pt.mp4')
    expect(msgs[2]).toBe(
      'Quer testar agora? Me manda um áudio contando o serviço que você precisa orçar.'
    )
  })

  it('pt: text placeholder replaces the video when no URL is configured', () => {
    for (const none of [null, undefined, '', '   ']) {
      const msgs = buildWelcomeSequence('pt', none)
      expect(msgs).toHaveLength(3)
      expect(msgs[1]).toBe('Em breve vou te mandar um vídeo curto mostrando como funciona.')
      expect(msgs.join('\n')).not.toMatch(/https?:/)
    }
  })

  it('en and es: same structure, localized', () => {
    expect(buildWelcomeSequence('en', 'https://x.test/v')[1]).toBe(
      'See how it works in 1 minute: https://x.test/v'
    )
    expect(buildWelcomeSequence('en')[0]).toContain('Xtimator assistant')
    expect(buildWelcomeSequence('es', 'https://x.test/v')[1]).toBe(
      'Vea cómo funciona en 1 minuto: https://x.test/v'
    )
    expect(buildWelcomeSequence('es')[2]).toMatch(/presupuestar/)
  })

  it('every message is short (no wall of text)', () => {
    for (const lang of ['pt', 'en', 'es'] as const) {
      for (const m of buildWelcomeSequence(lang, 'https://x.test/v')) {
        expect(m.length).toBeLessThan(200)
        expect(m).not.toContain('\n')
      }
    }
  })

  it('unknown language falls back to English', () => {
    expect(buildWelcomeSequence('de' as never)).toEqual(buildWelcomeSequence('en'))
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
  beforeEach(() => {
    vi.clearAllMocks()
    configMock.mockResolvedValue(NO_VIDEO)
  })

  it('sends the three-message sequence in order when the claim is won', async () => {
    const { from } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(3)
    const bodies = sendMock.mock.calls.map((c) => c[1].text.body)
    expect(bodies).toEqual(buildWelcomeSequence('en'))
    for (const call of sendMock.mock.calls) {
      expect(call[0]).toBe('+15551234567')
      expect(call[1].type).toBe('text')
    }
  })

  it('awaits each message before sending the next', async () => {
    const order: string[] = []
    let release: () => void = () => undefined
    sendMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            order.push('first-done')
            resolve(undefined)
          }
        })
    )
    sendMock.mockImplementation(async () => {
      order.push('next-sent')
      return undefined
    })
    const { from } = makeClient([{ company_id: 'c1' }])
    const pending = welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
    expect(order).toEqual([])
    release()
    await pending
    expect(order[0]).toBe('first-done')
    expect(sendMock).toHaveBeenCalledTimes(3)
    sendMock.mockReset()
    sendMock.mockResolvedValue(undefined)
  })

  it('records every message as a non-billable platform welcome', async () => {
    const { from } = makeClient([{ company_id: 'c1' }])
    await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')
    for (const call of sendMock.mock.calls) {
      expect(call[2]).toEqual({ companyId: 'c1', purpose: 'welcome', billable: false })
    }
  })

  it('uses the configured video URL for the company language', async () => {
    configMock.mockResolvedValue({
      ...NO_VIDEO,
      videoUrls: { pt: 'https://cdn.test/pt.mp4', en: null, es: null },
    })
    const { from } = makeClient([{ company_id: 'c1' }], null, 'pt')
    await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    const bodies = sendMock.mock.calls.map((c) => c[1].text.body)
    expect(bodies).toEqual(buildWelcomeSequence('pt', 'https://cdn.test/pt.mp4'))
    expect(bodies[1]).toContain('https://cdn.test/pt.mp4')
  })

  it('sends the text placeholder when the language has no video URL', async () => {
    configMock.mockResolvedValue({
      ...NO_VIDEO,
      videoUrls: { pt: null, en: 'https://cdn.test/en.mp4', es: null },
    })
    const { from } = makeClient([{ company_id: 'c1' }], null, 'pt')
    await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    const bodies = sendMock.mock.calls.map((c) => c[1].text.body)
    expect(bodies[1]).toBe('Em breve vou te mandar um vídeo curto mostrando como funciona.')
  })

  it('still sends the sequence (placeholder) when the config read fails', async () => {
    configMock.mockRejectedValue(new Error('db down'))
    const { from } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')
    expect(sent).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(3)
  })

  it('defaults to English when the company has no default language', async () => {
    const { from } = makeClient([{ company_id: 'c1' }])
    await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')
    expect(sendMock.mock.calls[0]![1].text.body).toBe(buildWelcomeSequence('en')[0])
  })

  it('sends the localized sequence for the company default language (pt)', async () => {
    const { from } = makeClient([{ company_id: 'c1' }], null, 'pt')
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(true)
    expect(sendMock.mock.calls[0]![1].text.body).toContain('assistente da Xtimator')
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

  it('never throws when a send fails, and stops the remaining messages', async () => {
    sendMock.mockRejectedValueOnce(new Error('network'))
    const { from } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact({ from } as never, 'c1', '+15551234567')

    expect(sent).toBe(false)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
