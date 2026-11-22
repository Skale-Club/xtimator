import { describe, it, expect } from 'vitest'
import { displayUnit } from '@/lib/estimate/document/units'
import { LABELS } from '@/lib/estimate/document/labels'

describe('displayUnit', () => {
  it('leaves English untouched', () => {
    expect(displayUnit('visit', 'en', 1)).toBe('visit')
    expect(displayUnit('each', null, 1)).toBe('each')
  })

  it('translates canonical and extra units to Portuguese', () => {
    expect(displayUnit('visit', 'pt', 1)).toBe('visita')
    expect(displayUnit('each', 'pt', 1)).toBe('unidade')
    expect(displayUnit('hour', 'pt', 2)).toBe('horas')
    expect(displayUnit('sq ft', 'pt', 10)).toBe('pés²')
    expect(displayUnit('linear ft', 'pt', 1)).toBe('pé linear')
    expect(displayUnit('cu yd', 'pt', 3)).toBe('jardas³')
    expect(displayUnit('job', 'pt', 1)).toBe('serviço')
    expect(displayUnit('room', 'pt', 2)).toBe('cômodos')
  })

  it('translates to Spanish and folds synonyms', () => {
    expect(displayUnit('hr', 'es', 1)).toBe('hora')
    expect(displayUnit('Sq. Ft.', 'es', 5)).toBe('pies²')
    expect(displayUnit('lump sum', 'es', 1)).toBe('servicio')
    expect(displayUnit('window', 'es', 2)).toBe('ventanas')
    expect(displayUnit('day', 'es', 1)).toBe('día')
  })

  it('keeps unknown free text as typed', () => {
    expect(displayUnit('per pallet', 'pt', 1)).toBe('per pallet')
    expect(displayUnit('m²', 'es', 1)).toBe('m²')
  })

  it('returns empty for missing units', () => {
    expect(displayUnit(null, 'pt')).toBe('')
  })
})

describe('estimate number label', () => {
  it('puts a space between the label and the number in pt and es', () => {
    expect(`${LABELS.pt.estimateNum}SK-1049`).toBe('Orçamento Nº SK-1049')
    expect(`${LABELS.es.estimateNum}SK-1049`).toBe('Presupuesto Nº SK-1049')
    expect(`${LABELS.en.estimateNum}SK-1051`).toBe('Estimate #SK-1051')
  })
})
