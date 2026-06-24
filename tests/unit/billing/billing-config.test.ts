import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Phase 111-01 — billing_config store CORE.
 *
 * Encodes the full BILLCFG-01 / BILLCFG-02 / BILLCFG-03-structural contract
 * BEFORE any implementation (Wave 0 — RED):
 *   - BILLCFG-01: getBillingConfig() null-safe defaults + shallow/deep merge.
 *   - BILLCFG-02: billingConfigSchema accepts defaults round-trip, rejects bad input.
 *   - BILLCFG-03 (structural): the reader is server-only + uses createServiceClient,
 *     and the getBillingConfig FUNCTION SYMBOL ships DORMANT (no production consumer).
 *
 * Pure-source guards (server-only / dormancy) read files with readFileSync /
 * readdirSync — no DB, no secrets. The behavioural reader tests mock the service
 * client exactly like tests/unit/admin/price-research-config.test.ts.
 */

// ---- service-client mock ----------------------------------------------------
// A single mutable holder lets each test choose what createServiceClient()
// returns: null (static build) or a chainable stub resolving { data, error }.
let serviceClientImpl: () => unknown = () => null

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => serviceClientImpl(),
}))

/** Build a chainable stub whose .from().select().eq().maybeSingle() resolves the row. */
function makeServiceClient(row: { metadata: unknown } | null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
  }
}

// ---- import under test (after the mock) -------------------------------------
import {
  getBillingConfig,
  DEFAULT_BILLING_CONFIG,
  invalidateBillingConfigCache,
} from '@/lib/billing/billing-config'
import { billingConfigSchema } from '@/lib/schemas/admin'

beforeEach(() => {
  serviceClientImpl = () => null
  // Clear the 30s TTL cache so one test's value never leaks into the next.
  invalidateBillingConfigCache()
})

// =============================================================================
// BILLCFG-01 — defaults / null-safe
// =============================================================================
describe('BILLCFG-01: getBillingConfig defaults (null-safe)', () => {
  it('returns DEFAULT_BILLING_CONFIG when the row is absent', async () => {
    serviceClientImpl = () => makeServiceClient(null)
    const cfg = await getBillingConfig()
    expect(cfg).toEqual(DEFAULT_BILLING_CONFIG)
  })

  it('returns DEFAULT_BILLING_CONFIG when createServiceClient() returns null (static build)', async () => {
    serviceClientImpl = () => null
    const cfg = await getBillingConfig()
    expect(cfg).toEqual(DEFAULT_BILLING_CONFIG)
  })
})

// =============================================================================
// BILLCFG-01 — merge (shallow over defaults, deep on tiers)
// =============================================================================
describe('BILLCFG-01: getBillingConfig merge', () => {
  it('shallow-merges stored metadata over defaults (markup overridden, rest default)', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 6 } })
    const cfg = await getBillingConfig()
    expect(cfg.markup).toBe(6)
    // every other top-level field stays default
    expect(cfg.creditUnitUsd).toBe(DEFAULT_BILLING_CONFIG.creditUnitUsd)
    expect(cfg.estimateFeePct).toBe(DEFAULT_BILLING_CONFIG.estimateFeePct)
    expect(cfg.tiers).toEqual(DEFAULT_BILLING_CONFIG.tiers)
  })

  it('deep-merges tiers (tiers.pro updated, free/trial/business still default)', async () => {
    serviceClientImpl = () =>
      makeServiceClient({
        metadata: {
          tiers: { pro: { monthlyCreditGrant: 12000, subscriptionPriceCents: 3900 } },
        },
      })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro).toEqual({ monthlyCreditGrant: 12000, subscriptionPriceCents: 3900 })
    expect(cfg.tiers.free).toEqual(DEFAULT_BILLING_CONFIG.tiers.free)
    expect(cfg.tiers.trial).toEqual(DEFAULT_BILLING_CONFIG.tiers.trial)
    expect(cfg.tiers.business).toEqual(DEFAULT_BILLING_CONFIG.tiers.business)
  })
})

// =============================================================================
// CREDIT-05 — enforcementEnabled master charging switch (default false)
// =============================================================================
describe('CREDIT-05: enforcementEnabled (measure-only safety)', () => {
  it('DEFAULT_BILLING_CONFIG.enforcementEnabled is false (calibrate before charging)', () => {
    expect(DEFAULT_BILLING_CONFIG.enforcementEnabled).toBe(false)
  })

  it('a stored row WITHOUT enforcementEnabled still resolves to false (deep-merge tolerates absence)', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 5 } })
    const cfg = await getBillingConfig()
    expect(cfg.enforcementEnabled).toBe(false)
  })

  it('a stored row WITH enforcementEnabled: true overrides the default to true', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { enforcementEnabled: true } })
    const cfg = await getBillingConfig()
    expect(cfg.enforcementEnabled).toBe(true)
  })
})

