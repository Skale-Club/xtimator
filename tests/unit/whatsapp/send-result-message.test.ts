import { describe, it, expect } from 'vitest'
import { describeSendResult } from '@/lib/whatsapp/send-result-message'
import type { SendResult } from '@/lib/whatsapp/confirm-actions'

const base: SendResult = {
  shareUrl: 'https://xtimator.com/estimate/tok',
  outcome: 'sent',
  deliveredToClient: true,
  channels: ['email'],
  clientName: 'Johnson',
  problems: [],
}

describe('describeSendResult (owner confirmation)', () => {
  it('names the channel(s) used', () => {
    expect(describeSendResult(base)).toContain('sent to Johnson by email')
    expect(describeSendResult({ ...base, channels: ['email', 'sms'] })).toContain('by email and SMS')
  })

  it('mentions a skipped channel without failing the send', () => {
    const msg = describeSendResult({ ...base, problems: ['the client has not agreed to SMS yet'] })
    expect(msg).toContain('sent to Johnson by email')
    expect(msg).toContain('not agreed to SMS')
  })

  it('no contact: one short instruction to add phone or email, no claim of delivery', () => {
    const msg = describeSendResult({ ...base, outcome: 'no_contact', deliveredToClient: false, channels: [] })
    expect(msg).toMatch(/^Not sent: no phone or email on file for Johnson/)
    expect(msg).toContain('set_client')
    expect(msg).not.toMatch(/sent to/i)
  })

  it('not delivered: reason plus the link for manual sharing', () => {
    const msg = describeSendResult({
      ...base,
      outcome: 'not_delivered',
      deliveredToClient: false,
      channels: [],
      problems: ['SMS delivery is off for this company'],
    })
    expect(msg).toContain('Not sent to Johnson')
    expect(msg).toContain('https://xtimator.com/estimate/tok')
  })
})
