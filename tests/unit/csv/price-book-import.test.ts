import { describe, it, expect } from 'vitest'
import {
  parsePriceBookCsv,
  REQUIRED_HEADERS,
  MAX_BYTES,
  MAX_ROWS,
  type ParseOutcome,
} from '@/lib/csv/price-book-import'

// Suppress unused-import warnings for Wave 0 — these will be used in Wave 1 bodies
void parsePriceBookCsv
void (undefined as unknown as ParseOutcome)

describe('parsePriceBookCsv', () => {
  it('parses a 3-row CSV and classifies a missing-name row as invalid', async () => {
    expect.fail('not implemented')
  })

  it('strips BOM from the first header field', async () => {
    expect.fail('not implemented')
  })

  it('matches headers case-insensitively', async () => {
    expect.fail('not implemented')
  })

  it('matches headers order-independently', async () => {
    expect.fail('not implemented')
  })

  it('rejects file with missing required column (missing_columns fatal)', async () => {
    expect.fail('not implemented')
  })

  it('rejects file over 1 MB (too_large fatal)', async () => {
    expect.fail('not implemented')
  })

  it('rejects file with more than 1000 data rows (too_many_rows fatal)', async () => {
    expect.fail('not implemented')
  })

  it('marks in-file duplicate as duplicate (first occurrence wins)', async () => {
    expect.fail('not implemented')
  })

  it('case-insensitive duplicate detection (Labor/General == labor/general)', async () => {
    expect.fail('not implemented')
  })

  it('flags non-numeric unit_price as invalid_unit_price', async () => {
    expect.fail('not implemented')
  })

  it('flags negative unit_price as negative_unit_price', async () => {
    expect.fail('not implemented')
  })

  it('accepts blank unit cell without error', async () => {
    expect.fail('not implemented')
  })

  it('rejects wrong file type (.txt with text/plain MIME) — wrong_type fatal', async () => {
    expect.fail('not implemented')
  })

  it('reports 1-based rowNumber with header offset (first data row = 2)', async () => {
    expect.fail('not implemented')
  })

  it('exports REQUIRED_HEADERS, MAX_BYTES, MAX_ROWS constants matching D-03/D-15', () => {
    expect(REQUIRED_HEADERS).toEqual(['category', 'name', 'unit', 'unit_price'])
    expect(MAX_BYTES).toBe(1024 * 1024)
    expect(MAX_ROWS).toBe(1000)
  })
})
