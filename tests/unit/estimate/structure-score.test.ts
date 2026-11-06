import { describe, expect, it } from 'vitest'
import {
  mentionsMeasurements,
  scoreStructure,
  type StructureInput,
  type StructureItem,
} from '@/lib/estimate/quality/structure-score'
import { getPlaybook } from '@/lib/ai/playbooks'

// SEED-057 Phase D: a deterministic structure score with specific findings.

const painting = getPlaybook('painting')

const item = (over: Partial<StructureItem> = {}): StructureItem => ({
  description: 'Paint walls, two coats',
  quantity: 100,
  unit: 'sq ft',
  unit_price: 2,
  basis: 'from the stated 12 x 14 ft room',
  ...over,
})

const GOOD: StructureInput = {
  summary: 'Repaint the walls, ceiling and trim of the bedroom.',
  playbook: painting,
  hasMeasurements: true,
  openQuestions: 1,
  sections: [
    { title: 'Prep and protection', items: [item({ description: 'Patch, sand and mask floors', quantity: 1, unit: 'job', unit_price: 160 })] },
    { title: 'Walls', items: [item()] },
    { title: 'Ceilings', items: [item({ description: 'Paint ceiling', quantity: 168, unit_price: 1.4 })] },
    { title: 'Cleanup', items: [item({ description: 'Cleanup and disposal', quantity: 1, unit: 'job', unit_price: 45 })] },
  ],
}

const codes = (r: ReturnType<typeof scoreStructure>) => r.findings.map((f) => f.code)

