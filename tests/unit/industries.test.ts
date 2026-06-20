import { describe, it, expect } from 'vitest'
import {
  INDUSTRIES,
  resolveIndustries,
  splitIndustries,
  OTHER_INDUSTRY_ID,
  type Industry,
} from '@/lib/industries'

describe('INDUSTRIES', () => {
  it('has exactly 10 entries', () => {
    expect(INDUSTRIES).toHaveLength(10)
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
    ]
    for (const id of expected) {
      expect(ids).toContain(id)
    }
  })
})

describe('resolveIndustries', () => {
  it('emits selected known ids in INDUSTRIES display order', () => {
    // Pass in a deliberately out-of-order selection.
    const result = resolveIndustries(
      ['window_cleaning', 'house_cleaning'],
      ''
    )
    expect(result).toEqual(['house_cleaning', 'window_cleaning'])
  })

  it('replaces the "other" sentinel with trimmed custom text, appended last', () => {
    const result = resolveIndustries(
      ['house_cleaning', OTHER_INDUSTRY_ID],
      '  Pressure Washing  '
    )
    expect(result).toEqual(['house_cleaning', 'Pressure Washing'])
  })

  it('drops the "other" sentinel when custom text is blank', () => {
    const result = resolveIndustries(['house_cleaning', OTHER_INDUSTRY_ID], '   ')
    expect(result).toEqual(['house_cleaning'])
  })

  it('returns an empty array when nothing is selected', () => {
    expect(resolveIndustries([], '')).toEqual([])
  })

  it('dedupes repeated ids', () => {
    const result = resolveIndustries(['house_cleaning', 'house_cleaning'], '')
    expect(result).toEqual(['house_cleaning'])
  })
})

describe('splitIndustries', () => {
  it('maps known ids to selected cards', () => {
    const { selectedIds, customIndustry } = splitIndustries([
      'house_cleaning',
      'window_cleaning',
    ])
    expect(selectedIds).toEqual(['house_cleaning', 'window_cleaning'])
    expect(customIndustry).toBe('')
  })

  it('maps the first unknown value to the "other" card + custom text', () => {
    const { selectedIds, customIndustry } = splitIndustries([
      'house_cleaning',
      'Pressure Washing',
    ])
    expect(selectedIds).toEqual(['house_cleaning', OTHER_INDUSTRY_ID])
    expect(customIndustry).toBe('Pressure Washing')
  })

  it('round-trips through resolveIndustries', () => {
    const stored = ['house_cleaning', 'window_cleaning', 'Pressure Washing']
    const { selectedIds, customIndustry } = splitIndustries(stored)
    expect(resolveIndustries(selectedIds, customIndustry)).toEqual(stored)
  })

  it('handles null / empty input', () => {
    expect(splitIndustries(null)).toEqual({ selectedIds: [], customIndustry: '' })
    expect(splitIndustries([])).toEqual({ selectedIds: [], customIndustry: '' })
  })
})
