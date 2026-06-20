import { describe, it, expect } from 'vitest'
import { INDUSTRIES, type Industry } from '@/lib/industries'

describe('INDUSTRIES', () => {
  it('has exactly 9 entries', () => {
    expect(INDUSTRIES).toHaveLength(9)
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
