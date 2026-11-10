import { describe, it, expect } from 'vitest'
import {
  classifyInboundMessage,
  formatContactsText,
  formatLocationText,
  interactiveReplyText,
  isOverMediaLimit,
  isTextBearing,
  mediaKindFromMime,
  policyReplyText,
  tooLargeReplyKey,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MediaTooLargeError,
  type PolicyReplyKey,
} from '@/lib/whatsapp/message-policy'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const base = { id: 'wamid.1', from: '15551112222', timestamp: '1' }
const msg = (m: Partial<WhatsAppMessage> & Pick<WhatsAppMessage, 'type'>): WhatsAppMessage => ({
  ...base,
  ...m,
})

describe('classifyInboundMessage', () => {
  it('text -> process_text with the body', () => {
    expect(classifyInboundMessage(msg({ type: 'text', text: { body: 'paint the fence' } }))).toEqual({
      action: 'process_text',
      reason: 'text',
      text: 'paint the fence',
    })
  })

  it('empty text -> ignore (no paid reply for nothing)', () => {
    expect(classifyInboundMessage(msg({ type: 'text', text: { body: '  ' } })).action).toBe('ignore')
    expect(classifyInboundMessage(msg({ type: 'text' })).action).toBe('ignore')
  })

  it('audio (voice note or file) -> process_audio', () => {
    const voice = classifyInboundMessage(
      msg({ type: 'audio', audio: { id: 'a1', mime_type: 'audio/ogg', voice: true } })
    )
    expect(voice).toEqual({ action: 'process_audio', reason: 'voice_note' })
    expect(
      classifyInboundMessage(msg({ type: 'audio', audio: { id: 'a1', mime_type: 'audio/mp4' } })).reason
    ).toBe('audio')
  })

  it('image -> process_image', () => {
    expect(
      classifyInboundMessage(msg({ type: 'image', image: { id: 'i1', mime_type: 'image/jpeg' } })).action
    ).toBe('process_image')
  })

  it('audio/image without a media id -> one unsupported reply', () => {
    const a = classifyInboundMessage(msg({ type: 'audio' }))
    expect(a.action).toBe('reply_unsupported')
    expect(a.reply).toBe('unknown_unsupported')
    expect(classifyInboundMessage(msg({ type: 'image' })).action).toBe('reply_unsupported')
  })

  it('video is never processed -> asks for photos or audio', () => {
    expect(classifyInboundMessage(msg({ type: 'video', video: { id: 'v1' } }))).toEqual({
      action: 'reply_unsupported',
      reason: 'video',
      reply: 'video_unsupported',
    })
  })

  it('document (incl. PDF) -> not supported yet', () => {
    expect(
      classifyInboundMessage(
        msg({ type: 'document', document: { id: 'd1', mime_type: 'application/pdf', filename: 'plans.pdf' } })
      )
    ).toEqual({ action: 'reply_unsupported', reason: 'document', reply: 'document_unsupported' })
  })

  it('sticker, reaction and system events -> ignore (no reply, no AI, no cost)', () => {
    for (const type of ['sticker', 'reaction', 'system', 'request_welcome'] as const) {
      const d = classifyInboundMessage(msg({ type }))
      expect(d.action).toBe('ignore')
      expect(d.reply).toBeUndefined()
      expect(d.text).toBeUndefined()
    }
  })

  it('location -> use_location with "Job location: name, address (lat,lng)"', () => {
    const d = classifyInboundMessage(
      msg({
        type: 'location',
        location: { latitude: 28.54, longitude: -81.38, name: 'Smith house', address: '12 Oak St, Orlando' },
      })
    )
    expect(d.action).toBe('use_location')
    expect(d.text).toBe('Job location: Smith house, 12 Oak St, Orlando (28.54,-81.38)')
    expect(isTextBearing(d)).toBe(true)
  })

  it('location with coordinates only still works; an empty location gets the unsupported reply', () => {
    expect(formatLocationText({ latitude: 1.5, longitude: 2.5 })).toBe('Job location: (1.5,2.5)')
    expect(formatLocationText(undefined)).toBeNull()
    expect(classifyInboundMessage(msg({ type: 'location' })).action).toBe('reply_unsupported')
  })

  it('contacts -> use_contact with "Client: name, phone" (wa_id preferred, E.164)', () => {
    const d = classifyInboundMessage(
      msg({
        type: 'contacts',
        contacts: [
          {
            name: { formatted_name: 'John Smith' },
            phones: [{ phone: '+1 (555) 222-3333', wa_id: '15552223333' }],
          },
        ],
      })
    )
    expect(d.action).toBe('use_contact')
    expect(d.text).toBe('Client: John Smith, +15552223333')
  })

  it('contacts falls back to the raw phone and to first/last name; several cards become several lines', () => {
    expect(
      formatContactsText([
        { name: { first_name: 'Ana', last_name: 'Lima' }, phones: [{ phone: '+55 11 99999-0000' }] },
        { name: { formatted_name: 'No Phone' } },
      ])
    ).toBe('Client: Ana Lima, +55 11 99999-0000\nClient: No Phone')
    expect(formatContactsText([])).toBeNull()
    expect(classifyInboundMessage(msg({ type: 'contacts', contacts: [] })).action).toBe('reply_unsupported')
  })

  it('interactive button_reply / list_reply and legacy button -> the title is the text', () => {
    const btn = classifyInboundMessage(
      msg({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'c', title: 'Confirm' } } })
    )
    expect(btn).toEqual({ action: 'process_text', reason: 'interactive_reply', text: 'Confirm' })

    const list = classifyInboundMessage(
      msg({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'x', title: 'Cancel' } } })
    )
    expect(list.text).toBe('Cancel')

    const legacy = classifyInboundMessage(msg({ type: 'button', button: { text: 'Yes', payload: 'p' } }))
    expect(legacy).toEqual({ action: 'process_text', reason: 'button_reply', text: 'Yes' })
    expect(interactiveReplyText(msg({ type: 'button', button: {} }))).toBeNull()
  })

  it('an interactive/button message with no title is ignored', () => {
    expect(classifyInboundMessage(msg({ type: 'interactive' })).action).toBe('ignore')
    expect(classifyInboundMessage(msg({ type: 'button' })).action).toBe('ignore')
  })

  it('unknown / unsupported types -> one short reply', () => {
    for (const type of ['unknown', 'unsupported'] as const) {
      const d = classifyInboundMessage(msg({ type }))
      expect(d).toEqual({ action: 'reply_unsupported', reason: 'unknown_type', reply: 'unknown_unsupported' })
    }
  })
})

