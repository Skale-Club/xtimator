import type { SendResult } from '@/lib/whatsapp/confirm-actions'
import { describeChannels } from '@/lib/notifications/deliver-estimate-to-client'

/**
 * Owner-facing result of send_estimate, one short message. The client is reached
 * by email and/or SMS only; with no contact on file nothing is sent.
 */
export function describeSendResult(result: SendResult): string {
  const who = result.clientName ?? 'the client'
  if (result.outcome === 'no_contact') {
    return `Not sent: no phone or email on file for ${who}. Ask the owner to add the client's phone (set_client) or email, then send again.`
  }
  if (result.outcome === 'not_delivered') {
    const why = result.problems.length > 0 ? result.problems.join('; ') : 'delivery failed'
    return `Not sent to ${who}: ${why}. Share link if the owner wants to send it themselves: ${result.shareUrl}`
  }
  const via = describeChannels(result.channels)
  const note = result.problems.length > 0 ? ` (${result.problems.join('; ')})` : ''
  return `Estimate sent to ${who} by ${via}${note}. Share link: ${result.shareUrl}`
}
