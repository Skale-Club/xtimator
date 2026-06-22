import Papa from 'papaparse'
import type { PriceBookItemFormValues } from '@/lib/schemas/price-book'
import type { LocaleMode, CustomLocale } from './locale-parser'
import { parseCurrency } from './locale-parser'
import type { TargetField } from './price-book-aliases'

export const REQUIRED_HEADERS = ['name', 'unit_price'] as const
export const MAX_ROWS = 1000
export const MAX_BYTES = 1024 * 1024 // 1 MB

/**
 * Optional 76-02 extension: callers can pass `{ locale, mapping }` to apply
 * locale-aware currency parsing and remap CSV headers to canonical fields.
 * When omitted the parser preserves baseline behavior (header === target).
 */
export interface ParseOptions {
  locale?: LocaleMode
  customLocale?: CustomLocale
  /** csv header (lowercased, as `transformHeader` produces) → target field or '_skip' */
  mapping?: Record<string, TargetField | '_skip'>
}

export type RowError =
  | 'missing_name'
  | 'missing_unit_price'
  | 'invalid_unit_price'
  | 'negative_unit_price'

// Extend PriceBookItemFormValues with a transient folder_name for import.
// folder_name is NOT in the Zod schema — resolved to folder_id by the action layer.
// pricing_type is optional here: CSV files don't include it; the action defaults to 'fixed'.
export type ImportRow = Omit<PriceBookItemFormValues, 'pricing_type'> & {
  pricing_type?: PriceBookItemFormValues['pricing_type']
  folder_name?: string
}

export interface ParsedRow {
  rowNumber: number
  values: ImportRow
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

export function parsePriceBookCsv(
  file: File,
  options?: ParseOptions,
): Promise<ParseOutcome> {
  const opts = options ?? {}
  // Normalize mapping keys to lowercased headers (matching transformHeader).
  const normalizedMapping = opts.mapping
    ? Object.fromEntries(
        Object.entries(opts.mapping).map(([k, v]) => [k.trim().toLowerCase(), v]),
      )
    : null
  // Inverse map: target field → csv header (first match wins).
  const headerForTarget = (target: TargetField): string | null => {
    if (!normalizedMapping) return target // baseline: header === target
    for (const [csvHeader, mapped] of Object.entries(normalizedMapping)) {
      if (mapped === target) return csvHeader
    }
    return null
  }
  return new Promise((resolve) => {
    // 1. Size check (D-15)
    if (file.size > MAX_BYTES) {
      resolve({
        ok: false,
        fatal: 'too_large',
        detail: `${(file.size / 1024 / 1024).toFixed(2)} MB exceeds 1 MB limit`,
      })
      return
    }

    // 2. Type check (D-16) — extension-first per Pitfall 1
    const lowerName = file.name.toLowerCase()
    const allowedTypes = ['', 'text/csv', 'application/csv', 'application/vnd.ms-excel']
    const isCsvByName = lowerName.endsWith('.csv')
    const isCsvByType = allowedTypes.includes(file.type)
    if (!isCsvByName && !isCsvByType) {
      resolve({ ok: false, fatal: 'wrong_type', detail: 'We need a .csv file.' })
      return
    }

    // 3. Parse via papaparse (D-20). DO NOT use worker:true (Pitfall 4)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().toLowerCase().replace(/^﻿/, ''),
      complete: (results) => {
        const headers = results.meta.fields ?? []
        const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
        if (missing.length > 0) {
          resolve({
            ok: false,
            fatal: 'missing_columns',
            detail: `Missing required column(s): ${missing.join(', ')}`,
          })
          return
        }
        if (results.data.length > MAX_ROWS) {
          resolve({
            ok: false,
            fatal: 'too_many_rows',
            detail: `${results.data.length} rows exceeds ${MAX_ROWS} max`,
          })
          return
        }

        // Per-row classify (D-10)
        const nameHdr = headerForTarget('name') ?? 'name'
        const priceHdr = headerForTarget('unit_price') ?? 'unit_price'
        const folderHdr = headerForTarget('folder') ?? 'folder'
        const unitHdr = headerForTarget('unit') ?? 'unit'
        const notesHdr = headerForTarget('notes') ?? 'notes'
        const seenInFile = new Set<string>()
        const rows: ParsedRow[] = results.data.map((raw, i) => {
          const errors: RowError[] = []
          const rawFolder = (raw[folderHdr] ?? '').trim()
          const rawName = (raw[nameHdr] ?? '').trim()
          const rawUnit = (raw[unitHdr] ?? '').trim()
          const rawNotes = (raw[notesHdr] ?? '').trim()
          const rawPrice = (raw[priceHdr] ?? '').trim()

          if (!rawName) errors.push('missing_name')
          if (!rawPrice) errors.push('missing_unit_price')

          let priceNum: number | null = null
          if (rawPrice) {
            if (opts.locale) {
              priceNum = parseCurrency(rawPrice, opts.locale, opts.customLocale)
              if (priceNum === null) errors.push('invalid_unit_price')
            } else {
              const n = Number(rawPrice)
              if (Number.isNaN(n)) {
                errors.push('invalid_unit_price')
              } else {
                priceNum = n
              }
            }
            if (priceNum !== null && priceNum < 0) errors.push('negative_unit_price')
          }

          // Dedup key on (folder, name) — case-insensitive. Legacy `category` column is ignored.
          const dedupKey = `${(rawFolder || '').toLowerCase()}::${rawName.toLowerCase()}`
          const isDup = errors.length === 0 && seenInFile.has(dedupKey)
          if (errors.length === 0) seenInFile.add(dedupKey)

          return {
            rowNumber: i + 2, // header is row 1, first data row is row 2
            values: {
              folder_name: rawFolder || undefined, // transient — not in Zod schema
              name: rawName,
              unit: rawUnit,
              unit_price: priceNum ?? 0,
              notes: rawNotes,
            } as ImportRow,
            errors,
            isDuplicateInFile: isDup,
          }
        })

        const validCount = rows.filter((r) => r.errors.length === 0 && !r.isDuplicateInFile).length
        const invalidCount = rows.filter((r) => r.errors.length > 0).length
        const inFileDuplicateCount = rows.filter((r) => r.isDuplicateInFile).length

        resolve({ ok: true, rows, validCount, invalidCount, inFileDuplicateCount })
      },
      error: (err) => resolve({ ok: false, fatal: 'parse_error', detail: err.message }),
    })
  })
}
