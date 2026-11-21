import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { sendOwnerEmailWithRetry } from '@/lib/email/send-with-retry'

const payload = { from: 'a@x.test', to: 'owner@secret.test', subject: 'Estimate declined', text: 'body' }
const ctx = { resourceType: 'estimate', resourceId: 'est-1', channel: 'owner_email' }

describe('sendOwnerEmailWithRetry', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => warn.mockRestore())

  it('sends once and returns true on success', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'm1' }, error: null })
    expect(await sendOwnerEmailWithRetry({ emails: { send } }, payload, ctx, { retryDelayMs: 0 })).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('retries once on a transient error response, then succeeds', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { name: 'application_error', statusCode: 503 } })
      .mockResolvedValueOnce({ data: { id: 'm1' }, error: null })
    expect(await sendOwnerEmailWithRetry({ emails: { send } }, payload, ctx, { retryDelayMs: 0 })).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('retries once when the send throws (network), and gives up after the second failure without throwing', async () => {
    const send = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    expect(await sendOwnerEmailWithRetry({ emails: { send } }, payload, ctx, { retryDelayMs: 0 })).toBe(false)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not retry a permanent 4xx error', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { name: 'validation_error', statusCode: 422 } })
    expect(await sendOwnerEmailWithRetry({ emails: { send } }, payload, ctx, { retryDelayMs: 0 })).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('logs ids and channel but never the recipient or the message text', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { name: 'validation_error', statusCode: 422 } })
    await sendOwnerEmailWithRetry({ emails: { send } }, payload, ctx, { retryDelayMs: 0 })
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toContain('est-1')
    expect(logged).toContain('owner_email')
    expect(logged).not.toContain('owner@secret.test')
    expect(logged).not.toContain('body')
  })
})
