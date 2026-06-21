/**
 * tests/eval/fixtures/load.test.ts
 *
 * EVAL-01/03 unit-level guards: the golden fixtures load with zero network, the
 * 6 cases are present, and the metrics module (reusing the production primitives)
 * scores schema validity + line-item count + grand total + vagueness correctly.
 *
 * No heavy graph/AI imports here — pure data + the two production primitives — so
 * no per-file timeout bump is needed (the harness.test.ts that loads the real
 * graph sets its own timeout).
 */
import { describe, it, expect } from 'vitest'
import { CASES } from './cases'
import { scoreProviderResponse, scorePersistedEstimate } from '../metrics'

describe('EVAL-01: golden fixtures', () => {
  it('loads exactly 6 cases with zero network', () => {
    expect(CASES).toHaveLength(6)
  })

  it('every case has a unique id and a complete expected block', () => {
    const ids = new Set(CASES.map((c) => c.id))
    expect(ids.size).toBe(6)
    for (const c of CASES) {
      expect(c.expected).toMatchObject({
        schemaValid: expect.any(Boolean),
        minLineItems: expect.any(Number),
        positiveTotal: expect.any(Boolean),
        isVague: expect.any(Boolean),
      })
    }
  })

  it('contains the 6 canonical case ids', () => {
    const ids = CASES.map((c) => c.id).sort()
    expect(ids).toEqual(
      [
        'audio-deck-rebuild',
        'mixed-kitchen-reno',
        'photo-roof-repair',
        'schema-drift-guard',
        'text-fence-paint',
        'vague-do-some-work',
      ].sort()
    )
  })
})

describe('EVAL-03: metrics reuse production primitives', () => {
  const byId = (id: string) => CASES.find((c) => c.id === id)!

  it('schema metric accepts valid create_estimate JSON', () => {
    expect(
      scoreProviderResponse(byId('audio-deck-rebuild').providerResponse).schemaValid
    ).toBe(true)
  })

  it('schema metric REJECTS drifted output (has teeth)', () => {
    expect(
      scoreProviderResponse(byId('schema-drift-guard').providerResponse).schemaValid
    ).toBe(false)
  })

  it('every case providerResponse schema validity matches expected.schemaValid', () => {
    for (const c of CASES) {
      expect(scoreProviderResponse(c.providerResponse).schemaValid).toBe(
        c.expected.schemaValid
      )
    }
  })

  it('persisted-estimate metric: empty/zero estimate is vague', () => {
    const m = scorePersistedEstimate({ total: 0, sections: [] })
    expect(m.isVague).toBe(true)
    expect(m.lineItemCount).toBe(0)
    expect(m.grandTotal).toBe(0)
  })

  it('persisted-estimate metric: counts items, reads total, not vague', () => {
    const m = scorePersistedEstimate({
      total: 1200,
      sections: [{ items: [{}, {}, {}] }],
    })
    expect(m.lineItemCount).toBe(3)
    expect(m.grandTotal).toBe(1200)
    expect(m.isVague).toBe(false)
  })
})
