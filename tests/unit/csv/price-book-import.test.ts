import { describe, it, expect } from 'vitest'
import {
  parsePriceBookCsv,
  REQUIRED_HEADERS,
  MAX_BYTES,
  MAX_ROWS,
} from '@/lib/csv/price-book-import'

describe('parsePriceBookCsv', () => {
  it('parses a 3-row CSV and classifies a missing-name row as invalid', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,hr,75',
      'Labor,,hr,80',
      'Materials,PVC Pipe,ft,3.50',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.validCount).toBe(2)
    expect(outcome.invalidCount).toBe(1)
    expect(outcome.rows[1].errors).toContain('missing_name')
  })

  it('strips BOM from the first header field', async () => {
    // BOM character prepended to first header (as Excel would export)
    const csv = '﻿folder,name,unit,unit_price\nLabor,General Labor,hr,75\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].values.folder_name).toBe('Labor')
    expect(outcome.validCount).toBeGreaterThan(0)
  })

  it('matches headers case-insensitively', async () => {
    const csv = 'FOLDER,Name,UNIT,Unit_Price\nLabor,General Labor,hr,75\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.validCount).toBeGreaterThan(0)
  })

  it('matches headers order-independently', async () => {
    const csv = 'unit_price,unit,name,folder\n75,hr,General Labor,Labor\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].values.name).toBe('General Labor')
    expect(outcome.rows[0].values.folder_name).toBe('Labor')
  })

  it('accepts legacy CSV with category column and ignores it (no category on parsed row)', async () => {
    const csv = [
      'folder,category,name,unit,unit_price',
      'Labor,Electrical,General Labor,hr,75',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].values.folder_name).toBe('Labor')
    expect((outcome.rows[0].values as Record<string, unknown>).category).toBeUndefined()
  })

  it('rejects file with missing required column (missing_columns fatal)', async () => {
    // Missing unit_price → fatal
    const csv = 'folder,name,unit\nLabor,General Labor,hr\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('missing_columns')
    expect(outcome.detail).toContain('unit_price')
  })

  it('accepts CSV with only required columns name + unit_price (folder + unit optional)', async () => {
    const csv = 'name,unit_price\nGeneral Labor,75\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.validCount).toBe(1)
    expect(outcome.rows[0].values.folder_name).toBeUndefined()
  })

  it('rejects file over 1 MB (too_large fatal)', async () => {
    const file = new File(['x'], 'huge.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('too_large')
  })

  it('rejects file with more than 1000 data rows (too_many_rows fatal)', async () => {
    const header = 'folder,name,unit,unit_price'
    const dataRows = Array.from({ length: 1001 }, (_, i) => `Labor,Item ${i},hr,${10 + i}`)
    const csv = [header, ...dataRows].join('\n')
    const file = new File([csv], 'big.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('too_many_rows')
  })

  it('marks in-file duplicate as duplicate (first occurrence wins)', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,hr,75',
      'Labor,General Labor,hr,80',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].isDuplicateInFile).toBe(false)
    expect(outcome.rows[1].isDuplicateInFile).toBe(true)
    expect(outcome.inFileDuplicateCount).toBe(1)
  })

  it('case-insensitive duplicate detection on (folder, name)', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,hr,75',
      'labor,general labor,hr,80',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].isDuplicateInFile).toBe(false)
    expect(outcome.rows[1].isDuplicateInFile).toBe(true)
  })

  it('flags non-numeric unit_price as invalid_unit_price', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,hr,"1,234.56"',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].errors).toContain('invalid_unit_price')
  })

  it('flags negative unit_price as negative_unit_price', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,hr,-5',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].errors).toContain('negative_unit_price')
  })

  it('accepts blank unit cell without error', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,,75',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].errors).toHaveLength(0)
    expect(outcome.rows[0].values.unit).toBe('')
  })

  it('rejects wrong file type (.txt with text/plain MIME) — wrong_type fatal', async () => {
    const file = new File(['stuff'], 'data.txt', { type: 'text/plain' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('wrong_type')
  })

  it('reports 1-based rowNumber with header offset (first data row = 2)', async () => {
    const csv = [
      'folder,name,unit,unit_price',
      'Labor,General Labor,hr,75',
      'Materials,PVC Pipe,ft,3.50',
    ].join('\n')
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const outcome = await parsePriceBookCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].rowNumber).toBe(2)
  })

  it('exports REQUIRED_HEADERS, MAX_BYTES, MAX_ROWS constants', () => {
    expect(REQUIRED_HEADERS).toEqual(['name', 'unit_price'])
    expect(MAX_BYTES).toBe(1024 * 1024)
    expect(MAX_ROWS).toBe(1000)
  })
})
