import type { WaMsgType } from '@/lib/whatsapp/conversations'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import { interactiveReplyText } from '@/lib/whatsapp/message-policy'

// Map a Meta inbound message to the inbox log's (type, body) pair. The inbox column only
// allows text/image/audio/document/system (CHECK constraint), so the other types are
// logged as 'text' with a readable bracketed body.
export function inboxFieldsFor(message: WhatsAppMessage): { msgType: WaMsgType; body: string | null } {
  const tag = (label: string, detail?: string | null) =>
    detail && detail.trim() ? `[${label}] ${detail.trim()}` : `[${label}]`
  switch (message.type) {
    case 'text':
      return { msgType: 'text', body: message.text?.body ?? null }
    case 'audio':
      return { msgType: 'audio', body: null }
    case 'image':
      return { msgType: 'image', body: message.image?.caption ?? null }
    case 'document':
      return { msgType: 'document', body: message.document?.filename ?? message.document?.caption ?? null }
    case 'video':
      return { msgType: 'text', body: tag('video', message.video?.caption) }
    case 'sticker':
      return { msgType: 'text', body: tag('sticker') }
    case 'reaction':
      return { msgType: 'text', body: tag('reaction', message.reaction?.emoji) }
    case 'location': {
      const loc = message.location
      const label = [loc?.name, loc?.address].filter(Boolean).join(', ')
      const coords =
        loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
          ? `(${loc.latitude},${loc.longitude})`
          : ''
      return { msgType: 'text', body: tag('location', [label, coords].filter(Boolean).join(' ')) }
    }
    case 'contacts': {
      const names = (message.contacts ?? [])
        .map((c) => c?.name?.formatted_name ?? [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(' '))
        .filter(Boolean)
      return { msgType: 'text', body: tag('contact', names.join(', ')) }
    }
    case 'interactive':
      return { msgType: 'text', body: interactiveReplyText(message) ?? tag('interactive') }
    case 'button':
      return { msgType: 'text', body: message.button?.text ?? tag('button') }
    default:
      return { msgType: 'text', body: tag(String(message.type)) }
  }
}
