import { describe, it, expect } from 'vitest'
import {
  detectUnknownSenderLang,
  unknownSenderReplyText,
  SIGNUP_URL,
} from '@/lib/whatsapp/unknown-sender-reply'

describe('detectUnknownSenderLang', () => {
  it('returns pt for Brazil (55)', () => {
    expect(detectUnknownSenderLang('5511999990000')).toBe('pt')
  })

  it('returns es for Spanish-speaking calling codes', () => {
    for (const phone of ['5215512345678', '34600111222', '573001234567', '59399123456']) {
      expect(detectUnknownSenderLang(phone)).toBe('es')
    }
  })

  it('returns en for the US and everything else', () => {
    for (const phone of ['15551234567', '447700900123', '4915112345678']) {
      expect(detectUnknownSenderLang(phone)).toBe('en')
    }
  })

  it('tolerates a leading plus', () => {
    expect(detectUnknownSenderLang('+5511999990000')).toBe('pt')
  })
})

describe('unknownSenderReplyText', () => {
  it('is localized, short and points to signup', () => {
    const pt = unknownSenderReplyText('5511999990000')
    const es = unknownSenderReplyText('5215512345678')
    const en = unknownSenderReplyText('15551234567')
    expect(pt).toContain('Xtimator')
    expect(es).toContain('Xtimator')
    expect(en).toContain('Xtimator')
    expect(new Set([pt, es, en]).size).toBe(3)
    for (const text of [pt, es, en]) {
      expect(text.length).toBeGreaterThan(0)
      expect(text.length).toBeLessThan(200)
      expect(text).toContain(SIGNUP_URL)
    }
  })
})
