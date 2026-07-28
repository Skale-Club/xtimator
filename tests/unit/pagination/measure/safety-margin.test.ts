// tests/unit/pagination/measure/safety-margin.test.ts
//
// Plan 184-01, Task 2 — asserts SAFETY_MARGIN_LINES is a valid non-negative
// integer, AND that its source file stays a zero-dependency constant (no
// imports) so it can never accidentally pull in fontkit/linebreak/node:fs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SAFETY_MARGIN_LINES } from '@/lib/estimate/pagination/measure/safety-margin'

describe('SAFETY_MARGIN_LINES (PGBRK-05, derived from 184-DRIFT-REPORT.md)', () => {
  it('is a non-negative integer', () => {
    expect(Number.isInteger(SAFETY_MARGIN_LINES)).toBe(true)
    expect(SAFETY_MARGIN_LINES >= 0).toBe(true)
  })

  it('safety-margin.ts has zero import lines (stays a dependency-free constant)', () => {
    const source = readFileSync('lib/estimate/pagination/measure/safety-margin.ts', 'utf8')
    const importLines = source.match(/^import/gm) ?? []
    expect(importLines.length).toBe(0)
  })
})
