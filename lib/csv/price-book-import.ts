import type { PriceBookItemFormValues } from '@/lib/schemas/price-book'

export const REQUIRED_HEADERS = ['category', 'name', 'unit', 'unit_price'] as const
export const MAX_ROWS = 1000
export const MAX_BYTES = 1024 * 1024 // 1 MB

export type RowError =
  | 'missing_category'
  | 'missing_name'
  | 'missing_unit_price'
  | 'invalid_unit_price'
  | 'negative_unit_price'

export interface ParsedRow {
  rowNumber: number
  values: PriceBookItemFormValues
  errors: RowError[]
  isDuplicateInFile: boolean
}

export type ParseOutcome =
  | {
      ok: true
      rows: ParsedRow[]
      validCount: number
      invalidCount: number
      inFileDuplicateCount: number
    }
  | {
      ok: false
      fatal: 'too_large' | 'too_many_rows' | 'wrong_type' | 'missing_columns' | 'parse_error'
      detail: string
    }

export function parsePriceBookCsv(_file: File): Promise<ParseOutcome> {
  // Wave 1 fills this in. Stub returns a "fatal" so any caller that tries to use it RED-fails clearly.
  return Promise.resolve({ ok: false, fatal: 'parse_error', detail: 'not implemented (Wave 0 stub)' })
}
