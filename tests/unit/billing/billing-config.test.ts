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
// SEAT-06 — seat config deep-merge (seatPriceCents + per-tier includedSeats)
// =============================================================================
describe('SEAT-06: seat config deep-merge', () => {
  it('resolves seatPriceCents + tiers.pro.includedSeats from DEFAULT when no row exists', async () => {
    serviceClientImpl = () => makeServiceClient(null)
    const cfg = await getBillingConfig()
    expect(cfg.seatPriceCents).toBe(DEFAULT_BILLING_CONFIG.seatPriceCents)
    expect(cfg.tiers.pro.includedSeats).toBe(DEFAULT_BILLING_CONFIG.tiers.pro.includedSeats)
  })

  it('a pre-existing row WITHOUT a tiers key still resolves includedSeats from DEFAULT (Pitfall-6)', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 5 } })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro.includedSeats).toBe(DEFAULT_BILLING_CONFIG.tiers.pro.includedSeats)
    expect(cfg.tiers.business.includedSeats).toBe(
      DEFAULT_BILLING_CONFIG.tiers.business.includedSeats
    )
    // seatPriceCents also falls through to the default for a pre-existing row
    expect(cfg.seatPriceCents).toBe(DEFAULT_BILLING_CONFIG.seatPriceCents)
  })

  it('a stored row overriding seatPriceCents resolves it, rest default', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { seatPriceCents: 2500 } })
    const cfg = await getBillingConfig()
    expect(cfg.seatPriceCents).toBe(2500)
    expect(cfg.tiers).toEqual(DEFAULT_BILLING_CONFIG.tiers)
  })

  it('a stored partial tiers object still resolves non-overridden tiers includedSeats from DEFAULT', async () => {
    serviceClientImpl = () =>
      makeServiceClient({
        metadata: {
          tiers: {
            pro: { monthlyCreditGrant: 12000, subscriptionPriceCents: 3900, includedSeats: 3 },
          },
        },
      })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro.includedSeats).toBe(3)
    expect(cfg.tiers.free.includedSeats).toBe(DEFAULT_BILLING_CONFIG.tiers.free.includedSeats)
    expect(cfg.tiers.business.includedSeats).toBe(
      DEFAULT_BILLING_CONFIG.tiers.business.includedSeats
    )
  })
})

