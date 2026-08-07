import { describe, it, expect } from 'vitest'

/**
 * SEED-054 — referral code primitives (pure module, no DB, no secrets).
 *
 * The invariant that matters: normalization is what makes the DB's UNIQUE
 * constraint on `affiliates.code` genuinely case-insensitive. If `?ref=JOAO` and
 * `?ref=joao` ever produced different stored values, one affiliate would silently
 * lose attribution.
 */

import {
  AFFILIATE_CODE_MAX_LENGTH,
  generateAffiliateCode,
  isValidAffiliateCode,
  normalizeAffiliateCode,
  suggestAffiliateCodeFromName,
} from '@/lib/affiliates/code'

describe('normalizeAffiliateCode', () => {
  it('lowercases so ?ref=JOAO and ?ref=joao resolve to one affiliate', () => {
    expect(normalizeAffiliateCode('JOAO')).toBe('joao')
    expect(normalizeAffiliateCode('JoAo')).toBe(normalizeAffiliateCode('joao'))
  })

  it('strips everything outside [a-z0-9]', () => {
    expect(normalizeAffiliateCode('jo-ao_2026!')).toBe('joao2026')
  })

  it('truncates to the DB CHECK max length', () => {
    const long = 'a'.repeat(AFFILIATE_CODE_MAX_LENGTH + 20)
    expect(normalizeAffiliateCode(long)).toHaveLength(AFFILIATE_CODE_MAX_LENGTH)
  })

  it('returns null for values too short to be a code', () => {
    expect(normalizeAffiliateCode('ab')).toBeNull()
    // 3 real chars after stripping punctuation is still below the minimum
    expect(normalizeAffiliateCode('a-b-c')).toBeNull()
  })

  it('returns null (never an empty string) for absent or junk input', () => {
    expect(normalizeAffiliateCode(null)).toBeNull()
    expect(normalizeAffiliateCode(undefined)).toBeNull()
    expect(normalizeAffiliateCode('')).toBeNull()
    expect(normalizeAffiliateCode('!!!!')).toBeNull()
  })

  it('is idempotent — normalizing a normalized code changes nothing', () => {
    const once = normalizeAffiliateCode('João-Silva 2026')!
    expect(normalizeAffiliateCode(once)).toBe(once)
  })
})

describe('isValidAffiliateCode', () => {
  it('accepts the stored form', () => {
    expect(isValidAffiliateCode('joao2026')).toBe(true)
  })

  it('rejects anything not already normalized', () => {
    expect(isValidAffiliateCode('Joao')).toBe(false)
    expect(isValidAffiliateCode('joao-2026')).toBe(false)
    expect(isValidAffiliateCode('abc')).toBe(false)
    expect(isValidAffiliateCode('a'.repeat(AFFILIATE_CODE_MAX_LENGTH + 1))).toBe(false)
  })
})

describe('generateAffiliateCode', () => {
  // Deterministic injected entropy: always take the first symbol.
  const alwaysZero = () => 0

  it('produces a code that satisfies isValidAffiliateCode', () => {
    const code = generateAffiliateCode(alwaysZero)
    expect(isValidAffiliateCode(code)).toBe(true)
  })

  it('honours the requested length', () => {
    expect(generateAffiliateCode(alwaysZero, 12)).toHaveLength(12)
  })

  it('never emits the ambiguous glyphs 0/o/1/l/i', () => {
    // Walk the whole alphabet by feeding every index in turn.
    let i = 0
    const cycle = (max: number) => i++ % max
    const code = generateAffiliateCode(cycle, 64)
    for (const ambiguous of ['0', 'o', '1', 'l', 'i']) {
      expect(code, `emitted ambiguous glyph ${ambiguous}`).not.toContain(ambiguous)
    }
  })
})

describe('suggestAffiliateCodeFromName', () => {
  const alwaysZero = () => 0

  it('strips diacritics rather than dropping the letter', () => {
    expect(suggestAffiliateCodeFromName('João da Silva', alwaysZero)).toBe('joaodasilva')
  })

  it('falls back to a random code when the name yields too little', () => {
    const suggestion = suggestAffiliateCodeFromName('Al', alwaysZero)
    expect(isValidAffiliateCode(suggestion)).toBe(true)
    expect(suggestion).not.toBe('al')
  })
})
