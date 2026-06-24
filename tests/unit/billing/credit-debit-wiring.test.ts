import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 112 Plan 04 (CREDIT-02 / CREDIT-07) — credit-debit WIRING contract.
 *
 * A static source-read guard (mirrors the migration-contract + measure-only tests —
 * no Inngest runtime, no DB, no secrets). It locks that each of the four metered AI
 * seams fires a `recordCreditDebit` AFTER its existing usage seam, with the correct
 * operationType, and that CREDIT-07 holds BY CONSTRUCTION — there is NO `channel ===
 * 'mcp'` debit branch anywhere (a non-spend op simply has no cost → no debit).
 */

const GENERATE_ESTIMATE = resolve(process.cwd(), 'lib/inngest/functions/generate-estimate.ts')
const ANALYZE_PHOTOS = resolve(process.cwd(), 'lib/inngest/functions/analyze-photos.ts')
const TRANSCRIBE_AUDIO = resolve(process.cwd(), 'lib/inngest/functions/transcribe-audio.ts')
const ORCHESTRATOR = resolve(process.cwd(), 'lib/estimate/price-research/orchestrator.ts')

const ALL_FOUR = [GENERATE_ESTIMATE, ANALYZE_PHOTOS, TRANSCRIBE_AUDIO, ORCHESTRATOR]

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

const IMPORT_RE =
  /import\s+\{[^}]*\brecordCreditDebit\b[^}]*\}\s+from\s+['"]@\/lib\/billing\/credit-ledger['"]/

describe('CREDIT-02: recordCreditDebit is imported into all four metered seams', () => {
  it.each(ALL_FOUR)('%s imports recordCreditDebit from @/lib/billing/credit-ledger', (path) => {
    expect(read(path)).toMatch(IMPORT_RE)
  })
})

describe('CREDIT-02: the three Inngest jobs add a record-credit-debit step', () => {
  it.each([GENERATE_ESTIMATE, ANALYZE_PHOTOS, TRANSCRIBE_AUDIO])(
    '%s contains step.run(\'record-credit-debit\')',
    (path) => {
      expect(read(path)).toContain("step.run('record-credit-debit'")
    }
  )
})

describe('CREDIT-02: each seam debits with its correct operationType', () => {
  it('generate-estimate debits operationType: estimate', () => {
    expect(read(GENERATE_ESTIMATE)).toMatch(/operationType:\s*'estimate'/)
  })
  it('analyze-photos debits operationType: photo_batch', () => {
    expect(read(ANALYZE_PHOTOS)).toMatch(/operationType:\s*'photo_batch'/)
  })
  it('transcribe-audio debits operationType: audio_minutes', () => {
    expect(read(TRANSCRIBE_AUDIO)).toMatch(/operationType:\s*'audio_minutes'/)
  })
  it('orchestrator debits operationType: price_research', () => {
    expect(read(ORCHESTRATOR)).toMatch(/operationType:\s*'price_research'/)
  })
})

describe('CREDIT-07: NO channel === mcp debit guard anywhere (zero-debit by construction)', () => {
  it.each(ALL_FOUR)('%s has no \'mcp\'-guarded debit branch', (path) => {
    const src = read(path)
    // No `channel === 'mcp'` anywhere near the debit — CREDIT-07 holds because a
    // non-spend op records no cost, NOT because of a special MCP branch.
    expect(src).not.toMatch(/channel\s*===\s*['"]mcp['"]/)
  })
})

describe('debit fires AFTER the existing usage seam (per-file string-index ordering)', () => {
  it('generate-estimate: record-credit-debit after record-usage', () => {
    const src = read(GENERATE_ESTIMATE)
    const usage = src.indexOf("step.run('record-usage'")
    const debit = src.indexOf("step.run('record-credit-debit'")
    expect(usage).toBeGreaterThanOrEqual(0)
    expect(debit).toBeGreaterThan(usage)
  })

  it('analyze-photos: record-credit-debit after record-usage', () => {
    const src = read(ANALYZE_PHOTOS)
    const usage = src.indexOf("step.run('record-usage'")
    const debit = src.indexOf("step.run('record-credit-debit'")
    expect(usage).toBeGreaterThanOrEqual(0)
    expect(debit).toBeGreaterThan(usage)
  })

  it('orchestrator: price_research debit (recordCreditDebit) after recordUsage', () => {
    const src = read(ORCHESTRATOR)
    const usage = src.indexOf('recordUsage(')
    const debit = src.indexOf('recordCreditDebit(')
    expect(usage).toBeGreaterThanOrEqual(0)
    expect(debit).toBeGreaterThan(usage)
  })

  it('transcribe-audio: anchored on save-transcript + recordAICost (it has NO recordUsage seam)', () => {
    const src = read(TRANSCRIBE_AUDIO)
    // transcribe-audio has no recordUsage token — anchor its ordering on its real seam.
    expect(src).not.toContain('recordUsage')
    const save = src.indexOf("step.run('save-transcript'")
    const cost = src.indexOf('recordAICost(')
    const debit = src.indexOf("step.run('record-credit-debit'")
    expect(save).toBeGreaterThanOrEqual(0)
    expect(cost).toBeGreaterThanOrEqual(0)
    expect(debit).toBeGreaterThan(save)
    expect(debit).toBeGreaterThan(cost)
  })
})
