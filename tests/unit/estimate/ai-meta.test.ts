import { describe, expect, it } from 'vitest'
import { buildAiMeta, isMissingColumnError, parseAiMeta } from '@/lib/estimate/ai-meta'

describe('buildAiMeta', () => {
  it('returns null when the model said nothing', () => {
    expect(buildAiMeta({})).toBeNull()
    expect(buildAiMeta({ assumptions: [], exclusions: [] })).toBeNull()
  })

  it('keeps only what is present', () => {
    expect(
      buildAiMeta({
        assumptions: ['a'],
        open_questions: [{ question: 'q', impact: 'high' }],
        scope_confidence: 'low',
      }),
    ).toEqual({
      v: 1,
      assumptions: ['a'],
      open_questions: [{ question: 'q', impact: 'high' }],
      scope_confidence: 'low',
    })
  })

  it('a quality verdict alone is enough to persist', () => {
    expect(buildAiMeta({}, { score: 60, band: 'review', findings: ['x'] })).toEqual({
      v: 1,
      quality: { score: 60, band: 'review', findings: ['x'] },
    })
  })
})

describe('parseAiMeta', () => {
  it('is tolerant of anything', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}, { assumptions: 'no' }]) {
      expect(parseAiMeta(raw)).toBeNull()
    }
  })

  it('round-trips a built value', () => {
    const built = buildAiMeta(
      { assumptions: ['a'], exclusions: ['e'], open_questions: [{ question: 'q', impact: 'medium' }], scope_confidence: 'high' },
      { score: 82, band: 'ok', findings: [] },
    )
    expect(parseAiMeta(built)).toEqual(built)
  })

  it('defaults a bad impact to medium and drops blank questions', () => {
    expect(
      parseAiMeta({ open_questions: [{ question: ' ok ', impact: 'weird' }, { question: '  ' }, 4] }),
    ).toEqual({ v: 1, open_questions: [{ question: 'ok', impact: 'medium' }] })
  })
})

describe('isMissingColumnError', () => {
  it('recognises the PostgREST schema-cache miss and the Postgres undefined_column error', () => {
    expect(
      isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'ai_meta' column of 'estimates' in the schema cache" }, ['ai_meta']),
    ).toBe(true)
    expect(isMissingColumnError({ code: '42703', message: 'column "basis" of relation "estimate_items" does not exist' }, ['confidence', 'basis'])).toBe(true)
  })

  it('does not swallow unrelated errors', () => {
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value' }, ['ai_meta'])).toBe(false)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'other' column" }, ['ai_meta'])).toBe(false)
    expect(isMissingColumnError(null, ['ai_meta'])).toBe(false)
  })
})
