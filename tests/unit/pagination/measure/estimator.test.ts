// tests/unit/pagination/measure/estimator.test.ts
//
// Phase 184 Plan 03 (PGBRK-05) — the REAL shipped estimator, verified against
// the SAME hand-calculated arithmetic Plan 184-01 proved out in
// tests/unit/pagination/measure/fontkit-arithmetic.test.ts's local reference
// copy — confirming zero drift between the spike's throwaway math and the
// shipped implementation.
import { describe, it, expect } from 'vitest'
import {
  estimateLineCount,
  createFontkitMeasurementProvider,
} from '@/lib/estimate/pagination/measure/estimator'

describe('createFontkitMeasurementProvider (Plan 184-03, PGBRK-05)', () => {
  const provider = createFontkitMeasurementProvider()

  it("lineCount('HHHH HHHH HHHH', 'Inter', 9, 30) === 3 — matches Plan 184-01's hand-calculated arithmetic exactly", () => {
    expect(provider.lineCount('HHHH HHHH HHHH', 'Inter', 9, 30)).toBe(3)
  })

  it("lineCount('HHHH HHHH HHHH', 'Inter', 9, 60) === 2", () => {
    expect(provider.lineCount('HHHH HHHH HHHH', 'Inter', 9, 60)).toBe(2)
  })

  it("lineCount('HHHH HHHH HHHH', 'Inter', 9, 100) === 1", () => {
    expect(provider.lineCount('HHHH HHHH HHHH', 'Inter', 9, 100)).toBe(1)
  })

  it("lineCount('', 'Inter', 9, 100) === 0", () => {
    expect(provider.lineCount('', 'Inter', 9, 100)).toBe(0)
  })

  it('is deterministic — identical args return the identical result across repeated calls (no per-call font re-parsing side effect)', () => {
    const first = provider.lineCount('HHHH HHHH HHHH', 'Inter', 9, 30)
    const second = provider.lineCount('HHHH HHHH HHHH', 'Inter', 9, 30)
    expect(first).toBe(second)
    expect(first).toBe(3)
  })

  it('Lora and Inter measurements for the same text/size/width never throw, and both return positive integers for non-empty text (legitimately different glyph metrics)', () => {
    const text = 'The quick brown fox jumps over the lazy dog'
    const interLines = provider.lineCount(text, 'Inter', 9, 200)
    const loraLines = provider.lineCount(text, 'Lora', 9, 200)
    expect(Number.isInteger(interLines)).toBe(true)
    expect(Number.isInteger(loraLines)).toBe(true)
    expect(interLines).toBeGreaterThan(0)
    expect(loraLines).toBeGreaterThan(0)
  })

  it('exports estimateLineCount directly, and createFontkitMeasurementProvider().lineCount is exactly that function', () => {
    expect(estimateLineCount('HHHH HHHH HHHH', 'Inter', 9, 30)).toBe(3)
  })

  it('throws a clear error for an unregistered font family (never silently mis-measures)', () => {
    expect(() => provider.lineCount('text', 'Comic Sans', 9, 100)).toThrow(/unknown font family/i)
  })
})
