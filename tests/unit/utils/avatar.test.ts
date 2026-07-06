import { describe, it, expect } from 'vitest'
import { getInitials, getAvatarColor, AVATAR_PALETTE } from '@/lib/utils/avatar'

describe('getInitials', () => {
  it('returns first letter of first + last word, uppercased', () => {
    expect(getInitials('Maria Silva')).toBe('MS')
  })

  it('returns first letter only for a single word', () => {
    expect(getInitials('Cher')).toBe('C')
  })

  it('returns "?" for empty string or null (safe fallback, never throws)', () => {
    expect(getInitials('')).toBe('?')
    expect(getInitials(null)).toBe('?')
  })

  it('trims/collapses whitespace and handles lowercase input', () => {
    expect(getInitials('  maria   silva  ')).toBe('MS')
  })
})

describe('getAvatarColor', () => {
  it('is deterministic - returns the exact same value on 5 repeated calls', () => {
    const results = Array.from({ length: 5 }, () => getAvatarColor('Maria Silva'))
    expect(new Set(results.map((r) => r.bg)).size).toBe(1)
    expect(new Set(results.map((r) => r.text)).size).toBe(1)
  })

  it('varies output for at least 2 distinct sample names', () => {
    const a = getAvatarColor('Maria Silva')
    const b = getAvatarColor('Ana Costa')
    expect(a).not.toEqual(b)
  })

  it('always returns a member of the exported AVATAR_PALETTE array', () => {
    const seeds = ['Maria Silva', 'Joao Pedro', 'Cher', '', null, undefined, '+15551234567']
    for (const seed of seeds) {
      const color = getAvatarColor(seed as string | null | undefined)
      expect(AVATAR_PALETTE).toContainEqual(color)
    }
  })
})
