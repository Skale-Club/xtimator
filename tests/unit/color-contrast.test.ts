import { describe, it, expect } from 'vitest'
import {
  hexToRgb,
  relativeLuminance,
  contrastRatio,
  readableTextColor,
  ensureReadableOnWhite,
} from '@/lib/color/contrast'
import { hexToHslTriplet } from '@/lib/color'

// Extracts the hue (H) integer from an 'H S% L%' triplet.
function hueOf(hex: string): number {
  const triplet = hexToHslTriplet(hex)
  expect(triplet).not.toBeNull()
  return parseInt(triplet!.split(' ')[0], 10)
}

describe('lib/color/contrast — hexToRgb', () => {
  it('parses a 6-digit hex', () => {
    expect(hexToRgb('#FFFACD')).toEqual({ r: 255, g: 250, b: 205 })
  })

  it('parses without a leading #', () => {
    expect(hexToRgb('FFFACD')).toEqual({ r: 255, g: 250, b: 205 })
  })

  it('expands a 3-digit shorthand', () => {
    expect(hexToRgb('#ABC')).toEqual(hexToRgb('#AABBCC'))
  })

  it('returns null for malformed input', () => {
    expect(hexToRgb('not-a-hex')).toBeNull()
    expect(hexToRgb('#ZZZ')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
    expect(hexToRgb('')).toBeNull()
    // @ts-expect-error — runtime guard for non-string
    expect(hexToRgb(null)).toBeNull()
  })
})

describe('lib/color/contrast — relativeLuminance', () => {
  it('is ~1 for white and ~0 for black', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
  })
})

describe('lib/color/contrast — contrastRatio', () => {
  it('is ~21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('is ~1 for white on white', () => {
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('is order-independent', () => {
    expect(contrastRatio('#406EF1', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#406EF1'),
      5,
    )
  })

  it('does not throw on invalid input (treats it as black)', () => {
    expect(() => contrastRatio('nope', '#ffffff')).not.toThrow()
    expect(contrastRatio('nope', '#ffffff')).toBeCloseTo(21, 1)
    expect(() => contrastRatio('#ffffff', 'nope')).not.toThrow()
  })
})

describe('lib/color/contrast — readableTextColor', () => {
  it('returns black for a light background', () => {
    expect(readableTextColor('#FFFACD')).toBe('#000000')
    expect(readableTextColor('#ffffff')).toBe('#000000')
  })

  it('returns white for a dark background', () => {
    expect(readableTextColor('#1A1A1A')).toBe('#ffffff')
    expect(readableTextColor('#000000')).toBe('#ffffff')
  })

  it('returns black (safe default) for invalid input', () => {
    expect(readableTextColor('not-a-hex')).toBe('#000000')
  })
})

describe('lib/color/contrast — ensureReadableOnWhite', () => {
  it('darkens a light brand color until it passes 4.5:1 on white, preserving hue', () => {
    const light = '#FFFACD' // lemon chiffon — fails on white
    expect(contrastRatio(light, '#ffffff')).toBeLessThan(4.5)

    const adapted = ensureReadableOnWhite(light)
    expect(contrastRatio(adapted, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // Hue preserved within a small tolerance.
    expect(Math.abs(hueOf(adapted) - hueOf(light))).toBeLessThanOrEqual(2)
  })

  it('leaves a dark brand color that already passes unchanged', () => {
    expect(ensureReadableOnWhite('#1A1A1A')).toBe('#1A1A1A')
  })

  it('darkens the system primary if it does not already pass, preserving hue', () => {
    const primary = '#406EF1'
    const adapted = ensureReadableOnWhite(primary)
    expect(contrastRatio(adapted, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    if (adapted !== primary) {
      expect(Math.abs(hueOf(adapted) - hueOf(primary))).toBeLessThanOrEqual(2)
    }
  })

  it('returns black (safe default) for invalid input', () => {
    expect(ensureReadableOnWhite('not-a-hex')).toBe('#000000')
    expect(ensureReadableOnWhite('')).toBe('#000000')
  })

  it('never produces a result that fails contrast for a mid-tone color', () => {
    const mid = '#7FA4F4' // secondary — light-ish blue
    const adapted = ensureReadableOnWhite(mid)
    expect(contrastRatio(adapted, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})
