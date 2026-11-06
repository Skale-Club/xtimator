import { describe, expect, it } from 'vitest'
import { GOLDEN_CASES } from './golden/cases'
import { scoreAgainstRubric, summarise, RUBRIC_WEIGHTS } from './rubric'
import { PLAYBOOK_IDS } from '@/lib/ai/playbooks'
import { estimateOutputSchema } from '@/lib/ai/schema'
import type { EstimateOutput } from '@/lib/ai/types'

// SEED-057 Phase F: the golden set and the rubric are checked in CI against the
// hand-written REFERENCE answers, with no model and no network. A rubric nobody
// validates drifts; this keeps it honest, and any change to the production
// structure score is judged against the same references.

const clone = (e: EstimateOutput): EstimateOutput => JSON.parse(JSON.stringify(e))

describe('golden set', () => {
  it('has 15-20 cases with unique ids', () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(15)
    expect(GOLDEN_CASES.length).toBeLessThanOrEqual(20)
    expect(new Set(GOLDEN_CASES.map((c) => c.id)).size).toBe(GOLDEN_CASES.length)
  })

  it('covers every trade in English and in Portuguese', () => {
    for (const trade of PLAYBOOK_IDS.filter((t) => t !== 'general')) {
      for (const language of ['en', 'pt'] as const) {
        expect(
          GOLDEN_CASES.some((c) => c.trade === trade && c.language === language && !c.ambiguity),
          `${trade}/${language}`,
        ).toBe(true)
      }
    }
  })

  it('includes deliberately ambiguous cases', () => {
    const ambiguous = GOLDEN_CASES.filter((c) => c.ambiguity)
    expect(ambiguous.length).toBeGreaterThanOrEqual(2)
    for (const c of ambiguous) {
      expect(c.expect.needsAssumptions || c.expect.needsOpenQuestions).toBe(true)
    }
  })

  it('is synthetic: no emails, phones, URLs, street addresses or key-shaped strings', () => {
    const patterns: Array<[string, RegExp]> = [
      ['email', /[\w.+-]+@[\w-]+\.[\w.]+/],
      ['phone', /\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/],
      ['url', /https?:\/\/|www\./i],
      ['address', /\b\d{2,5}\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Rua|Avenida)\b/],
      ['key', /\b(sk|rk|whsec|re)_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9-]{8,}|sb_secret_/],
      ['ssn', /\b\d{3}-\d{2}-\d{4}\b/],
    ]
    for (const c of GOLDEN_CASES) {
      const text = JSON.stringify([c.inputs, c.reference, c.description])
      for (const [name, re] of patterns) {
        expect(re.test(text), `${c.id} matches ${name}`).toBe(false)
      }
    }
  })

  it.each(GOLDEN_CASES.map((c) => [c.id, c] as const))('%s: the reference parses through the production schema', (_id, c) => {
    expect(estimateOutputSchema.safeParse(c.reference).success).toBe(true)
  })
})

describe('rubric weights', () => {
  it('sum to 100', () => {
    expect(Object.values(RUBRIC_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('the references clear the rubric', () => {
  it.each(GOLDEN_CASES.map((c) => [c.id, c] as const))('%s scores >= 90', (_id, c) => {
    const result = scoreAgainstRubric(c, c.reference)
    expect(result.failures, result.failures.join('\n')).toEqual([])
    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('the mean is high and the summary is consistent', () => {
    const results = GOLDEN_CASES.map((c) => ({ id: c.id, result: scoreAgainstRubric(c, c.reference) }))
    const summary = summarise(results)
    expect(summary.mean).toBeGreaterThanOrEqual(95)
    expect(summary.perCase).toHaveLength(GOLDEN_CASES.length)
    expect(summary.min).toBeGreaterThanOrEqual(90)
  })
})

describe('the rubric has teeth', () => {
  const painting = GOLDEN_CASES.find((c) => c.id === 'painting-en-bedroom')!
  const vague = GOLDEN_CASES.find((c) => c.id === 'cleaning-en-missing-size')!

  it('a thin "misc" estimate scores far below the reference', () => {
    const thin: EstimateOutput = {
      suggested_project_name: 'x',
      summary: 'Painting.',
      sections: [{ title: 'Other', items: [{ description: 'Miscellaneous painting work', quantity: 1, unit_price: 2400, price_source: 'ai_estimate' }] }],
    }
    const result = scoreAgainstRubric(painting, thin)
    expect(result.score).toBeLessThan(40)
    expect(result.failures.length).toBeGreaterThan(5)
  })

  it('quantities that ignore the stated measurements are caught', () => {
    const wrong = clone(painting.reference)
    for (const s of wrong.sections) for (const i of s.items) if (i.unit === 'sq ft') i.quantity *= 3
    const result = scoreAgainstRubric(painting, wrong)
    expect(result.parts.quantities).toBeLessThan(1)
    expect(result.failures.some((f) => f.startsWith('quantities:'))).toBe(true)
  })

  it('the right quantity in the wrong unit fails an English case', () => {
    const wrongUnit = clone(painting.reference)
    for (const s of wrongUnit.sections) for (const i of s.items) if (i.description.toLowerCase().includes('ceiling')) i.unit = 'job'
    expect(scoreAgainstRubric(painting, wrongUnit).failures.some((f) => f.includes('ceiling area'))).toBe(true)
  })

  it('a missing expected section is caught', () => {
    const noCeiling = clone(painting.reference)
    noCeiling.sections = noCeiling.sections.filter((s) => !s.title.toLowerCase().includes('ceiling'))
    const result = scoreAgainstRubric(painting, noCeiling)
    expect(result.failures).toContain('sections: no section for "ceiling"')
    expect(result.failures).toContain('concepts: no line for ceiling')
  })

  it('a total far outside the band is caught', () => {
    const huge = clone(painting.reference)
    huge.sections[1].items[0].unit_price *= 20
    const result = scoreAgainstRubric(painting, huge)
    expect(result.parts.total).toBe(0)
  })

  it('confident numbers on an under-specified job lose the notes points', () => {
    const confident = clone(vague.reference)
    delete confident.assumptions
    delete confident.open_questions
    const result = scoreAgainstRubric(vague, confident)
    expect(result.parts.notes).toBe(0)
    expect(result.failures.some((f) => f.startsWith('notes:'))).toBe(true)
    expect(result.score).toBeLessThan(scoreAgainstRubric(vague, vague.reference).score)
  })

  it('a category with nothing to check drops out instead of penalising', () => {
    const result = scoreAgainstRubric(vague, vague.reference)
    expect(result.parts.quantities).toBeNull()
    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('never throws on degenerate output', () => {
    const empty = { suggested_project_name: '', summary: '', sections: [] } as EstimateOutput
    expect(() => scoreAgainstRubric(painting, empty)).not.toThrow()
    expect(scoreAgainstRubric(painting, empty).score).toBeLessThan(40)
  })
})
