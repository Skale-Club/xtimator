/**
 * Phase 76 PB-CSV-01 — RED tests for the 4-step wizard reducer.
 *
 * `wizardReducer` + `initialWizardState` land in 76-02. These tests fail at
 * import-resolution until that module exists. That is the intentional RED state.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — module created in 76-02; import RED is intentional for Wave 0
import { wizardReducer, initialWizardState } from '@/lib/csv/wizard-state'

type Step = 'upload' | 'map' | 'preview' | 'confirm'

describe('wizardReducer — initial state', () => {
  it('starts at step "upload" with no file and no rows', () => {
    expect(initialWizardState.step).toBe('upload' satisfies Step)
    expect(initialWizardState.file).toBeNull()
    expect(initialWizardState.rows).toEqual([])
  })
})

describe('wizardReducer — FILE_PARSED', () => {
  it('advances to step "map" with rows populated', () => {
    const next = wizardReducer(initialWizardState, {
      type: 'FILE_PARSED',
      file: { name: 'p.csv', size: 100 } as unknown as File,
      rows: [{ rowNumber: 2, values: { name: 'A', unit_price: 1, unit: 'ea', notes: '' }, errors: [], isDuplicateInFile: false }],
      headers: ['name', 'unit_price'],
    })
    expect(next.step).toBe('map' satisfies Step)
    expect(next.rows.length).toBe(1)
  })
})

describe('wizardReducer — MAPPING_SET', () => {
  it('updates the mapping object without changing step', () => {
    const start = wizardReducer(initialWizardState, {
      type: 'FILE_PARSED',
      file: { name: 'p.csv', size: 100 } as unknown as File,
      rows: [],
      headers: ['col1'],
    })
    const next = wizardReducer(start, { type: 'MAPPING_SET', header: 'col1', target: 'name' })
    expect(next.step).toBe('map' satisfies Step)
    expect(next.mapping?.['col1']).toBe('name')
  })
})

describe('wizardReducer — MAPPING_COMPLETE', () => {
  it('advances to step "preview"', () => {
    const start = wizardReducer(initialWizardState, {
      type: 'FILE_PARSED',
      file: { name: 'p.csv', size: 100 } as unknown as File,
      rows: [],
      headers: ['name', 'unit_price'],
    })
    const next = wizardReducer(start, { type: 'MAPPING_COMPLETE' })
    expect(next.step).toBe('preview' satisfies Step)
  })
})

describe('wizardReducer — BACK from preview', () => {
  it('returns to map without losing the mapping', () => {
    const afterFile = wizardReducer(initialWizardState, {
      type: 'FILE_PARSED',
      file: { name: 'p.csv', size: 100 } as unknown as File,
      rows: [],
      headers: ['col1'],
    })
    const afterMap = wizardReducer(afterFile, { type: 'MAPPING_SET', header: 'col1', target: 'name' })
    const onPreview = wizardReducer(afterMap, { type: 'MAPPING_COMPLETE' })
    const back = wizardReducer(onPreview, { type: 'BACK' })
    expect(back.step).toBe('map' satisfies Step)
    expect(back.mapping?.['col1']).toBe('name')
  })
})

describe('wizardReducer — RESET', () => {
  it('clears all state back to initial', () => {
    const dirty = wizardReducer(initialWizardState, {
      type: 'FILE_PARSED',
      file: { name: 'p.csv', size: 100 } as unknown as File,
      rows: [{ rowNumber: 2, values: { name: 'A', unit_price: 1, unit: 'ea', notes: '' }, errors: [], isDuplicateInFile: false }],
      headers: ['name'],
    })
    const reset = wizardReducer(dirty, { type: 'RESET' })
    expect(reset).toEqual(initialWizardState)
  })
})

describe('wizardReducer — RESTORE_DRAFT', () => {
  it('rehydrates state from a serialized JSON payload', () => {
    const draft = {
      step: 'preview' as Step,
      file: null,
      rows: [{ rowNumber: 2, values: { name: 'X', unit_price: 5, unit: 'ea', notes: '' }, errors: [], isDuplicateInFile: false }],
      mapping: { col1: 'name' as const },
      headers: ['col1'],
      dedupeStrategy: 'skip' as const,
      savedAt: new Date().toISOString(),
    }
    const next = wizardReducer(initialWizardState, { type: 'RESTORE_DRAFT', draft })
    expect(next.step).toBe('preview' satisfies Step)
    expect(next.rows.length).toBe(1)
    expect(next.mapping?.['col1']).toBe('name')
  })
})
