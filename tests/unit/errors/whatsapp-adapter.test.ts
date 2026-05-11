import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { XtimatorError } from '@/lib/errors'
import { handleWhatsAppError } from '@/lib/errors/whatsapp'

const sendMock = vi.fn()
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendMock(...args),
}))

beforeEach(() => {
  sendMock.mockReset()
  sendMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleWhatsAppError', () => {
  it('sends contextual message for known XtimatorError code', async () => {
    const err = new XtimatorError('tier_limit', 'estimates', 'q exceeded')
    await handleWhatsAppError(err, '+15551234567')
    expect(sendMock).toHaveBeenCalledOnce()
    const [to, payload] = sendMock.mock.calls[0]
    expect(to).toBe('+15551234567')
    expect(payload.type).toBe('text')
    expect(payload.text.body).toContain('monthly estimate limit')
  })

  it('sends rate-limit message for rate_limit:whatsapp', async () => {
    const err = new XtimatorError('rate_limit', 'whatsapp', 'too many')
    await handleWhatsAppError(err, '+15551234567')
    expect(sendMock.mock.calls[0][1].text.body).toContain('Slow down')
  })

  it('sends bad-request hint for bad_request:whatsapp', async () => {
    const err = new XtimatorError('bad_request', 'whatsapp', 'unknown command')
    await handleWhatsAppError(err, '+15551234567')
    expect(sendMock.mock.calls[0][1].text.body).toContain("didn't understand")
  })

  it('falls back to generic message for unmapped XtimatorError code', async () => {
    const err = new XtimatorError('internal', 'database', 'conn refused')
    await handleWhatsAppError(err, '+15551234567')
    expect(sendMock.mock.calls[0][1].text.body).toContain('Something went wrong')
  })

  it('falls back to generic message for non-XtimatorError', async () => {
    await handleWhatsAppError(new Error('boom'), '+15551234567')
    expect(sendMock.mock.calls[0][1].text.body).toContain('Something went wrong')
  })

  it('does NOT throw when sendWhatsAppMessage fails', async () => {
    sendMock.mockRejectedValueOnce(new Error('meta API down'))
    await expect(
      handleWhatsAppError(new XtimatorError('bad_request', 'photos', 'x'), '+15551234567')
    ).resolves.toBeUndefined()
  })
})
