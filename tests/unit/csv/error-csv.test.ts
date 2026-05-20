import { describe, it, expect } from 'vitest'
import { buildErrorCsv, type FailedRow } from '@/lib/csv/error-csv'
import type { ImportRow } from '@/lib/csv/price-book-import'

const mkRow = (over: Partial<ImportRow>): ImportRow => ({
  name: '',
  unit: '',
  unit_price: 0,
  notes: '',
  ...over,
}) as ImportRow

describe('buildErrorCsv', () => {
  it('returns a header-only line when rows is empty', () => {
    const out = buildErrorCsv([], ['name', 'unit_price'])
    expect(out).toBe('name,unit_price,error_reason')
    expect(out.split('\n')).toHaveLength(1)
  })

  it('emits a basic row with all original columns + error_reason', () => {
    const rows: FailedRow[] = [
      { values: mkRow({ name: 'Drywall', unit: 'sqft', unit_price: 2.5, notes: 'std' }), reason: 'duplicate' },
    ]
    const out = buildErrorCsv(rows, ['name', 'unit', 'unit_price', 'notes'])
    expect(out).toBe(
      'name,unit,unit_price,notes,error_reason\n' +
      'Drywall,sqft,2.5,std,duplicate',
    )
  })

  it('escapes commas by wrapping the cell in double quotes', () => {
    const rows: FailedRow[] = [
      { values: mkRow({ name: 'Paint, premium', unit_price: 10 }), reason: 'invalid price' },
    ]
    const out = buildErrorCsv(rows, ['name', 'unit_price'])
    expect(out).toBe(
      'name,unit_price,error_reason\n' +
      '"Paint, premium",10,invalid price',
    )
  })

  it('escapes embedded double quotes by doubling them', () => {
    const rows: FailedRow[] = [
      { values: mkRow({ name: 'Bolt "1/2 inch"', unit_price: 1 }), reason: 'bad name' },
    ]
    const out = buildErrorCsv(rows, ['name', 'unit_price'])
    expect(out).toBe(
      'name,unit_price,error_reason\n' +
      '"Bolt ""1/2 inch""",1,bad name',
    )
  })

  it('escapes embedded newlines by wrapping the cell in double quotes', () => {
    const rows: FailedRow[] = [
      { values: mkRow({ name: 'Multi\nline', unit_price: 5 }), reason: 'oops' },
    ]
    const out = buildErrorCsv(rows, ['name', 'unit_price'])
    expect(out).toBe(
      'name,unit_price,error_reason\n' +
      '"Multi\nline",5,oops',
    )
  })

  it('reads folder cells from the canonical folder_name key when header is "folder"', () => {
    const rows: FailedRow[] = [
      { values: mkRow({ name: 'Trim', unit_price: 3, folder_name: 'Materials' }), reason: 'dup' },
    ]
    const out = buildErrorCsv(rows, ['folder', 'name', 'unit_price'])
    expect(out).toBe(
      'folder,name,unit_price,error_reason\n' +
      'Materials,Trim,3,dup',
    )
  })
})
