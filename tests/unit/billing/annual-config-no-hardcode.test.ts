import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ANN-01 (nothing hardcoded) — STATIC SOURCE GUARD.
 *
 * Every annual-billing number (the global annual per-seat price, each tier's
 * annual subscription price) must live in EXACTLY ONE place:
 * lib/billing/billing-config.ts, read at runtime via getBillingConfig(). No
 * other billing source file may bake an annual price into a literal — they must
 * take it from the resolved config.
 *
 * This is a PURE source-grep test (readFileSync only — no DB, no mocks, no
 * secrets), a direct mirror of tests/unit/billing/seat-config-no-hardcode.ts.
 * It is GREEN in this phase (only billing-config.ts holds the numbers) and STAYS
 * green after Phases 143/144/145 wire the consumers (which READ config, never
 * hardcode). Files that do not yet exist are skipped (guarded by existsSync).
 */

const ROOT = process.cwd()

// The ONLY legal home for the annual-billing numeric literals.
const CONFIG_REL = 'lib/billing/billing-config.ts'

// Annual-billing source files (the future consumers). NONE may hardcode an
// annual price. These are the Phase 143/144/145 consumers — this phase ships
// none of them changed, so each is guarded by existsSync (skipped until it
// exists) and the test stays green once those phases wire them to READ
// getBillingConfig.
const ANNUAL_SOURCE_FILES = [
  'app/api/billing/create-checkout-session/route.ts',
  'lib/billing/stripe-client.ts',
  'components/billing/tier-cards-grid.tsx',
  'components/billing/tier-card.tsx',
] as const

// Forbidden: a numeric literal assigned DIRECTLY to an annual field. Reading the
// field (`cfg.seatPriceAnnualCents`, `config.tiers[tier].subscriptionPriceAnnualCents`)
// is NOT a numeric-literal assignment, so it is allowed.
//   seatPriceAnnualCents = 15000              (assignment)
//   seatPriceAnnualCents: 15000               (object-literal property)
//   subscriptionPriceAnnualCents = 29000      (assignment)
//   subscriptionPriceAnnualCents: 29000       (object-literal property)
const FORBIDDEN_PATTERNS: RegExp[] = [
  /seatPriceAnnualCents\s*=\s*\d/,
  /subscriptionPriceAnnualCents\s*=\s*\d/,
  /subscriptionPriceAnnualCents\s*:\s*\d/,
  /seatPriceAnnualCents\s*:\s*\d/,
]

describe('ANN-01: no annual price hardcoded outside billing-config.ts', () => {
  it('the one legal home (billing-config.ts) DOES contain the annual fields', () => {
    const src = readFileSync(resolve(ROOT, CONFIG_REL), 'utf8')
    expect(src).toMatch(/seatPriceAnnualCents/)
    expect(src).toMatch(/subscriptionPriceAnnualCents/)
  })

  it('no annual-billing consumer assigns an annual price numeric literal', () => {
    const violations: Array<{ file: string; pattern: string }> = []
    for (const rel of ANNUAL_SOURCE_FILES) {
      const abs = resolve(ROOT, rel)
      if (!existsSync(abs)) continue // not shipped yet — skip
      const src = readFileSync(abs, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(src)) {
          violations.push({ file: rel, pattern: pattern.source })
        }
      }
    }
    expect(
      violations,
      `annual prices must come from getBillingConfig() — these files hardcode an annual literal: ${violations
        .map((v) => `${v.file} (${v.pattern})`)
        .join(', ')}`
    ).toEqual([])
  })
})
