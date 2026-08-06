import { describe, it, expect } from 'vitest'
import {
  INDUSTRIES,
  resolveIndustries,
  splitIndustries,
  OTHER_INDUSTRY_ID,
  isKnownIndustry,
  type Industry,
} from '@/lib/industries'

describe('INDUSTRIES', () => {
  it('has exactly 13 entries', () => {
    expect(INDUSTRIES).toHaveLength(13)
  })

  it('every industry has non-empty id, label, icon, and projectTypes array', () => {
    for (const industry of INDUSTRIES) {
      expect(industry.id).toBeTruthy()
      expect(industry.label).toBeTruthy()
      expect(industry.icon).toBeTruthy()
      expect(Array.isArray(industry.projectTypes)).toBe(true)
      expect(industry.projectTypes.length).toBeGreaterThan(0)
    }
  })

  it('every industry has at least 3 projectTypes', () => {
    for (const industry of INDUSTRIES) {
      expect(industry.projectTypes.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('all industry ids are unique', () => {
    const ids = INDUSTRIES.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('Industry type exports correctly with id, label, icon, projectTypes', () => {
    const sample: Industry = {
      id: 'test',
      label: 'Test',
      icon: 'TestIcon',
      projectTypes: ['A', 'B', 'C'],
    }
    expect(sample).toHaveProperty('id')
    expect(sample).toHaveProperty('label')
    expect(sample).toHaveProperty('icon')
    expect(sample).toHaveProperty('projectTypes')
  })

  it('contains all known industries', () => {
    const ids = INDUSTRIES.map((i) => i.id)
    const expected = [
      'house_cleaning',
      'upholstery_carpet_cleaning',
      'window_cleaning',
      'painting',
      'landscaping',
      'electrical',
      'plumbing',
      'handyman',
      'roofing',
      'hvac',
      'home_improvement',
      'general_contracting',
      'remodeling',
    ]
    for (const id of expected) {
      expect(ids).toContain(id)
    }
  })
})

describe('isKnownIndustry', () => {
  it('returns true for predefined ids', () => {
    expect(isKnownIndustry('house_cleaning')).toBe(true)
  })

  it('returns false for custom strings', () => {
    expect(isKnownIndustry('Pressure Washing')).toBe(false)
  })
})

describe('resolveIndustries', () => {
  it('emits selected known ids in INDUSTRIES display order', () => {
    const result = resolveIndustries(['window_cleaning', 'house_cleaning'])
    expect(result).toEqual(['house_cleaning', 'window_cleaning'])
  })

  it('appends custom strings after known ids, preserving order', () => {
    const result = resolveIndustries([
      'window_cleaning',
      'Pressure Washing',
      'house_cleaning',
      'Solar Panels',
    ])
    expect(result).toEqual([
      'house_cleaning',
      'window_cleaning',
      'Pressure Washing',
      'Solar Panels',
    ])
  })

  it('drops the legacy "other" sentinel', () => {
    const result = resolveIndustries([
      'house_cleaning',
      OTHER_INDUSTRY_ID,
      'Pressure Washing',
    ])
    expect(result).toEqual(['house_cleaning', 'Pressure Washing'])
  })

  it('returns an empty array when nothing is selected', () => {
    expect(resolveIndustries([])).toEqual([])
  })

  it('dedupes repeated ids and custom strings', () => {
    const result = resolveIndustries([
      'house_cleaning',
      'house_cleaning',
      'Pressure Washing',
      'Pressure Washing',
    ])
    expect(result).toEqual(['house_cleaning', 'Pressure Washing'])
  })
})

describe('splitIndustries', () => {
  it('maps known ids to selected cards', () => {
    const { selectedIds, customIndustries } = splitIndustries([
      'house_cleaning',
      'window_cleaning',
    ])
    expect(selectedIds).toEqual(['house_cleaning', 'window_cleaning'])
    expect(customIndustries).toEqual([])
  })

  it('maps unknown values to customIndustries', () => {
    const { selectedIds, customIndustries } = splitIndustries([
      'house_cleaning',
      'Pressure Washing',
    ])
    expect(selectedIds).toEqual(['house_cleaning'])
    expect(customIndustries).toEqual(['Pressure Washing'])
  })

  it('maps multiple unknown values to customIndustries', () => {
    const { selectedIds, customIndustries } = splitIndustries([
      'house_cleaning',
      'Pressure Washing',
      'Solar Panels',
    ])
    expect(selectedIds).toEqual(['house_cleaning'])
    expect(customIndustries).toEqual(['Pressure Washing', 'Solar Panels'])
  })

  it('round-trips through resolveIndustries', () => {
    const stored = ['house_cleaning', 'window_cleaning', 'Pressure Washing']
    const { selectedIds, customIndustries } = splitIndustries(stored)
    expect(resolveIndustries([...selectedIds, ...customIndustries])).toEqual(stored)
  })

  it('handles null / empty input', () => {
    expect(splitIndustries(null)).toEqual({ selectedIds: [], customIndustries: [] })
    expect(splitIndustries([])).toEqual({ selectedIds: [], customIndustries: [] })
  })
})
