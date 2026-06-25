import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEAT-06 (nothing hardcoded) — STATIC SOURCE GUARD.
 *
 * Every seat-billing number (the per-seat price, each tier's included-seat
 * count) must live in EXACTLY ONE place: lib/billing/billing-config.ts, read at
 * runtime via getBillingConfig(). No other seat-billing source file may bake a
 * seat number into a literal — they must take it from the resolved config.
 *
 * This is a PURE source-grep test (readFileSync only — no DB, no mocks, no
 * secrets), modeled on tests/unit/agent-tools/neutrality.test.ts. It is GREEN in
 * Wave 1 (only billing-config.ts holds the numbers) and STAYS green after Plan
 * 02/03 add lib/billing/seat-billing.ts + the wiring (which READ config, never
 * hardcode). Files that do not yet exist are skipped (guarded by existsSync).
 */

const ROOT = process.cwd()

// The ONLY legal home for the seat-billing numeric literals.
const CONFIG_REL = 'lib/billing/billing-config.ts'

// Seat-billing source files (the consumers). NONE may hardcode a seat number.
// seat-billing.ts may not exist yet (Wave 1, before Plan 02) — guarded below.
const SEAT_SOURCE_FILES = [
  'lib/billing/seat-billing.ts',
  'lib/actions/team.ts',
  'lib/actions/invite-accept.ts',
] as const

// Forbidden: a numeric literal assigned DIRECTLY to a seat field. The robust
// invariant — every seat number must come from getBillingConfig()/the passed
// config, never a bare literal in a consumer.
//   seatPriceCents = 1500        (assignment)
//   includedSeats = 1            (assignment)
//   includedSeats: 1             (object-literal property)
// Reading the field (`cfg.seatPriceCents`, `config.tiers[tier].includedSeats`)
// is NOT a numeric-literal assignment, so it is allowed.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /seatPriceCents\s*=\s*\d/,
  /includedSeats\s*=\s*\d/,
  /includedSeats\s*:\s*\d/,
]

describe('SEAT-06: no seat number hardcoded outside billing-config.ts', () => {
  it('the one legal home (billing-config.ts) DOES contain the seat fields', () => {
    const src = readFileSync(resolve(ROOT, CONFIG_REL), 'utf8')
    expect(src).toMatch(/seatPriceCents/)
    expect(src).toMatch(/includedSeats/)
  })

  it('no seat-billing consumer assigns a seat price / included-seat numeric literal', () => {
    const violations: Array<{ file: string; pattern: string }> = []
    for (const rel of SEAT_SOURCE_FILES) {
      const abs = resolve(ROOT, rel)
      if (!existsSync(abs)) continue // not shipped yet (Wave 1) — skip
      const src = readFileSync(abs, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(src)) {
          violations.push({ file: rel, pattern: pattern.source })
        }
      }
    }
    expect(
      violations,
      `seat numbers must come from getBillingConfig() — these files hardcode a seat literal: ${violations
        .map((v) => `${v.file} (${v.pattern})`)
        .join(', ')}`
    ).toEqual([])
  })
})
