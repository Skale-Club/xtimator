/**
 * Phase 76 PB-CSV-05 — RED tests for dedupe strategy resolver.
 *
 * `applyDedupeStrategy` lands in 76-02. These tests will fail at import-resolution
 * time until that module exists. That is the intentional RED state for Wave 0.
 *
 * Strategy reference:
 *   - 'skip'   : existing row preserved, incoming row dropped
 *   - 'update' : existing keeps id, incoming unit/unit_price/notes overwrite
 *   - 'new'    : incoming kept and renamed `<name> (2)`, then `(3)`, etc.
 *
 * Dedup key: case-insensitive `(folder_name, name)`.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — module created in 76-02; import RED is intentional for Wave 0
import { applyDedupeStrategy } from '@/lib/csv/dedupe'

type DedupeStrategy = 'skip' | 'update' | 'new'
interface PriceBookExistingRow {
  id: string
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
}
interface IncomingRow {
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  strategyOverride?: DedupeStrategy
}

const existing: PriceBookExistingRow[] = [
  { id: 'pb-1', folder_name: 'Labor', name: 'Widget', unit: 'ea', unit_price: 10, notes: null },
]

describe('applyDedupeStrategy — skip', () => {
  it('drops the incoming row when an existing collision exists', () => {
    const incoming: IncomingRow[] = [
      { folder_name: 'Labor', name: 'Widget', unit: 'ea', unit_price: 99, notes: 'new note' },
    ]
    const result = applyDedupeStrategy({ existing, incoming, global: 'skip' })
    expect(result.toInsert).toHaveLength(0)
    expect(result.toUpdate).toHaveLength(0)
    expect(result.skippedCount).toBe(1)
  })
})

describe('applyDedupeStrategy — update', () => {
  it('keeps existing id and overwrites unit/unit_price/notes from incoming', () => {
    const incoming: IncomingRow[] = [
      { folder_name: 'Labor', name: 'Widget', unit: 'hr', unit_price: 99, notes: 'updated' },
    ]
    const result = applyDedupeStrategy({ existing, incoming, global: 'update' })
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].id).toBe('pb-1')
    expect(result.toUpdate[0].unit_price).toBe(99)
    expect(result.toUpdate[0].unit).toBe('hr')
    expect(result.toUpdate[0].notes).toBe('updated')
  })
})

describe('applyDedupeStrategy — new (suffix)', () => {
  it('suffixes incoming row name with "(2)" on first collision and "(3)" on second', () => {
    const incoming: IncomingRow[] = [
      { folder_name: 'Labor', name: 'Widget', unit: 'ea', unit_price: 11, notes: null },
      { folder_name: 'Labor', name: 'Widget', unit: 'ea', unit_price: 12, notes: null },
    ]
    const result = applyDedupeStrategy({ existing, incoming, global: 'new' })
    expect(result.toInsert).toHaveLength(2)
    expect(result.toInsert[0].name).toBe('Widget (2)')
    expect(result.toInsert[1].name).toBe('Widget (3)')
  })
})

describe('applyDedupeStrategy — per-row override', () => {
  it('per-row strategyOverride beats the global setting', () => {
    const incoming: IncomingRow[] = [
      {
        folder_name: 'Labor',
        name: 'Widget',
        unit: 'hr',
        unit_price: 200,
        notes: 'per-row update',
        strategyOverride: 'update',
      },
    ]
    const result = applyDedupeStrategy({ existing, incoming, global: 'skip' })
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].unit_price).toBe(200)
  })
})

describe('applyDedupeStrategy — no collision', () => {
  it('passes incoming row through unchanged when folder differs', () => {
    const incoming: IncomingRow[] = [
      { folder_name: 'Materials', name: 'Widget', unit: 'ea', unit_price: 5, notes: null },
    ]
    const result = applyDedupeStrategy({ existing, incoming, global: 'skip' })
    expect(result.toInsert).toHaveLength(1)
    expect(result.toInsert[0].name).toBe('Widget')
    expect(result.toInsert[0].folder_name).toBe('Materials')
    expect(result.skippedCount).toBe(0)
  })
})

describe('applyDedupeStrategy — case-insensitive name match', () => {
  it('treats "widget" as colliding with existing "Widget" in the same folder', () => {
    const incoming: IncomingRow[] = [
      { folder_name: 'Labor', name: 'widget', unit: 'ea', unit_price: 7, notes: null },
    ]
    const result = applyDedupeStrategy({ existing, incoming, global: 'skip' })
    expect(result.skippedCount).toBe(1)
    expect(result.toInsert).toHaveLength(0)
  })
})