// =============================================================================
// BILLCFG-02 — schema (validated here so the writer can trust it)
// =============================================================================
describe('BILLCFG-02: billingConfigSchema', () => {
  it('accepts DEFAULT_BILLING_CONFIG round-tripped', () => {
    const res = billingConfigSchema.safeParse(DEFAULT_BILLING_CONFIG)
    expect(res.success).toBe(true)
  })

  it('rejects negative markup', () => {
    expect(billingConfigSchema.safeParse({ ...DEFAULT_BILLING_CONFIG, markup: -1 }).success).toBe(false)
  })

  it('rejects zero markup', () => {
    expect(billingConfigSchema.safeParse({ ...DEFAULT_BILLING_CONFIG, markup: 0 }).success).toBe(false)
  })

  it('rejects estimateFeePct > 1', () => {
    expect(
      billingConfigSchema.safeParse({ ...DEFAULT_BILLING_CONFIG, estimateFeePct: 1.5 }).success
    ).toBe(false)
  })

  it('rejects non-integer cents (subscriptionPriceCents)', () => {
    const bad = {
      ...DEFAULT_BILLING_CONFIG,
      tiers: {
        ...DEFAULT_BILLING_CONFIG.tiers,
        pro: { monthlyCreditGrant: 9000, subscriptionPriceCents: 29.5 },
      },
    }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a tiers object missing the business tier', () => {
    const { business: _drop, ...partialTiers } = DEFAULT_BILLING_CONFIG.tiers
    const bad = { ...DEFAULT_BILLING_CONFIG, tiers: partialTiers }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects creditUnitUsd: 0', () => {
    expect(
      billingConfigSchema.safeParse({ ...DEFAULT_BILLING_CONFIG, creditUnitUsd: 0 }).success
    ).toBe(false)
  })
})

// =============================================================================
// BILLCFG-03 (structural) — static source guards
// =============================================================================
const MODULE_REL = 'lib/billing/billing-config.ts'
const MODULE_PATH = resolve(process.cwd(), MODULE_REL)

describe('BILLCFG-03: server-only reader', () => {
  it("billing-config.ts source contains import 'server-only' (no browser path)", () => {
    const src = readFileSync(MODULE_PATH, 'utf8')
    expect(src).toMatch(/import 'server-only'/)
  })

  it('billing-config.ts reads via createServiceClient (never the browser client)', () => {
    const src = readFileSync(MODULE_PATH, 'utf8')
    expect(src).toMatch(/createServiceClient/)
  })
})

// =============================================================================
// BILLCFG-03 (dormancy — SYMBOL-scoped, NOT path-scoped)
// =============================================================================
describe('BILLCFG-03: getBillingConfig function ships dormant', () => {
  it('no production module under lib/ app/ components/ references the getBillingConfig SYMBOL', () => {
    const ROOTS = ['lib', 'app', 'components']
    const ALLOWLIST = new Set([MODULE_PATH])

    const collected: string[] = []
    function walk(dir: string) {
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const name of entries) {
        const full = join(dir, name)
        let st
        try {
          st = statSync(full)
        } catch {
          continue
        }
        if (st.isDirectory()) {
          if (name === 'node_modules') continue
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(name)) continue
        // skip any test path + the reader module itself
        const norm = full.replace(/\\/g, '/')
        if (norm.includes('/tests/')) continue
        if (ALLOWLIST.has(full)) continue
        collected.push(full)
      }
    }
    for (const root of ROOTS) walk(resolve(process.cwd(), root))

    // The dormancy assertion is SYMBOL-scoped: nothing outside the reader module
    // imports or calls the getBillingConfig FUNCTION. The module PATH
    // '@/lib/billing/billing-config' is DELIBERATELY allowed — Plan 02's panel
    // legitimately imports DEFAULT_BILLING_CONFIG and the BillingConfig type from it.
    const symbolRe = /\bgetBillingConfig\b/
    const offenders = collected.filter((file) => symbolRe.test(readFileSync(file, 'utf8')))

    expect(
      offenders,
      `getBillingConfig is DORMANT this phase — these files reference the function symbol: ${offenders.join(', ')}`
    ).toEqual([])
  })
})
