import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * INVOICE-01 (RED until Plan 04): saveEstimate must no longer short-circuit on a
 * consolidated estimate — the consolidate write-block is removed and estimates
 * are always editable (D-01, D-02).
 *
 * Deterministic source-read variant (per plan): the save action source must NOT
 * contain the consolidated write-block error string. It is present today
 * (lib/actions/estimate.ts), so this is RED now and turns GREEN when Plan 04
 * deletes the gate.
 */

const SOURCE_PATH = resolve(process.cwd(), 'lib/actions/estimate.ts')

describe('INVOICE-01: saveEstimate has no consolidated write-block', () => {
  it('does not reject writes with a "consolidated" error string', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    expect(source).not.toContain('This estimate is consolidated')
  })

  it('does not pre-select workflow_status to gate the save', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8')
    // The write-block selects workflow_status then compares to 'consolidated'.
    // Once the gate is gone, the save action no longer references that comparison.
    expect(source).not.toMatch(/workflow_status\s*===\s*'consolidated'/)
  })
})
