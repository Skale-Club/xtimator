import { describe, it, expect } from 'vitest'
import { inboxFieldsFor } from '@/lib/whatsapp/inbox-fields'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const m = (x: Partial<WhatsAppMessage> & Pick<WhatsAppMessage, 'type'>): WhatsAppMessage => ({
  id: 'wamid.1',
  from: '1555',
  timestamp: '1',
  ...x,
})

describe('inboxFieldsFor (inbox log mapping)', () => {
  it('keeps the native inbox types for text/audio/image/document', () => {
    expect(inboxFieldsFor(m({ type: 'text', text: { body: 'hi' } }))).toEqual({ msgType: 'text', body: 'hi' })
    expect(inboxFieldsFor(m({ type: 'audio', audio: { id: 'a', mime_type: 'audio/ogg' } }))).toEqual({
      msgType: 'audio',
      body: null,
    })
    expect(
      inboxFieldsFor(m({ type: 'image', image: { id: 'i', mime_type: 'image/jpeg', caption: 'roof' } }))
    ).toEqual({ msgType: 'image', body: 'roof' })
    expect(
      inboxFieldsFor(m({ type: 'document', document: { id: 'd', filename: 'plans.pdf' } }))
    ).toEqual({ msgType: 'document', body: 'plans.pdf' })
  })

  it('logs the rest as text with a readable body (the msg_type column has no such values)', () => {
    expect(inboxFieldsFor(m({ type: 'sticker' }))).toEqual({ msgType: 'text', body: '[sticker]' })
    expect(inboxFieldsFor(m({ type: 'video' }))).toEqual({ msgType: 'text', body: '[video]' })
    expect(inboxFieldsFor(m({ type: 'reaction', reaction: { message_id: 'x', emoji: 'ok' } }))).toEqual({
      msgType: 'text',
      body: '[reaction] ok',
    })
    expect(
      inboxFieldsFor(
        m({ type: 'location', location: { latitude: 1, longitude: 2, name: 'Site', address: '12 Oak St' } })
      )
    ).toEqual({ msgType: 'text', body: '[location] Site, 12 Oak St (1,2)' })
    expect(
      inboxFieldsFor(m({ type: 'contacts', contacts: [{ name: { formatted_name: 'John Smith' } }] }))
    ).toEqual({ msgType: 'text', body: '[contact] John Smith' })
  })

  it('interactive and legacy button replies log the title', () => {
    expect(
      inboxFieldsFor(
        m({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: '1', title: 'Confirm' } } })
      )
    ).toEqual({ msgType: 'text', body: 'Confirm' })
    expect(inboxFieldsFor(m({ type: 'button', button: { text: 'Yes' } }))).toEqual({ msgType: 'text', body: 'Yes' })
  })

  it('unknown types are tagged, never a null body', () => {
    expect(inboxFieldsFor(m({ type: 'unknown' }))).toEqual({ msgType: 'text', body: '[unknown]' })
  })
})
