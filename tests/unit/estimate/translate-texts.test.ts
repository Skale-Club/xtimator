import { describe, it, expect } from 'vitest'
import { applyEstimateTranslations, collectEstimateTexts } from '@/lib/estimate/translate-texts'

const estimate = {
  summary: 'Repaint the living room',
  notes: null,
  timeline: '2 weeks',
  payment_terms: '50% upfront',
  warranty_terms: '',
  sections: [
    {
      id: 's1',
      title: 'Labor',
      items: [
        { id: 'i1', description: 'Paint walls', quantity: 1 },
        { id: 'i2', description: 'Paint walls', quantity: 2 },
        { id: 'i3', description: '100', quantity: 1 },
      ],
    },
  ],
}

describe('collectEstimateTexts', () => {
  it('collects unique texts with letters, header first', () => {
    expect(collectEstimateTexts(estimate)).toEqual([
      'Repaint the living room',
      '2 weeks',
      '50% upfront',
      'Labor',
      'Paint walls',
    ])
  })
})

describe('applyEstimateTranslations', () => {
  it('replaces every occurrence and keeps the rest of the row', () => {
    const out = applyEstimateTranslations(estimate, [
      'Pintar a sala',
      '2 semanas',
      '50% adiantado',
      'Mão de obra',
      'Pintar paredes',
    ])
    expect(out.summary).toBe('Pintar a sala')
    expect(out.notes).toBeNull()
    expect(out.warranty_terms).toBe('')
    expect(out.sections[0].title).toBe('Mão de obra')
    expect(out.sections[0].items.map((i) => i.description)).toEqual(['Pintar paredes', 'Pintar paredes', '100'])
    expect(out.sections[0].items[1].quantity).toBe(2)
  })

  it('keeps the original when a translation is blank', () => {
    const out = applyEstimateTranslations(estimate, ['', '2 semanas', '50% adiantado', 'Mão de obra', 'Pintar paredes'])
    expect(out.summary).toBe('Repaint the living room')
  })
})
