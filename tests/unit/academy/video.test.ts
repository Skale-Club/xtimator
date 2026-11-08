import { describe, it, expect } from 'vitest'
import { aspectFromSize, isShortsUrl, parseFormat, parseYouTubeId, resolveAspect } from '@/lib/academy/video'

describe('parseYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
  ])('%s', (url, id) => {
    expect(parseYouTubeId(url)).toBe(id)
  })

  it('rejects non-YouTube and malformed input', () => {
    expect(parseYouTubeId('https://vimeo.com/123456789')).toBeNull()
    expect(parseYouTubeId('not a url')).toBeNull()
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull()
    expect(parseYouTubeId(null)).toBeNull()
  })

  it('detects shorts urls', () => {
    expect(isShortsUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true)
    expect(isShortsUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
  })
})

describe('aspect resolution (per video, never a fixed rule)', () => {
  const watch = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

  it('an explicit Format wins over detection', () => {
    expect(resolveAspect({ format: 'vertical', url: watch, oembed: { width: 480, height: 270 } })).toBe('vertical')
    expect(resolveAspect({ format: 'horizontal', url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' })).toBe('horizontal')
    expect(resolveAspect({ format: 'square', url: watch })).toBe('square')
  })

  it('Auto uses oEmbed width/height', () => {
    expect(resolveAspect({ format: 'auto', url: watch, oembed: { width: 480, height: 270 } })).toBe('horizontal')
    expect(resolveAspect({ format: 'auto', url: watch, oembed: { width: 270, height: 480 } })).toBe('vertical')
    expect(resolveAspect({ format: 'auto', url: watch, oembed: { width: 400, height: 400 } })).toBe('square')
  })

  it('Auto with no oEmbed: shorts url is vertical, anything else defaults to vertical while unknown', () => {
    expect(resolveAspect({ format: 'auto', url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', oembed: null })).toBe('vertical')
    expect(resolveAspect({ format: 'auto', url: watch, oembed: null })).toBe('vertical')
  })

  it('classifies sizes', () => {
    expect(aspectFromSize(1920, 1080)).toBe('horizontal')
    expect(aspectFromSize(1080, 1920)).toBe('vertical')
    expect(aspectFromSize(1000, 1020)).toBe('square')
    expect(aspectFromSize(0, 10)).toBeNull()
  })

  it('parses the Notion Format select', () => {
    expect(parseFormat('Vertical')).toBe('vertical')
    expect(parseFormat('HORIZONTAL')).toBe('horizontal')
    expect(parseFormat('Square')).toBe('square')
    expect(parseFormat('Auto')).toBe('auto')
    expect(parseFormat(null)).toBe('auto')
  })
})
