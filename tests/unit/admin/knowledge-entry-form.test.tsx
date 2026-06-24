import { describe, it, expect } from 'vitest'
import { canConfirmImport } from '@/app/admin/knowledge/import-card'
import type { KnowledgeParseOutcome } from '@/lib/csv/knowledge-import'
import { INDUSTRIES } from '@/lib/industries'

/**
 * KCUR-03 (UI gate): the bulk-import Confirm button is enabled only when an
 * industry is chosen AND the parse yielded at least one valid row. Proven via
 * the pure `canConfirmImport` predicate so the gate is deterministic without
 * rendering the heavy file-input component.
 */
function okOutcome(validCount: number): KnowledgeParseOutcome {
  return {
    ok: true,
    rows: [],
    validCount,
    invalidCount: 0,
    inFileDuplicateCount: 0,
  }
}

describe('canConfirmImport', () => {
  it('is false with no industry chosen (even with valid rows)', () => {
    expect(canConfirmImport('', okOutcome(3))).toBe(false)
  })

  it('is false when no valid rows parsed', () => {
    expect(canConfirmImport('plumbing', okOutcome(0))).toBe(false)
  })

  it('is true with an industry and at least one valid row', () => {
    expect(canConfirmImport('plumbing', okOutcome(3))).toBe(true)
  })

  it('is false when nothing has been parsed yet', () => {
    expect(canConfirmImport('plumbing', null)).toBe(false)
  })

  it('is false on a fatal parse outcome', () => {
    const fatal: KnowledgeParseOutcome = {
      ok: false,
      fatal: 'missing_columns',
      detail: 'Missing required column(s): body',
    }
    expect(canConfirmImport('plumbing', fatal)).toBe(false)
  })
})

describe('industry options', () => {
  it('exposes the known industries the form/import Select renders', () => {
    expect(INDUSTRIES.length).toBeGreaterThan(0)
    expect(INDUSTRIES.every((i) => i.id && i.label)).toBe(true)
    // 'plumbing' (used in the gate cases) is a known industry id.
    expect(INDUSTRIES.some((i) => i.id === 'plumbing')).toBe(true)
  })
})
