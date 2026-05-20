/**
 * Phase 76 PB-CSV-02 — RED tests for header alias detection.
 *
 * These tests WILL fail until 76-02 implements `detectColumnMapping`.
 * They describe the contract the implementation must satisfy.
 */
import { describe, it, expect } from 'vitest'
import { ALIAS_DICTIONARY, detectColumnMapping } from '@/lib/csv/price-book-aliases'

describe('ALIAS_DICTIONARY', () => {
  it('declares all 5 target fields with at least one alias each', () => {
    expect(Object.keys(ALIAS_DICTIONARY).sort()).toEqual(
      ['folder', 'name', 'notes', 'unit', 'unit_price'].sort(),
    )
    for (const aliases of Object.values(ALIAS_DICTIONARY)) {
      expect(aliases.length).toBeGreaterThan(0)
    }
  })
})

describe('detectColumnMapping — name', () => {
  it('matches common name variants', () => {
    const out = detectColumnMapping(['item', 'service', 'description', 'desc', 'product', 'line item'])
    // First "name-bucket" header wins for name; subsequent ones fall back per priority rules.
    // Implementation must map at least one of these to `name`.
    const values = Object.values(out)
    expect(values).toContain('name')
  })
})

describe('detectColumnMapping — unit_price', () => {
  it('matches common price variants', () => {
    const out = detectColumnMapping(['price', 'cost', 'rate', 'amount', 'value', '$'])
    expect(Object.values(out)).toContain('unit_price')
  })
})

describe('detectColumnMapping — folder', () => {
  it('matches common folder variants', () => {
    const out = detectColumnMapping(['category', 'group', 'section', 'type'])
    expect(Object.values(out)).toContain('folder')
  })
})

describe('detectColumnMapping — unit', () => {
  it('matches common unit-of-measure variants', () => {
    const out = detectColumnMapping(['uom', 'qty unit', 'measure', 'units of measure'])
    expect(Object.values(out)).toContain('unit')
  })
})

describe('detectColumnMapping — notes', () => {
  it('matches "comments" header', () => {
    const out = detectColumnMapping(['comments'])
    expect(out['comments']).toBe('notes')
  })
})

describe('detectColumnMapping — priority', () => {
  it('when both "name" and "description" are present, "name" wins for name and "description" falls to notes', () => {
    const out = detectColumnMapping(['name', 'description'])
    expect(out['name']).toBe('name')
    expect(out['description']).toBe('notes')
  })
})

describe('detectColumnMapping — normalization', () => {
  it('is case-insensitive and whitespace-tolerant', () => {
    const out = detectColumnMapping(['  PRICE  '])
    // Implementation must normalize keys consistently — accept either the raw header or normalized form.
    const value = out['  PRICE  '] ?? out['price']
    expect(value).toBe('unit_price')
  })
})

describe('detectColumnMapping — unknown headers', () => {
  it('maps unknown headers to "_skip"', () => {
    const out = detectColumnMapping(['totally_random_xyz_column'])
    const value = out['totally_random_xyz_column']
    expect(value).toBe('_skip')
  })
})
