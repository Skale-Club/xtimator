import { describe, it, expect } from 'vitest'

/**
 * Quick task 260609-mk4 — Task 1.
 *
 * splitReply(text, maxLen) splits an assistant reply into ordered,
 * WhatsApp-sized chunks for sequential sending. Pure function — no I/O.
 */
import { splitReply } from '@/lib/whatsapp/split-reply'

describe('splitReply', () => {
  it('short single-line input → one chunk', () => {
    expect(splitReply('Latest estimate: $1,200.')).toEqual(['Latest estimate: $1,200.'])
  })

  it('paragraph boundaries → one chunk per paragraph, in order', () => {
    const text = 'First point.\n\nSecond point.\n\nThird point.'
    expect(splitReply(text)).toEqual(['First point.', 'Second point.', 'Third point.'])
  })

  it('drops empty / whitespace-only chunks and trims paragraphs', () => {
    const text = '  First.  \n\n   \n\n  Second.  \n\n\n'
    expect(splitReply(text)).toEqual(['First.', 'Second.'])
  })

  it('a single paragraph longer than maxLen is split on sentence boundaries, no chunk exceeds maxLen', () => {
    const para = 'Sentence one is here. Sentence two is here. Sentence three is here.'
    const chunks = splitReply(para, 30)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30)
    // order + content preserved (joined back covers every word)
    expect(chunks.join(' ')).toContain('Sentence one')
    expect(chunks.join(' ')).toContain('Sentence three')
  })

  it('a single sentence longer than maxLen is hard-sliced into maxLen-sized pieces', () => {
    const word = 'x'.repeat(25)
    const chunks = splitReply(word, 10)
    expect(chunks.length).toBe(3)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(10)
    expect(chunks.join('')).toBe(word)
  })

  it('empty input → []', () => {
    expect(splitReply('')).toEqual([])
  })

  it('whitespace-only input → []', () => {
    expect(splitReply('   \n  \n\n  ')).toEqual([])
  })

  it('preserves order across paragraph and sentence splitting', () => {
    const text = 'A one. A two.\n\nB one. B two.'
    const chunks = splitReply(text, 8)
    // Within each oversized paragraph sentences stay in order; paragraphs stay in order.
    const joined = chunks.join(' ')
    expect(joined.indexOf('A one')).toBeLessThan(joined.indexOf('A two'))
    expect(joined.indexOf('A two')).toBeLessThan(joined.indexOf('B one'))
    expect(joined.indexOf('B one')).toBeLessThan(joined.indexOf('B two'))
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(8)
  })
})