describe('media size limits', () => {
  it('limits: 16 MB audio (Meta cap), 10 MB image', () => {
    expect(MAX_AUDIO_BYTES).toBe(16 * 1024 * 1024)
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024)
  })

  it('isOverMediaLimit is strict and tolerates a missing size', () => {
    expect(isOverMediaLimit('audio', MAX_AUDIO_BYTES)).toBe(false)
    expect(isOverMediaLimit('audio', MAX_AUDIO_BYTES + 1)).toBe(true)
    expect(isOverMediaLimit('image', MAX_IMAGE_BYTES + 1)).toBe(true)
    expect(isOverMediaLimit('image', undefined)).toBe(false)
    expect(isOverMediaLimit('image', Number.NaN)).toBe(false)
  })

  it('mediaKindFromMime / tooLargeReplyKey / MediaTooLargeError', () => {
    expect(mediaKindFromMime('audio/ogg; codecs=opus')).toBe('audio')
    expect(mediaKindFromMime('image/jpeg')).toBe('image')
    expect(mediaKindFromMime('application/pdf')).toBeNull()
    expect(tooLargeReplyKey('audio')).toBe('audio_too_long')
    expect(tooLargeReplyKey('image')).toBe('image_too_large')
    const err = new MediaTooLargeError('audio', 20_000_000)
    expect(err).toBeInstanceOf(Error)
    expect(err.kind).toBe('audio')
  })
})

describe('policyReplyText', () => {
  const keys: PolicyReplyKey[] = [
    'video_unsupported',
    'document_unsupported',
    'unknown_unsupported',
    'audio_too_long',
    'image_too_large',
    'audio_unreadable',
    'photo_unreadable',
  ]

  it('every key is localized in pt/en/es and stays short (<= 2 sentences, no line breaks)', () => {
    for (const lang of ['pt', 'en', 'es'] as const) {
      for (const key of keys) {
        const text = policyReplyText(key, lang)
        expect(text.length).toBeGreaterThan(10)
        expect(text).not.toContain('\n')
        expect((text.match(/[.!?](\s|$)/g) ?? []).length).toBeLessThanOrEqual(2)
      }
    }
  })

  it('pt copy for the audio limit and video/document', () => {
    expect(policyReplyText('audio_too_long', 'pt')).toBe(
      'Esse áudio é longo demais. Me manda em partes menores.'
    )
    expect(policyReplyText('video_unsupported', 'pt')).toMatch(/fotos ou um áudio/)
    expect(policyReplyText('document_unsupported', 'pt')).toMatch(/fotos ou um áudio/)
  })
})
