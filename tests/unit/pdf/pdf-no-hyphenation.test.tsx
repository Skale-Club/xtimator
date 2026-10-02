// tests/unit/pdf/pdf-no-hyphenation.test.tsx
//
// react-pdf hyphenates every word by default (English dictionary) — "cabi-
// netry", "Sher-win-Williams". lib/pdf/register-fonts.ts registers a
// hyphenation callback returning each word whole. Two layers of proof:
//   1. The callback is registered and is the identity-split (always runs).
//   2. A REAL render in a deliberately narrow column, text-extracted with
//      poppler's `pdftotext`, contains every word intact. pdftotext is an
//      external binary (no JS PDF text extractor is a project dependency), so
//      this half is skipped, visibly, where the binary is absent.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Document, Page, View, Text, Font, renderToBuffer } from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'

const hasPdftotext = spawnSync('pdftotext', ['-v']).error === undefined

const SENTENCE =
  'Remove existing countertops and backsplash and repaint with Sherwin-Williams Duration interior satin throughout the kitchen'

/** A 110pt-wide column: forces many wraps, so the default engine WOULD hyphenate. */
function narrowColumn() {
  return createElement(
    View,
    { style: { width: 110 } },
    createElement(Text, { style: { fontFamily: 'Inter', fontSize: 10 } }, SENTENCE)
  )
}

function pdftotext(buf: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nohyph-'))
  try {
    const file = path.join(dir, 'out.pdf')
    writeFileSync(file, buf)
    // -layout: plain mode re-joins hyphenated line ends (de-hyphenates), which would hide exactly what we assert on.
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('PDF hyphenation is disabled', () => {
  it('registers a hyphenation callback that never splits a word', () => {
    const cb = Font.getHyphenationCallback()
    expect(typeof cb).toBe('function')
    for (const word of ['countertops', 'Sherwin-Williams', 'Duration', 'a', '']) {
      expect(cb!(word)).toEqual([word])
    }
  })

  it.skipIf(!hasPdftotext)('renders words whole in a narrow column (no inserted hyphen splits)', async () => {
    const el = createElement(
      Document,
      {},
      createElement(
        Page,
        { size: 'LETTER', style: { padding: 40 } },
        narrowColumn()
      )
    )
    const text = pdftotext(Buffer.from(await renderToBuffer(el as never)))
    // Collapse line breaks to spaces: a word must still be whole on its line.
    const words = text.split(/\s+/).filter(Boolean)
    for (const w of SENTENCE.split(' ')) expect(words).toContain(w)
    expect(text).not.toMatch(/[A-Za-z]-\s*\n\s*[a-z]/) // no "coun-\ntertops" style split
  })

  it.skipIf(!hasPdftotext)('control: the same render WITH the default hyphenation does split words', async () => {
    const prev = Font.getHyphenationCallback()
    try {
      Font.registerHyphenationCallback(undefined as never)
      const el = createElement(
        Document,
        {},
        createElement(
          Page,
          { size: 'LETTER', style: { padding: 40 } },
          narrowColumn()
        )
      )
      const text = pdftotext(Buffer.from(await renderToBuffer(el as never)))
      expect(text).toMatch(/[A-Za-z]-\s*\n\s*[a-z]/)
    } finally {
      Font.registerHyphenationCallback(prev as never)
    }
  })
})
