/**
 * Wave 0 — ADMINLOG-04/05: detail page static contract.
 * Tests: created_at ASC order, notFound on empty, safe select list (no select('*') or unsafe columns).
 * RED until Plan 93-03 creates app/admin/events/[attemptId]/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readDetailPage(): string {
  try {
    return readFileSync(
      resolve(process.cwd(), 'app/admin/events/[attemptId]/page.tsx'),
      'utf8'
    )
  } catch {
    return ''
  }
}

describe('ADMINLOG-04: detail page fetch contract', () => {
  it('orders pipeline_events by created_at ASC for chronological timeline', () => {
    const src = readDetailPage()
    if (!src) expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    expect(src).toMatch(/ascending.*true|order.*created_at.*true/)
  })

  it('calls notFound() when the query returns no rows', () => {
    const src = readDetailPage()
    if (!src) expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    expect(src).toMatch(/notFound\(\)/)
  })

  it('awaits params (Next async prop pattern)', () => {
    const src = readDetailPage()
    if (!src) expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    expect(src).toMatch(/await\s+params/)
  })
})

describe('ADMINLOG-05: detail page safe select list', () => {
  it('uses an explicit column list in the select() call — not select("*") alone', () => {
    const src = readDetailPage()
    if (!src) expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    // Explicit select: must contain at least one column name in the select string
    expect(src).toMatch(/select\(['"]id,|select\(`id,/)
  })

  it('select list does NOT include transcript, audio, apiKey, payload, or raw columns', () => {
    const src = readDetailPage()
    if (!src) expect.fail('Wave 0: app/admin/events/[attemptId]/page.tsx not yet written')
    // The select argument string must not name these columns
    const selectMatch = src.match(/\.select\(['"`]([^'"`]+)['"`]/)
    if (!selectMatch) expect.fail('Could not locate .select() call in detail page')
    const cols = selectMatch![1]
    expect(cols).not.toMatch(/transcript|audio|apiKey|payload|raw/)
  })
})
