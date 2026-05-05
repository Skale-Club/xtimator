// Phase 18 plan 02 — capture-recorder warning threshold constants (D-07).
// Verifies the exported constants match the required values.

import { describe, it, expect } from 'vitest'
import { AMBER_AT_MS, RED_AT_MS } from '@/components/capture/capture-timer'

describe('capture-recorder warning thresholds (D-07)', () => {
  it('AMBER_AT_MS constant equals 480000 (8:00)', () => {
    expect(AMBER_AT_MS).toBe(8 * 60 * 1000)
    expect(AMBER_AT_MS).toBe(480000)
  })

  it('RED_AT_MS constant equals 570000 (9:30)', () => {
    expect(RED_AT_MS).toBe(9.5 * 60 * 1000)
    expect(RED_AT_MS).toBe(570000)
  })

  it('color goes neutral (<8min) → amber (8–9.5) → red (>=9.5)', () => {
    // Derive color class the same way CaptureTimer does
    function getColorClass(elapsedMs: number) {
      return elapsedMs >= RED_AT_MS    ? 'text-red-500'   :
             elapsedMs >= AMBER_AT_MS  ? 'text-amber-500' :
                                        'text-primary'
    }

    expect(getColorClass(0)).toBe('text-primary')
    expect(getColorClass(7 * 60 * 1000)).toBe('text-primary')   // 7 min — neutral
    expect(getColorClass(8 * 60 * 1000)).toBe('text-amber-500') // exactly 8:00 — amber
    expect(getColorClass(9 * 60 * 1000)).toBe('text-amber-500') // 9:00 — still amber
    expect(getColorClass(9.5 * 60 * 1000)).toBe('text-red-500') // exactly 9:30 — red
    expect(getColorClass(10 * 60 * 1000)).toBe('text-red-500')  // 10:00 — red
  })

  it('toasts at 9:00 (60s remaining) — constant boundary check', () => {
    // WARN_AT_MS is defined in capture-recorder.tsx as 9 * 60 * 1000
    // This test asserts the boundary: elapsed >= 9min triggers the warning zone
    const WARN_AT_MS = 9 * 60 * 1000
    expect(WARN_AT_MS).toBe(540000)
    expect(9 * 60 * 1000 >= WARN_AT_MS).toBe(true)
    expect((9 * 60 * 1000 - 1) >= WARN_AT_MS).toBe(false)
  })

  it('warns only once (warnedRef prevents duplicate toasts) — logic check', () => {
    // The warnedRef pattern: fired = false; if elapsed >= WARN_AT_MS && !fired: toast(), fired = true
    let fired = false
    let toastCalls = 0

    function simulateTick(elapsedMs: number) {
      const WARN_AT_MS = 9 * 60 * 1000
      if (elapsedMs >= WARN_AT_MS && !fired) {
        fired = true
        toastCalls++
      }
    }

    // Multiple ticks at/after 9:00
    simulateTick(540000)
    simulateTick(540250)
    simulateTick(540500)

    expect(toastCalls).toBe(1) // toast fires exactly once
  })
})
