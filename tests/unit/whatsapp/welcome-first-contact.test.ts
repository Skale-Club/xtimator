import { describe, expect, it, vi, beforeEach } from 'vitest'

const { sendMock, configMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue('wamid.welcome'),
  configMock: vi.fn(),
}))
vi.mock('@/lib/whatsapp/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/whatsapp/client')>()),
  sendWhatsAppMessage: sendMock,
}))
vi.mock('@/lib/platform-config', () => ({
  getWhatsAppWelcomeConfig: configMock,
  getWhatsAppPlatformConfig: async () => ({ accessToken: 'token', phoneNumberId: 'sender' }),
}))

import { WhatsAppSendError } from '@/lib/whatsapp/client'
vi.mock('@/lib/whatsapp/outbound-guard', () => ({ isWhatsAppOutboundBlocked: () => false }))

const NO_VIDEO = {
  templateNames: { pt: null, en: null, es: null },
  videoUrls: { pt: null, en: null, es: null },
}

import {
  buildWelcomeSequence,
  welcomeOnFirstContact,
} from '@/lib/whatsapp/send-welcome'

vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: vi.fn().mockResolvedValue('thread-1'),
}))

function makeClient(
  returnedRows: unknown[] | null,
  error: unknown = null,
  companyLanguage: string | null = null,
  failCheckpoint = false,
) {
  let nextStep = 0
  let sendingStep: number | null = null
  let claimToken: string | null = null
  const maybeSingle = vi.fn(async () => ({
    data: !error && returnedRows?.length && nextStep < 3 && sendingStep === null && claimToken === null
      ? { next_step: nextStep }
      : null,
    error,
  }))
  const rpc = vi.fn((_name: string, args: { p_token: string }) => ({
    maybeSingle: async () => {
      const claim = await maybeSingle()
      if (claim.data) claimToken = args.p_token
      return claim
    },
  }))
  const update = vi.fn((patch: { welcome_next_step?: number; welcome_claim_token?: string | null; welcome_sending_step?: number | null }) => {
    const chain = {
      eq: () => chain,
      is: () => chain,
      select: async () => {
        if (failCheckpoint && patch.welcome_next_step !== undefined) {
          return { data: null, error: { message: 'checkpoint failed' } }
        }
        if (patch.welcome_next_step !== undefined) nextStep = patch.welcome_next_step
        if (patch.welcome_sending_step !== undefined) sendingStep = patch.welcome_sending_step
        if (patch.welcome_claim_token === null) claimToken = null
        return { data: [{ company_id: 'c1' }], error: null }
      },
      then: (resolve: (value: { error: null }) => void) => {
        if (patch.welcome_sending_step !== undefined) sendingStep = patch.welcome_sending_step
        if (patch.welcome_claim_token === null) claimToken = null
        resolve({ error: null })
      },
    }
    return chain
  })
  const companiesSingle = vi.fn().mockResolvedValue({
    data: { default_estimate_language: companyLanguage },
    error: null,
  })
  const from = vi.fn((table: string) => table === 'companies'
    ? { select: () => ({ eq: () => ({ single: companiesSingle }) }) }
    : { update },
  )
  return { client: { from, rpc } as never, rpc, update, companiesSingle }
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
      'Quer testar? Mande um áudio contando o serviço. Você pode revisar o rascunho antes de enviar o orçamento.'
    )
  })

  it('pt: localized usage guidance replaces the video when no URL is configured', () => {
    for (const none of [null, undefined, '', '   ']) {
      const msgs = buildWelcomeSequence('pt', none)
      expect(msgs).toHaveLength(3)
      expect(msgs[1]).toBe('Inclua medidas, materiais e os preços que você já sabe. Você também pode mandar fotos.')
      expect(msgs.join('\n')).not.toMatch(/https?:/)
    }
  })

  it('en and es: same structure, localized', () => {
    expect(buildWelcomeSequence('en', 'https://x.test/v')[1]).toBe(
      'See how it works in 1 minute: https://x.test/v'
    )
    expect(buildWelcomeSequence('en')[0]).toContain('Xtimator assistant')
    expect(buildWelcomeSequence('en')[1]).toContain('measurements, materials')
    expect(buildWelcomeSequence('en')[2]).toContain('review the draft before sending')
    expect(buildWelcomeSequence('es', 'https://x.test/v')[1]).toBe(
      'Vea cómo funciona en 1 minuto: https://x.test/v'
    )
    expect(buildWelcomeSequence('es')[1]).toContain('medidas, materiales')
    expect(buildWelcomeSequence('es')[2]).toContain('revisar el borrador')
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

describe('welcomeOnFirstContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendMock.mockReset().mockResolvedValue('wamid.welcome')
    configMock.mockResolvedValue(NO_VIDEO)
  })

  it('sends the three-message sequence in order when the claim is won', async () => {
    const { client } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact(client, 'c1', '+15551234567')

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
            resolve('wamid.welcome')
          }
        })
    )
    sendMock.mockImplementation(async () => {
      order.push('next-sent')
      return 'wamid.welcome'
    })
    const { client } = makeClient([{ company_id: 'c1' }])
    const pending = welcomeOnFirstContact(client, 'c1', '+15551234567')
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
    expect(order).toEqual([])
    release()
    await pending
    expect(order[0]).toBe('first-done')
    expect(sendMock).toHaveBeenCalledTimes(3)
  })

  it('records every message as a non-billable platform welcome', async () => {
    const { client } = makeClient([{ company_id: 'c1' }])
    await welcomeOnFirstContact(client, 'c1', '+15551234567')
    for (const call of sendMock.mock.calls) {
      expect(call[2]).toEqual({ companyId: 'c1', purpose: 'welcome', billable: false })
    }
  })

  it('uses the configured video URL for the company language', async () => {
    configMock.mockResolvedValue({
      ...NO_VIDEO,
      videoUrls: { pt: 'https://cdn.test/pt.mp4', en: null, es: null },
    })
    const { client } = makeClient([{ company_id: 'c1' }], null, 'pt')
    await welcomeOnFirstContact(client, 'c1', '+15551234567')

    const bodies = sendMock.mock.calls.map((c) => c[1].text.body)
    expect(bodies).toEqual(buildWelcomeSequence('pt', 'https://cdn.test/pt.mp4'))
    expect(bodies[1]).toContain('https://cdn.test/pt.mp4')
  })

  it('sends usage guidance when the language has no video URL', async () => {
    configMock.mockResolvedValue({
      ...NO_VIDEO,
      videoUrls: { pt: null, en: 'https://cdn.test/en.mp4', es: null },
    })
    const { client } = makeClient([{ company_id: 'c1' }], null, 'pt')
    await welcomeOnFirstContact(client, 'c1', '+15551234567')

    const bodies = sendMock.mock.calls.map((c) => c[1].text.body)
    expect(bodies[1]).toBe('Inclua medidas, materiais e os preços que você já sabe. Você também pode mandar fotos.')
  })

  it('still sends the sequence with usage guidance when the config read fails', async () => {
    configMock.mockRejectedValue(new Error('db down'))
    const { client } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact(client, 'c1', '+15551234567')
    expect(sent).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(3)
  })

  it('defaults to English when the company has no default language', async () => {
    const { client } = makeClient([{ company_id: 'c1' }])
    await welcomeOnFirstContact(client, 'c1', '+15551234567')
    expect(sendMock.mock.calls[0]![1].text.body).toBe(buildWelcomeSequence('en')[0])
  })

  it('sends the localized sequence for the company default language (pt)', async () => {
    const { client } = makeClient([{ company_id: 'c1' }], null, 'pt')
    const sent = await welcomeOnFirstContact(client, 'c1', '+15551234567')

    expect(sent).toBe(true)
    expect(sendMock.mock.calls[0]![1].text.body).toContain('assistente da Xtimator')
  })

  it('does NOT query the company language when the claim is lost', async () => {
    const { client, companiesSingle } = makeClient([], null, 'pt')
    const sent = await welcomeOnFirstContact(client, 'c1', '+15551234567')

    expect(sent).toBe(false)
    expect(companiesSingle).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does NOT send when already welcomed', async () => {
    const { client } = makeClient([])
    const sent = await welcomeOnFirstContact(client, 'c1', '+15551234567')

    expect(sent).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('holds a transport failure for review and suppresses automatic replay', async () => {
    sendMock.mockRejectedValueOnce(new Error('network'))
    const { client } = makeClient([{ company_id: 'c1' }])
    const sent = await welcomeOnFirstContact(client, 'c1', '+15551234567')

    expect(sent).toBe(false)
    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(false)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
  it('retries only the unfinished messages after a mid-sequence failure', async () => {
    sendMock.mockResolvedValueOnce('wamid.first').mockRejectedValueOnce(new WhatsAppSendError(429, 130429, 'rate limit'))
    const { client, update } = makeClient([{ company_id: 'c1' }])

    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(false)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ welcome_next_step: 1 }))
    expect(update).toHaveBeenCalledWith({ welcome_claim_until: null, welcome_claim_token: null, welcome_sending_step: null })

    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(true)
    const messages = sendMock.mock.calls.map((call) => call[1].text.body)
    const [intro, video, callToAction] = buildWelcomeSequence('en')
    expect(messages).toEqual([intro, video, video, callToAction])
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      welcome_next_step: 3, welcome_sent_at: expect.any(String),
    }))
  })

  it('holds uncertain provider responses for review and suppresses automatic replay', async () => {
    sendMock.mockResolvedValueOnce(null)
    const { client, update } = makeClient([{ company_id: 'c1' }])
    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(false)
    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(false)
    expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ welcome_sending_step: 0 }))
    expect(sendMock).toHaveBeenCalledOnce()
  })

  it('holds an accepted send for review when its progress checkpoint fails', async () => {
    const { client, update } = makeClient([{ company_id: 'c1' }], null, null, true)
    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(false)
    await expect(welcomeOnFirstContact(client, 'c1', '+15551234567')).resolves.toBe(false)
    expect(update).toHaveBeenCalledTimes(2)
    expect(sendMock).toHaveBeenCalledOnce()
  })
})
