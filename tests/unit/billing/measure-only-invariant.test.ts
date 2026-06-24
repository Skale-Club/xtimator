import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * CALIB-01 (measure-only invariant guard): the production cost helper
 * `lib/billing/record-ai-cost.ts` must contain ZERO charging logic. Phase 110
 * instruments real cost but NEVER charges — credit/debit/ledger/balance/markup
 * arrive only in Phases 112+ (and only after calibration in Phase 116).
 *
 * This is a static source guard: it fails if any charging token is reintroduced
 * into the cost module, locking the measure-only contract for the whole phase.
 * Pure file read — runs in CI with no DB and no secrets.
 */

const MODULE_PATH = resolve(process.cwd(), 'lib/billing/record-ai-cost.ts')

function readModule(): string {
  return readFileSync(MODULE_PATH, 'utf8')
}

const FORBIDDEN_CHARGING_TOKENS = ['credit', 'debit', 'ledger', 'balance', 'markup'] as const

describe('CALIB-01: measure-only invariant for record-ai-cost.ts', () => {
  it('contains NONE of the charging tokens (credit/debit/ledger/balance/markup)', () => {
    const src = readModule()
    for (const token of FORBIDDEN_CHARGING_TOKENS) {
      expect(
        src,
        `measure-only violation: found "${token}" in lib/billing/record-ai-cost.ts`
      ).not.toMatch(new RegExp(token, 'i'))
    }
  })

  it('imports ONLY requireServiceClient (no charging/ledger/billing-config module import)', () => {
    const src = readModule()
    const importLines = src
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line))

    // The single runtime dependency is the service client.
    expect(importLines.some((l) => /requireServiceClient/.test(l))).toBe(true)

    // No import line may pull in a charging/ledger/billing-config dependency.
    for (const line of importLines) {
      expect(
        line,
        `unexpected charging-related import: ${line.trim()}`
      ).not.toMatch(/credit|ledger|debit|balance|markup|billing-config|billing_config/i)
    }
  })

  it('does NOT coerce the cost to 0 (null vs 0 discipline preserved in source)', () => {
    const src = readModule()
    // `?? 0` applied to the cost would silently convert an unknown cost to zero.
    expect(src).toMatch(/real_cost_usd:\s*ev\.realCostUsd/)
    expect(src).not.toMatch(/realCostUsd\s*\?\?\s*0/)
  })
})
