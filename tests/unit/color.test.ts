import { describe, it, expect } from 'vitest'
import { hexToHslTriplet } from '@/lib/color'

describe('lib/color — hexToHslTriplet', () => {
  it('returns an HSL triplet string for a 6-digit hex', () => {
    const result = hexToHslTriplet('#0D9488')
    expect(result).not.toBeNull()
    expect(result!).toMatch(/^\d+\s\d+%\s\d+%$/)
  })

  it('converts pure white (#FFFFFF) to "0 0% 100%"', () => {
    expect(hexToHslTriplet('#FFFFFF')).toBe('0 0% 100%')
  })

  it('converts pure black (#000000) to "0 0% 0%"', () => {
    expect(hexToHslTriplet('#000000')).toBe('0 0% 0%')
  })

  it('returns null for malformed input', () => {
    expect(hexToHslTriplet('not-a-hex')).toBeNull()
    expect(hexToHslTriplet('#ZZZ')).toBeNull()
    expect(hexToHslTriplet('#12345')).toBeNull()
    expect(hexToHslTriplet('')).toBeNull()
  })

  it('accepts 3-digit shorthand (#ABC) and returns a valid triplet', () => {
    const result = hexToHslTriplet('#ABC')
    expect(result).not.toBeNull()
    expect(result!).toMatch(/^\d+\s\d+%\s\d+%$/)
    // #ABC expands to #AABBCC — should be equivalent
    expect(result).toBe(hexToHslTriplet('#AABBCC'))
  })
})
