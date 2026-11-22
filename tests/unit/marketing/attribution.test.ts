import { describe, expect, it } from 'vitest'
import {
  buildTouch,
  mergeAttribution,
  parseAttribution,
  serializeAttribution,
  stripClickIds,
} from '@/lib/marketing/attribution'

const NOW = new Date('2026-11-21T12:00:00.000Z')

describe('buildTouch', () => {
  it('records UTM tags and ad click ids', () => {
    const url = new URL('https://xtimator.com/industries/hvac?utm_source=google&utm_medium=cpc&utm_campaign=hvac-us&gclid=abc123')
    const touch = buildTouch(url, '', NOW, { keepClickIds: true })
    expect(touch).toMatchObject({
      landing: '/industries/hvac',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'hvac-us',
      gclid: 'abc123',
      ts: NOW.toISOString(),
    })
  })

  it('records an external referrer as a touch', () => {
    const touch = buildTouch(new URL('https://xtimator.com/'), 'https://www.facebook.com/somepage', NOW, { keepClickIds: true })
    expect(touch).toMatchObject({ landing: '/', referrer: 'www.facebook.com' })
  })

  it('ignores direct visits and our own pages as referrer', () => {
    expect(buildTouch(new URL('https://xtimator.com/blog'), '', NOW, { keepClickIds: true })).toBeNull()
    expect(buildTouch(new URL('https://xtimator.com/blog'), 'https://xtimator.com/', NOW, { keepClickIds: true })).toBeNull()
    expect(buildTouch(new URL('https://xtimator.com/blog'), 'https://www.xtimator.com/x', NOW, { keepClickIds: true })).toBeNull()
  })

  it('drops click ids when told to (visitor rejected cookies) but keeps the campaign', () => {
    const url = new URL('https://xtimator.com/?utm_source=meta&fbclid=FB1')
    const touch = buildTouch(url, '', NOW, { keepClickIds: false })
    expect(touch?.utm_source).toBe('meta')
    expect(touch?.fbclid).toBeUndefined()
  })

  it('clips long values', () => {
    const touch = buildTouch(new URL(`https://xtimator.com/?utm_campaign=${'x'.repeat(500)}`), '', NOW, { keepClickIds: true })
    expect(touch?.utm_campaign).toHaveLength(200)
  })
})

describe('mergeAttribution', () => {
  const a = buildTouch(new URL('https://xtimator.com/?utm_source=google'), '', NOW, { keepClickIds: true })!
  const b = buildTouch(new URL('https://xtimator.com/?utm_source=meta'), '', NOW, { keepClickIds: true })!

  it('keeps the first touch and replaces the last', () => {
    const first = mergeAttribution(null, a)!
    expect(first.first.utm_source).toBe('google')
    const second = mergeAttribution(first, b)!
    expect(second.first.utm_source).toBe('google')
    expect(second.last.utm_source).toBe('meta')
  })

  it('a visit with nothing new keeps what was stored', () => {
    const stored = mergeAttribution(null, a)
    expect(mergeAttribution(stored, null)).toBe(stored)
  })
})

describe('cookie round trip', () => {
  it('serializes, parses and strips click ids', () => {
    const touch = buildTouch(new URL('https://xtimator.com/?gclid=G1&utm_source=google'), '', NOW, { keepClickIds: true })!
    const attribution = mergeAttribution(null, touch)!
    const parsed = parseAttribution(serializeAttribution(attribution))
    expect(parsed).toEqual(attribution)
    const stripped = stripClickIds(parsed!)
    expect(stripped.first.gclid).toBeUndefined()
    expect(stripped.first.utm_source).toBe('google')
  })

  it('reads garbage as no attribution', () => {
    expect(parseAttribution('not json')).toBeNull()
    expect(parseAttribution(encodeURIComponent(JSON.stringify({ first: { landing: 1 } })))).toBeNull()
    expect(parseAttribution(undefined)).toBeNull()
  })
})