// =============================================================================
// ANN-01 — annual price deep-merge (seatPriceAnnualCents + per-tier
//          subscriptionPriceAnnualCents)
// =============================================================================
describe('ANN-01: annual price deep-merge', () => {
  it('resolves seatPriceAnnualCents + tiers.pro.subscriptionPriceAnnualCents from DEFAULT when no row exists', async () => {
    serviceClientImpl = () => makeServiceClient(null)
    const cfg = await getBillingConfig()
    expect(cfg.seatPriceAnnualCents).toBe(DEFAULT_BILLING_CONFIG.seatPriceAnnualCents)
    expect(cfg.tiers.pro.subscriptionPriceAnnualCents).toBe(
      DEFAULT_BILLING_CONFIG.tiers.pro.subscriptionPriceAnnualCents
    )
  })

  it('a pre-existing row WITHOUT a tiers key still resolves the annual fields from DEFAULT (Pitfall-6)', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 5 } })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro.subscriptionPriceAnnualCents).toBe(
      DEFAULT_BILLING_CONFIG.tiers.pro.subscriptionPriceAnnualCents
    )
    expect(cfg.seatPriceAnnualCents).toBe(DEFAULT_BILLING_CONFIG.seatPriceAnnualCents)
  })

  it('a stored row overriding seatPriceAnnualCents resolves it, tiers default', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { seatPriceAnnualCents: 12000 } })
    const cfg = await getBillingConfig()
    expect(cfg.seatPriceAnnualCents).toBe(12000)
    expect(cfg.tiers).toEqual(DEFAULT_BILLING_CONFIG.tiers)
  })

  it('a stored partial tiers object resolves its subscriptionPriceAnnualCents, others from DEFAULT', async () => {
    serviceClientImpl = () =>
      makeServiceClient({
        metadata: {
          tiers: {
            pro: {
              monthlyCreditGrant: 9000,
              subscriptionPriceCents: 2900,
              subscriptionPriceAnnualCents: 25000,
              includedSeats: 1,
            },
          },
        },
      })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro.subscriptionPriceAnnualCents).toBe(25000)
    expect(cfg.tiers.free.subscriptionPriceAnnualCents).toBe(
      DEFAULT_BILLING_CONFIG.tiers.free.subscriptionPriceAnnualCents
    )
    expect(cfg.tiers.business.subscriptionPriceAnnualCents).toBe(
      DEFAULT_BILLING_CONFIG.tiers.business.subscriptionPriceAnnualCents
    )
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

  // SEAT-06: seatPriceCents + per-tier includedSeats validation
  it('rejects negative seatPriceCents', () => {
    expect(
      billingConfigSchema.safeParse({ ...DEFAULT_BILLING_CONFIG, seatPriceCents: -1 }).success
    ).toBe(false)
  })

  it('rejects a tier with non-integer includedSeats', () => {
    const bad = {
      ...DEFAULT_BILLING_CONFIG,
      tiers: {
        ...DEFAULT_BILLING_CONFIG.tiers,
        pro: { ...DEFAULT_BILLING_CONFIG.tiers.pro, includedSeats: 1.5 },
      },
    }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
  })

  // ANN-01: annual-price validation
  it('rejects negative seatPriceAnnualCents', () => {
    expect(
      billingConfigSchema.safeParse({ ...DEFAULT_BILLING_CONFIG, seatPriceAnnualCents: -1 }).success
    ).toBe(false)
  })

  it('rejects a tier with non-integer subscriptionPriceAnnualCents', () => {
    const bad = {
      ...DEFAULT_BILLING_CONFIG,
      tiers: {
        ...DEFAULT_BILLING_CONFIG.tiers,
        pro: { ...DEFAULT_BILLING_CONFIG.tiers.pro, subscriptionPriceAnnualCents: 1.5 },
      },
    }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
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
//
// Phase 111 shipped getBillingConfig DORMANT (no production consumer). Phase 112
// introduces the FIRST legitimate consumer: lib/billing/credit-ledger.ts, the
// credit metering core, which reads markup/creditUnitUsd/enforcementEnabled at
// call time (BILLCFG-03 — no hard-coded billing numbers). That module is
// therefore allowlisted here. The guard still holds the intent: no OTHER
// production module may reference the symbol — it remains tightly scoped to the
// reader + its single credit-ledger consumer.
// =============================================================================
describe('BILLCFG-03: getBillingConfig consumed ONLY by the reader + credit-ledger', () => {
  it('only the reader module and credit-ledger.ts reference the getBillingConfig SYMBOL', () => {
    const ROOTS = ['lib', 'app', 'components']
    const CREDIT_LEDGER_PATH = resolve(process.cwd(), 'lib/billing/credit-ledger.ts')
    // Phase 113 (Stripe rail): the invoice.paid grant + checkout top-up arm read
    // tier grants from getBillingConfig (113-02), and the create-topup-session
    // route reads topUpPacks to build the inline price_data (113-03). Both are
    // the runtime-authoritative billing source — legitimate config consumers.
    const STRIPE_WEBHOOK_PATH = resolve(process.cwd(), 'app/api/webhooks/stripe/route.ts')
    const TOPUP_SESSION_PATH = resolve(
      process.cwd(),
      'app/api/billing/create-topup-session/route.ts'
    )
    // Phase 114 (estimate payment fee): the generateInvoice action reads
    // estimateFeePct/estimateFeeMinCents to compute the Connect-invoice
    // application_fee_amount (FEE-03), and the Settings → Payments disclosure
    // page reads estimateFeePct to render the "%" notice at connect time
    // (DISCLOSE-01, Plan 03). Both are runtime-authoritative billing-config
    // consumers — added here together so the dormancy guard stays green when
    // Plan 03 lands, while the guard still fails on any OTHER consumer.
    const INVOICE_ACTION_PATH = resolve(process.cwd(), 'lib/actions/invoice.ts')
    const PAYMENTS_PAGE_PATH = resolve(process.cwd(), 'app/(app)/settings/integrations/stripe/page.tsx')
    // Phase 115 (Credit Balance UX): the owner-facing credit overview query reads
    // lowBalanceThresholds from getBillingConfig to surface low-balance guidance
    // (CREDITUI-01) — the runtime-authoritative billing source, a legitimate
    // consumer. The guard still fails on any OTHER reference of the symbol.
    const CREDITS_QUERY_PATH = resolve(process.cwd(), 'lib/queries/credits.ts')
    // Phase 139 (seat billing): lib/billing/seat-billing.ts syncSeatBilling reads
    // seatPriceCents + per-tier includedSeats + enforcementEnabled from
    // getBillingConfig at call time (SEAT-07) to reconcile the Stripe subscription
    // seat-quantity item — the runtime-authoritative billing source, a legitimate
    // consumer. The guard still fails on any OTHER reference of the symbol.
    const SEAT_BILLING_PATH = resolve(process.cwd(), 'lib/billing/seat-billing.ts')
    // Phase 140 (seat-cost transparency, SEAT-08): buildSeatCostSummary reads
    // seatPriceCents + per-tier includedSeats + enforcementEnabled from
    // getBillingConfig to disclose the projected monthly seat cost on the
    // Settings → Team surface. The runtime-authoritative billing-config consumer
    // (DISPLAY ONLY — no mutation); the team page invokes the builder transitively
    // and does NOT reference the getBillingConfig symbol itself. The guard still
    // fails on any OTHER reference of the symbol.
    const SEAT_COST_SUMMARY_PATH = resolve(process.cwd(), 'lib/billing/seat-cost-summary.ts')
    // Phase 142 (ANN-02): the monthly-credit-grant cron reads
    // cfg.tiers[tier].monthlyCreditGrant from getBillingConfig (read ONCE per run)
    // to grant active paying companies their per-tier monthly allowance —
    // the runtime-authoritative billing source, a legitimate consumer (same role
    // as the invoice.paid webhook grant). The guard still fails on any OTHER
    // reference of the symbol.
    const MONTHLY_CREDIT_GRANT_PATH = resolve(
      process.cwd(),
      'lib/inngest/functions/monthly-credit-grant.ts',
    )
    // Phase 145 (ANN-05): the Settings → Billing server page reads
    // subscriptionPriceAnnualCents + subscriptionPriceCents per tier from
    // getBillingConfig to derive the annual/monthly price props passed to
    // TierCardsGrid — the runtime-authoritative billing source, a legitimate
    // display consumer (DISPLAY ONLY — no mutation). The guard still fails on
    // any OTHER reference of the symbol.
    const BILLING_PAGE_PATH = resolve(
      process.cwd(),
      'app/(app)/settings/billing/page.tsx',
    )
    // The trial-warning email cron reads subscriptionPriceCents per tier from
    // getBillingConfig to render the Pro/Business upgrade copy — the
    // runtime-authoritative source, so the price is NEVER hardcoded in the email.
    // A legitimate display consumer (DISPLAY ONLY — no mutation).
    const TRIAL_WARNING_EMAIL_PATH = resolve(
      process.cwd(),
      'app/api/cron/trial-warning-emails/route.ts',
    )
    const ALLOWLIST = new Set([
      MODULE_PATH,
      CREDIT_LEDGER_PATH,
      STRIPE_WEBHOOK_PATH,
      TOPUP_SESSION_PATH,
      INVOICE_ACTION_PATH,
      PAYMENTS_PAGE_PATH,
      CREDITS_QUERY_PATH,
      SEAT_BILLING_PATH,
      SEAT_COST_SUMMARY_PATH,
      MONTHLY_CREDIT_GRANT_PATH,
      BILLING_PAGE_PATH,
      TRIAL_WARNING_EMAIL_PATH,
    ])

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

    // The assertion is SYMBOL-scoped: nothing OUTSIDE the reader module and its
    // single Phase-112 credit-ledger consumer imports or calls the
    // getBillingConfig FUNCTION. The module PATH '@/lib/billing/billing-config'
    // is DELIBERATELY allowed — Plan 02's panel legitimately imports
    // DEFAULT_BILLING_CONFIG and the BillingConfig type from it.
    const symbolRe = /\bgetBillingConfig\b/
    const offenders = collected.filter((file) => symbolRe.test(readFileSync(file, 'utf8')))

    expect(
      offenders,
      `getBillingConfig may only be referenced by the reader + credit-ledger.ts — these other files reference the symbol: ${offenders.join(', ')}`
    ).toEqual([])
  })
})
