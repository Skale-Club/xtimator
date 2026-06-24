import Papa from 'papaparse'

/**
 * lib/csv/knowledge-import.ts
 *
 * KCUR-03: a CSV parser for super-admin industry KB bulk import — a near-copy of
 * `parsePriceBookCsv` (lib/csv/price-book-import.ts), simplified to the FIXED
 * columns `title,body,source` (source optional). NO locale, NO column-mapping,
 * NO folder. Industry is chosen in the UI (one import = one industry) — the CSV
 * never carries an industry_id.
 *
 * Same hard caps as the price-book importer (1 MB / 1000 rows / required
 * columns) enforced BEFORE any embed (Pitfall 4 — validate before embed). Uses
 * the SAME Papa.parse config (header + greedy skip + BOM-stripping
 * transformHeader) and never enables the papaparse worker thread (Pitfall 3).
 */

export const REQUIRED_HEADERS = ['title', 'body'] as const // source optional
export const MAX_ROWS = 1000
export const MAX_BYTES = 1024 * 1024 // 1 MB

export type KnowledgeRowError = 'missing_title' | 'missing_body'

export interface KnowledgeImportRow {
  title: string
  body: string
  source: string | null
}

export interface ParsedKnowledgeRow {
  rowNumber: number
  values: KnowledgeImportRow
  errors: KnowledgeRowError[]
  isDuplicateInFile: boolean
}

export type KnowledgeParseOutcome =
  | {
      ok: true
      rows: ParsedKnowledgeRow[]
      validCount: number
      invalidCount: number
      inFileDuplicateCount: number
    }
  | {
      ok: false
      fatal: 'too_large' | 'too_many_rows' | 'wrong_type' | 'missing_columns' | 'parse_error'
      detail: string
    }

export function parseKnowledgeCsv(file: File): Promise<KnowledgeParseOutcome> {
  return new Promise((resolve) => {
    // 1. Size check
    if (file.size > MAX_BYTES) {
      resolve({
        ok: false,
        fatal: 'too_large',
        detail: `${(file.size / 1024 / 1024).toFixed(2)} MB exceeds 1 MB limit`,
      })
      return
    }

    // 2. Type check — extension-first
    const lowerName = file.name.toLowerCase()
    const allowedTypes = ['', 'text/csv', 'application/csv', 'application/vnd.ms-excel']
    const isCsvByName = lowerName.endsWith('.csv')
    const isCsvByType = allowedTypes.includes(file.type)
    if (!isCsvByName && !isCsvByType) {
      resolve({ ok: false, fatal: 'wrong_type', detail: 'We need a .csv file.' })
      return
    }

    // 3. Parse via papaparse. Never enable the worker thread option (Pitfall 3)
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

        // Per-row classify
        const seenInFile = new Set<string>()
        const rows: ParsedKnowledgeRow[] = results.data.map((raw, i) => {
          const errors: KnowledgeRowError[] = []
          const title = (raw['title'] ?? '').trim()
          const body = (raw['body'] ?? '').trim()
          const source = (raw['source'] ?? '').trim()

          if (!title) errors.push('missing_title')
          if (!body) errors.push('missing_body')

          // Dedup key on title — case-insensitive. In-file dupes are FLAGGED,
          // not an error (first occurrence wins).
          const dedupKey = title.toLowerCase()
          const isDup = errors.length === 0 && seenInFile.has(dedupKey)
          if (errors.length === 0) seenInFile.add(dedupKey)

          return {
            rowNumber: i + 2, // header is row 1, first data row is row 2
            values: {
              title,
              body,
              source: source || null,
            },
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
