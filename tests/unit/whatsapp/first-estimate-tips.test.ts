import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock, logMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue('wamid.x'),
  logMock: vi.fn().mockResolvedValue('conv'),
}))
vi.mock('@/lib/whatsapp/client', () => ({ sendWhatsAppMessage: sendMock }))
vi.mock('@/lib/whatsapp/conversations', () => ({ logOutboundMessage: logMock }))

import {
  buildFirstEstimateTips,
  claimFirstEstimateTips,
  sendFirstEstimateTips,
} from '@/lib/whatsapp/first-estimate-tips'

/** update(...).eq(company_id).is(first_estimate_tips_sent_at, null).select(company_id) */
function makeClient(rows: unknown[] | null, error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data: rows, error })
  const is = vi.fn().mockReturnValue({ select })
  const eq = vi.fn().mockReturnValue({ is })
  const update = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ update })
  return { from, update, eq, is }
}

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue('wamid.x')
  logMock.mockClear()
})

describe('buildFirstEstimateTips', () => {
  it('pt: edit by voice/text, then send from the app', () => {
    expect(buildFirstEstimateTips('pt')).toEqual([
      'Dica: para ajustar o orçamento, é só me mandar um áudio ou texto dizendo o que mudar.',
      'Para enviar ao seu cliente, abra o orçamento no app e envie por SMS ou e-mail.',
    ])
  })

  it('en and es are localized; unknown falls back to English', () => {
    expect(buildFirstEstimateTips('en')[0]).toMatch(/^Tip:/)
    expect(buildFirstEstimateTips('es')[0]).toMatch(/^Consejo:/)
    expect(buildFirstEstimateTips('de' as never)).toEqual(buildFirstEstimateTips('en'))
  })
})

describe('claimFirstEstimateTips', () => {
  it('claims atomically on whatsapp_company_configs, only when still null', async () => {
    const { from, update, eq, is } = makeClient([{ company_id: 'c1' }])
    await expect(claimFirstEstimateTips({ from } as never, 'c1')).resolves.toBe(true)
    expect(from).toHaveBeenCalledWith('whatsapp_company_configs')
    expect(update).toHaveBeenCalledWith({ first_estimate_tips_sent_at: expect.any(String) })
    expect(eq).toHaveBeenCalledWith('company_id', 'c1')
    expect(is).toHaveBeenCalledWith('first_estimate_tips_sent_at', null)
  })

  it('false when already claimed or on error', async () => {
    await expect(claimFirstEstimateTips(makeClient([]) as never, 'c1')).resolves.toBe(false)
    await expect(claimFirstEstimateTips(makeClient(null, { message: 'x' }) as never, 'c1')).resolves.toBe(false)
  })
})

describe('sendFirstEstimateTips', () => {
  it('sends the two tips in order after the first ready estimate, non-billable', async () => {
    const client = makeClient([{ company_id: 'c1' }])
    await expect(sendFirstEstimateTips(client as never, 'c1', '+15551234567', 'pt')).resolves.toBe(true)

    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(sendMock.mock.calls.map((c) => c[1].text.body)).toEqual(buildFirstEstimateTips('pt'))
    for (const call of sendMock.mock.calls) {
      expect(call[0]).toBe('+15551234567')
      expect(call[2]).toEqual({ companyId: 'c1', purpose: 'welcome', billable: false })
    }
    expect(logMock).toHaveBeenCalledTimes(2)
  })

  it('sends nothing for later estimates (claim already taken)', async () => {
    const client = makeClient([])
    await expect(sendFirstEstimateTips(client as never, 'c1', '+15551234567', 'en')).resolves.toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('never throws when a send fails', async () => {
    sendMock.mockRejectedValueOnce(new Error('network'))
    const client = makeClient([{ company_id: 'c1' }])
    await expect(sendFirstEstimateTips(client as never, 'c1', '+15551234567', 'en')).resolves.toBe(false)
  })
})
