import { describe, it, expect } from 'vitest'
import {
  parseKnowledgeCsv,
  REQUIRED_HEADERS,
  MAX_BYTES,
  MAX_ROWS,
} from '@/lib/csv/knowledge-import'

describe('parseKnowledgeCsv', () => {
  it('parses a 3-row CSV and classifies a missing-body row as invalid', async () => {
    const csv = [
      'title,body,source',
      'Pet odor pre-treatment,Apply enzymatic cleaner before extraction,ICAN',
      'Empty body entry,,Manual',
      'Grout sealing,Seal grout 24h after install,TileCo',
    ].join('\n')
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.validCount).toBe(2)
    expect(outcome.invalidCount).toBe(1)
    expect(outcome.rows[1].errors).toContain('missing_body')
  })

  it('classifies a missing-title row as invalid', async () => {
    const csv = ['title,body,source', ',Some body without a title,Src'].join('\n')
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].errors).toContain('missing_title')
    expect(outcome.invalidCount).toBe(1)
  })

  it('strips BOM from the first header field', async () => {
    const csv = '﻿title,body,source\nPet odor,Apply enzymatic cleaner,ICAN\n'
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].values.title).toBe('Pet odor')
    expect(outcome.validCount).toBe(1)
  })

  it('matches headers case-insensitively', async () => {
    const csv = 'TITLE,Body,SOURCE\nPet odor,Apply enzymatic cleaner,ICAN\n'
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.validCount).toBe(1)
    expect(outcome.rows[0].values.title).toBe('Pet odor')
  })

  it('matches headers order-independently', async () => {
    const csv = 'source,body,title\nICAN,Apply enzymatic cleaner,Pet odor\n'
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].values.title).toBe('Pet odor')
    expect(outcome.rows[0].values.body).toBe('Apply enzymatic cleaner')
  })

  it('treats source as optional — null when absent', async () => {
    const csv = 'title,body\nPet odor,Apply enzymatic cleaner\n'
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.validCount).toBe(1)
    expect(outcome.rows[0].values.source).toBeNull()
  })

  it('rejects file with missing required column (missing_columns fatal)', async () => {
    const csv = 'title,source\nPet odor,ICAN\n'
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('missing_columns')
    expect(outcome.detail).toContain('body')
  })

  it('rejects file over 1 MB (too_large fatal)', async () => {
    const file = new File(['x'], 'huge.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('too_large')
  })

  it('rejects file with more than 1000 data rows (too_many_rows fatal)', async () => {
    const header = 'title,body,source'
    const dataRows = Array.from(
      { length: 1001 },
      (_, i) => `Entry ${i},Body for entry ${i},Src ${i}`
    )
    const csv = [header, ...dataRows].join('\n')
    const file = new File([csv], 'big.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('too_many_rows')
  })

  it('marks in-file duplicate title as duplicate (first occurrence wins, case-insensitive)', async () => {
    const csv = [
      'title,body,source',
      'Pet odor,First body,ICAN',
      'pet odor,Second body,Manual',
    ].join('\n')
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].isDuplicateInFile).toBe(false)
    expect(outcome.rows[1].isDuplicateInFile).toBe(true)
    expect(outcome.inFileDuplicateCount).toBe(1)
  })

  it('rejects wrong file type (.txt with text/plain MIME) — wrong_type fatal', async () => {
    const file = new File(['stuff'], 'data.txt', { type: 'text/plain' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.fatal).toBe('wrong_type')
  })

  it('reports 1-based rowNumber with header offset (first data row = 2)', async () => {
    const csv = ['title,body,source', 'Pet odor,Apply cleaner,ICAN'].join('\n')
    const file = new File([csv], 'kb.csv', { type: 'text/csv' })
    const outcome = await parseKnowledgeCsv(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.rows[0].rowNumber).toBe(2)
  })

  it('exports REQUIRED_HEADERS, MAX_BYTES, MAX_ROWS constants', () => {
    expect(REQUIRED_HEADERS).toEqual(['title', 'body'])
    expect(MAX_BYTES).toBe(1024 * 1024)
    expect(MAX_ROWS).toBe(1000)
  })
})
