// ENGINE-02: page geometry (LETTER 612x792pt, pt<->px conversion) must be
// defined in exactly one shared module. Static grep — catches a hand-copied
// literal reappearing anywhere else, including inside a "1056px" CSS suffix
// (a plain \b-bounded regex does NOT match there — see comment below).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function hasBareLiteral(source: string, n: number): boolean {
  // (?<!\d) / (?!\d) exclude only digit neighbors, not letters — so "1056px"
  // and "816px" are caught, but "51056" or "8160" are not false positives.
  const re = new RegExp(`(?<!\\d)${n}(?!\\d)`)
  return re.test(source)
}

function assertNoLiteral(path: string) {
  const source = readFileSync(path, 'utf8')
  for (const n of [612, 792, 816, 1056]) {
    expect(hasBareLiteral(source, n), `${path} contains a bare ${n} literal`).toBe(false)
  }
}

describe('ENGINE-02: LETTER geometry has exactly one source', () => {
  it('lib/estimate/document/tokens.ts declares the canonical constants', () => {
    const source = readFileSync('lib/estimate/document/tokens.ts', 'utf8')
    expect(source).toMatch(/LETTER_WIDTH_PT\s*=\s*612/)
    expect(source).toMatch(/LETTER_HEIGHT_PT\s*=\s*792/)
    expect(source).toMatch(/LETTER_WIDTH_PX/)
    expect(source).toMatch(/LETTER_HEIGHT_PX/)
  })

  // Already-clean sources — zero bare 612/792/816/1056 today AND after the
  // phase (these files never held a hand-copied geometry literal).
  const CLEAN_SOURCES = [
    'components/share/estimate-document-modern.tsx',
    'components/pdf/estimate-pdf.tsx',
    'components/pdf/estimate-pdf-modern.tsx',
  ]
  for (const path of CLEAN_SOURCES) {
    it(`${path} has no bare 612/792/816/1056 literal`, () => assertNoLiteral(path))
  }

  // Still-dirty sources — Plan 182-02 replaces these with tokens.ts
  // references (estimate-document.tsx's pageView min-height AND
  // estimate-editor.tsx's LETTER_PAGE_HEIGHT const + its max-w-[816px]
  // class + its own comment). it.fails: MUST be red right now (proves the
  // defect exists) but NEVER fails CI — vitest reports it.fails GREEN when
  // the wrapped assertion throws as expected. Plan 182-02 converts each
  // entry to the CLEAN_SOURCES list (plain `it()`) once the literal is gone
  // — if it forgets, `it.fails` starts reporting a REAL failure
  // (unexpectedly passing), closing the loop.
  const DIRTY_SOURCES = [
    'components/workspace/estimate/estimate-document.tsx',
    'components/workspace/estimate/estimate-editor.tsx',
  ]
  for (const path of DIRTY_SOURCES) {
    it.fails(`${path} still carries a bare 612/792/816/1056 literal — Plan 182-02 converts this to it()`, () => assertNoLiteral(path))
  }
})