describe('scoreStructure', () => {
  it('a well-structured estimate scores 100 with no findings', () => {
    const r = scoreStructure(GOOD)
    expect(r.score).toBe(100)
    expect(r.band).toBe('ok')
    expect(r.findings).toEqual([])
  })

  it('catches the three-line misc estimate that the $0 gate lets through', () => {
    const r = scoreStructure({
      summary: 'Bedroom work.',
      playbook: painting,
      sections: [
        {
          title: 'Other',
          items: [
            { description: 'Miscellaneous painting work', quantity: 1, unit: 'job', unit_price: 2000 },
            { description: 'Materials', quantity: 1, unit: 'job', unit_price: 300 },
          ],
        },
      ],
    })
    expect(codes(r)).toEqual(expect.arrayContaining(['thin_estimate', 'misc_heavy', 'missing_summary']))
    expect(r.band).not.toBe('ok')
  })

  it('a small honest job is not "thin"', () => {
    const r = scoreStructure({
      summary: 'Replace the kitchen faucet at the client home.',
      playbook: getPlaybook('plumbing'),
      sections: [{ title: 'Fixtures', items: [item({ description: 'Replace kitchen faucet', quantity: 1, unit: 'each', unit_price: 165 })] }],
    })
    expect(codes(r)).not.toContain('thin_estimate')
    expect(r.band).toBe('ok')
  })

  it('flags empty sections', () => {
    const r = scoreStructure({ ...GOOD, sections: [...GOOD.sections, { title: 'Exterior', items: [] }] })
    expect(codes(r)).toContain('empty_section')
    expect(r.findings.find((f) => f.code === 'empty_section')!.message).toContain('Exterior')
  })

  it('flags units outside the closed list (English) and missing units', () => {
    const r = scoreStructure({
      ...GOOD,
      sections: [{ title: 'Walls', items: [item({ unit: 'gallons' }), item({ unit: null }), item({ unit: 'sqft' })] }],
    })
    const finding = r.findings.find((f) => f.code === 'bad_unit')!
    expect(finding).toBeDefined()
    // sqft folds into the closed list, so only the first two are named.
    expect(finding.message).toContain('2 lines')
  })

  it('units stay US in every language: a metric unit is flagged, a closed-list unit is not', () => {
    const us = scoreStructure({ ...GOOD, language: 'pt', sections: [{ title: 'Paredes', items: [item({ unit: 'sq ft' }), item({ unit: 'horas' })] }] })
    expect(codes(us)).not.toContain('bad_unit')
    expect(codes(us)).not.toContain('off_vocabulary')
    expect(codes(us)).not.toContain('missing_mandatory')
    const metric = scoreStructure({ ...GOOD, language: 'pt', sections: [{ title: 'Paredes', items: [item({ unit: 'm2' }), item({ unit: 'sq ft' })] }] })
    expect(codes(metric)).toContain('bad_unit')
  })

  it('owner messages come in the estimate language (en / pt / es), hints stay English', () => {
    const bad = (language: 'en' | 'pt' | 'es') =>
      scoreStructure({ ...GOOD, summary: '', language, sections: [{ title: 'Paredes', items: [item({ unit: null, quantity: 0 }), item({ description: 'Outra', unit: null })] }] })
    const msgs = (r: ReturnType<typeof scoreStructure>) => Object.fromEntries(r.findings.map((f) => [f.code, f.message]))
    expect(msgs(bad('en')).missing_summary).toBe('No scope summary.')
    expect(msgs(bad('pt')).missing_summary).toBe('Sem resumo do escopo.')
    expect(msgs(bad('es')).missing_summary).toBe('Sin resumen del alcance.')
    expect(msgs(bad('pt')).bad_unit).toMatch(/sem unidade padrão/)
    expect(msgs(bad('es')).bad_unit).toMatch(/sin unidad estándar/)
    expect(msgs(bad('pt')).zero_quantity).toMatch(/sem quantidade/)
    for (const lang of ['en', 'pt', 'es'] as const) {
      for (const f of bad(lang).findings) {
        expect(f.hint).toMatch(/[A-Za-z]/)
        expect(f.hint).not.toMatch(/sem unidade|sin unidad|Sem resumo|Sin resumen/)
      }
    }
  })

  it('every message exists in every language and mentions the same counts', () => {
    const many = (language: 'en' | 'pt' | 'es') =>
      scoreStructure({
        summary: 'Resumo longo o suficiente para passar da regra.',
        language,
        playbook: painting,
        openQuestions: 7,
        sections: [
          { title: 'A', items: [item({ unit: null }), item({ unit: null }), item({ description: 'Miscellaneous', unit: 'job', quantity: 1, unit_price: 9999 })] },
          { title: 'B', items: [] },
        ],
      })
    for (const lang of ['pt', 'es'] as const) {
      const r = many(lang)
      for (const code of ['empty_section', 'bad_unit', 'misc_heavy', 'too_many_questions'] as const) {
        const f = r.findings.find((x) => x.code === code)
        expect(f, `${lang}/${code}`).toBeDefined()
      }
      expect(r.findings.find((x) => x.code === 'too_many_questions')!.message).toContain('7')
    }
  })

  it('a metric unit gets a clear "estimates use US units" message (en / pt / es), not the generic one', () => {
    const run = (language: 'en' | 'pt' | 'es', unit: string) =>
      scoreStructure({ ...GOOD, language, sections: [{ title: 'Walls', items: [item({ unit }), item({ unit: 'sq ft' })] }] }).findings.find((f) => f.code === 'bad_unit')!
    expect(run('en', 'm2').message).toMatch(/metric unit \(estimates use US units\)/)
    expect(run('pt', 'm²').message).toMatch(/unidade métrica \(os orçamentos usam unidades dos EUA\)/)
    expect(run('es', 'm').message).toMatch(/unidad métrica \(los presupuestos usan unidades de EE\. UU\.\)/)
    expect(run('en', 'm2').hint).toMatch(/US units/)
    // a non-metric odd unit keeps the generic message
    expect(run('en', 'gallons').message).toMatch(/without a standard unit/)
  })

  it('flags a priced line with no quantity', () => {
    const r = scoreStructure({ ...GOOD, sections: [{ title: 'Walls', items: [item({ quantity: 0 })] }] })
    expect(codes(r)).toContain('zero_quantity')
  })

  it('wants a basis only when the source states measurements', () => {
    const noBasis = GOOD.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, basis: undefined })) }))
    expect(codes(scoreStructure({ ...GOOD, sections: noBasis, hasMeasurements: true }))).toContain('missing_basis')
    expect(codes(scoreStructure({ ...GOOD, sections: noBasis, hasMeasurements: false }))).not.toContain('missing_basis')
  })

  it('wants the playbook mandatory lines on estimates big enough to need them', () => {
    const bare = {
      ...GOOD,
      sections: [
        { title: 'Walls', items: [item({ description: 'Paint living room walls' }), item({ description: 'Paint hallway walls' })] },
        { title: 'Ceilings', items: [item({ description: 'Paint ceilings' }), item({ description: 'Paint closet ceiling' })] },
      ],
    }
    const r = scoreStructure(bare)
    expect(codes(r)).toContain('missing_mandatory')
    const text = r.findings.find((f) => f.code === 'missing_mandatory')!.message
    expect(text).toContain('prep')
    expect(text).toContain('cleanup')
    // ...but a three-line job does not owe a cleanup line.
    expect(codes(scoreStructure({ ...bare, sections: [{ title: 'Walls', items: bare.sections[0].items.concat(bare.sections[1].items.slice(0, 1)) }] }))).not.toContain('missing_mandatory')
  })

  it('flags repeated descriptions', () => {
    const r = scoreStructure({
      ...GOOD,
      sections: [{ title: 'Walls', items: [item(), item({ quantity: 50 }), item({ description: 'Paint ceiling' })] }],
    })
    expect(codes(r)).toContain('duplicate_description')
  })

  it('flags a misc bucket above 15% of the total, and not below', () => {
    const heavy = scoreStructure({
      ...GOOD,
      sections: [
        { title: 'Walls', items: [item({ quantity: 100, unit_price: 5 })] },
        { title: 'Other', items: [item({ description: 'Sundries', quantity: 1, unit: 'job', unit_price: 300 })] },
      ],
    })
    expect(codes(heavy)).toContain('misc_heavy')
    const light = scoreStructure({
      ...GOOD,
      sections: [
        { title: 'Walls', items: [item({ quantity: 100, unit_price: 50 })] },
        { title: 'Other', items: [item({ description: 'Sundries', quantity: 1, unit: 'job', unit_price: 300 })] },
      ],
    })
    expect(codes(light)).not.toContain('misc_heavy')
  })

  it('flags a missing summary and too many open questions', () => {
    expect(codes(scoreStructure({ ...GOOD, summary: '' }))).toContain('missing_summary')
    expect(codes(scoreStructure({ ...GOOD, summary: 'Short.' }))).toContain('missing_summary')
    expect(codes(scoreStructure({ ...GOOD, openQuestions: 7 }))).toContain('too_many_questions')
    expect(codes(scoreStructure({ ...GOOD, openQuestions: 5 }))).not.toContain('too_many_questions')
  })

  it('flags section titles outside the playbook vocabulary, but allows Other and Add-ons', () => {
    const off = scoreStructure({ ...GOOD, sections: [{ title: 'Phase One Magic', items: [item()] }, ...GOOD.sections] })
    expect(codes(off)).toContain('off_vocabulary')
    const fine = scoreStructure({ ...GOOD, sections: [...GOOD.sections, { title: 'Add-ons', items: [item({ description: 'Paint garage door' })] }] })
    expect(codes(fine)).not.toContain('off_vocabulary')
  })

  it('bands: refine below 50, review 50-69, ok from 70', () => {
    const refine = scoreStructure({
      summary: '',
      playbook: painting,
      hasMeasurements: true,
      openQuestions: 9,
      sections: [
        { title: 'Phase One', items: [{ description: 'Misc work', quantity: 0, unit: null, unit_price: 3000 }, { description: 'Misc work', quantity: 0, unit: null, unit_price: 3000 }] },
        { title: 'Walls', items: [] },
        { title: 'Ceilings', items: [] },
      ],
    })
    expect(refine.score).toBeLessThan(50)
    expect(refine.band).toBe('refine')

    const review = scoreStructure({ ...GOOD, summary: '', openQuestions: 3, sections: [{ title: 'Walls', items: [item({ unit: null }), item({ description: 'Paint trim', unit: null }), item({ description: 'Paint doors', unit: null }), item({ description: 'Paint ceilings', unit: null })] }] })
    expect(review.score).toBeGreaterThanOrEqual(50)
    expect(review.score).toBeLessThan(70)
    expect(review.band).toBe('review')
  })

  it('never throws on degenerate input and never leaves 0-100', () => {
    const odd = scoreStructure({
      summary: undefined,
      playbook: painting,
      sections: [{ title: '', items: undefined as never }, null as never],
    } as never)
    expect(odd.score).toBeGreaterThanOrEqual(0)
    expect(odd.score).toBeLessThanOrEqual(100)
    expect(scoreStructure({ playbook: painting, sections: undefined as never }).score).toBeLessThanOrEqual(100)
  })

  it('every finding carries an owner message and a model hint', () => {
    const r = scoreStructure({ ...GOOD, summary: '', sections: [{ title: 'Other', items: [item({ unit: null, quantity: 0 })] }] })
    expect(r.findings.length).toBeGreaterThan(2)
    for (const f of r.findings) {
      expect(f.message.length).toBeGreaterThan(0)
      expect(f.hint.length).toBeGreaterThan(0)
      expect(f.penalty).toBeGreaterThan(0)
    }
  })
})

describe('mentionsMeasurements', () => {
  it.each([
    ['The room is 12 by 14 feet', true],
    ['about 200 square feet of deck', true],
    ['tamanho 12 x 14', true],
    ['it is a big room', false],
    ['two bedrooms and a bath', false],
  ])('%s -> %s', (text, expected) => {
    expect(mentionsMeasurements(text)).toBe(expected)
  })
})
