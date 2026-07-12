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
import { tiers as staticTiers, type TierName } from '@/lib/entitlements'

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

  it('deep-merges tiers field-by-field (tiers.pro overrides applied, unset fields from DEFAULT; free/business untouched)', async () => {
    serviceClientImpl = () =>
      makeServiceClient({
        metadata: {
          tiers: { pro: { monthlyCreditGrant: 12000, subscriptionPriceCents: 3900 } },
        },
      })
    const cfg = await getBillingConfig()
    // the two overridden fields apply...
    expect(cfg.tiers.pro.monthlyCreditGrant).toBe(12000)
    expect(cfg.tiers.pro.subscriptionPriceCents).toBe(3900)
    // ...and every unset field (annual price, seats, stripe ids, entitlements,
    // bullets) falls through from the default pro tier (field-level deep merge).
    expect(cfg.tiers.pro).toEqual({
      ...DEFAULT_BILLING_CONFIG.tiers.pro,
      monthlyCreditGrant: 12000,
      subscriptionPriceCents: 3900,
    })
    expect(cfg.tiers.free).toEqual(DEFAULT_BILLING_CONFIG.tiers.free)
    expect(cfg.tiers.business).toEqual(DEFAULT_BILLING_CONFIG.tiers.business)
  })
})

// =============================================================================
// CREDIT-05 — enforcementEnabled master charging switch
// Billing v2: default TRUE (the free-tier credit wall depends on it); a stored
// admin row with false reverts the platform to record-only.
// =============================================================================
describe('CREDIT-05: enforcementEnabled (Billing v2 default ON)', () => {
  it('DEFAULT_BILLING_CONFIG.enforcementEnabled is true (the free wall requires it)', () => {
    expect(DEFAULT_BILLING_CONFIG.enforcementEnabled).toBe(true)
  })

  it('a stored row WITHOUT enforcementEnabled resolves to the default (true)', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 5 } })
    const cfg = await getBillingConfig()
    expect(cfg.enforcementEnabled).toBe(true)
  })

  it('a stored row WITH enforcementEnabled: false overrides to record-only', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { enforcementEnabled: false } })
    const cfg = await getBillingConfig()
    expect(cfg.enforcementEnabled).toBe(false)
  })

  it('DEFAULT_BILLING_CONFIG.signupCreditGrant is a positive one-time free allowance', () => {
    expect(DEFAULT_BILLING_CONFIG.signupCreditGrant).toBeGreaterThan(0)
  })
})

// =============================================================================
// CREDITUI-07: autoTopupEnabled kill switch
// =============================================================================
describe('CREDITUI-07: autoTopupEnabled kill switch', () => {
  it('DEFAULT_BILLING_CONFIG.autoTopupEnabled is false (mirrors enforcementEnabled default posture)', () => {
    expect(DEFAULT_BILLING_CONFIG.autoTopupEnabled).toBe(false)
  })

  it('a stored row WITHOUT autoTopupEnabled resolves to the default (false)', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 5 } })
    const cfg = await getBillingConfig()
    expect(cfg.autoTopupEnabled).toBe(false)
  })

  it('a stored row WITH autoTopupEnabled: true overrides to true', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { autoTopupEnabled: true } })
    const cfg = await getBillingConfig()
    expect(cfg.autoTopupEnabled).toBe(true)
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
// CREDITUI-06 — topUpPacks (3 dollar packs)
// =============================================================================
describe('CREDITUI-06: topUpPacks (3 dollar packs)', () => {
  it('DEFAULT_BILLING_CONFIG.topUpPacks has exactly 3 entries', () => {
    expect(DEFAULT_BILLING_CONFIG.topUpPacks).toHaveLength(3)
  })

  it('topUpPacks priceCents are $20/$50/$100 in order', () => {
    expect(DEFAULT_BILLING_CONFIG.topUpPacks[0].priceCents).toBe(2000)
    expect(DEFAULT_BILLING_CONFIG.topUpPacks[1].priceCents).toBe(5000)
    expect(DEFAULT_BILLING_CONFIG.topUpPacks[2].priceCents).toBe(10000)
  })

  it('every pack credits value is a positive integer', () => {
    for (const pack of DEFAULT_BILLING_CONFIG.topUpPacks) {
      expect(Number.isInteger(pack.credits)).toBe(true)
      expect(pack.credits).toBeGreaterThan(0)
    }
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
// Per-tier entitlements — DEFAULT matches lib/entitlements.ts; deep-merge fills
// the nested `entitlements` object from defaults; new stripePriceId fields null.
// =============================================================================
describe('per-tier entitlements in billing_config', () => {
  const TIER_NAMES: TierName[] = ['free', 'pro', 'business']
  const ENTITLEMENT_FIELDS = [
    'maxEstimatesPerMonth',
    'maxEstimatesPerDay',
    'maxPriceResearchPerMonth',
    'maxPhotosPerEstimate',
    'maxAudioMinutesPerEstimate',
    'whatsappEnabled',
    'pdfEnabled',
    'priceBookEnabled',
    'customDomainEnabled',
    'chatEnabled',
  ] as const

  it('DEFAULT entitlements per tier match lib/entitlements.ts field-by-field', () => {
    for (const t of TIER_NAMES) {
      const cfgEnt = DEFAULT_BILLING_CONFIG.tiers[t].entitlements
      const staticEnt = staticTiers[t]
      for (const field of ENTITLEMENT_FIELDS) {
        expect(cfgEnt[field], `${t}.${field}`).toBe(staticEnt[field])
      }
    }
  })

  it('a stored tier that OMITS entitlements resolves the whole object from DEFAULT (Pitfall-6)', async () => {
    serviceClientImpl = () =>
      makeServiceClient({
        metadata: {
          tiers: { pro: { monthlyCreditGrant: 9999, subscriptionPriceCents: 3900 } },
        },
      })
    const cfg = await getBillingConfig()
    // the override applied, but entitlements fell through from defaults
    expect(cfg.tiers.pro.monthlyCreditGrant).toBe(9999)
    expect(cfg.tiers.pro.entitlements).toEqual(DEFAULT_BILLING_CONFIG.tiers.pro.entitlements)
    expect(cfg.tiers.free.entitlements).toEqual(DEFAULT_BILLING_CONFIG.tiers.free.entitlements)
    expect(cfg.tiers.business.entitlements).toEqual(
      DEFAULT_BILLING_CONFIG.tiers.business.entitlements
    )
  })

  it('a stored tier with a PARTIAL entitlements object deep-merges the missing fields from DEFAULT', async () => {
    serviceClientImpl = () =>
      makeServiceClient({
        metadata: {
          tiers: { pro: { entitlements: { maxPhotosPerEstimate: 40 } } },
        },
      })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro.entitlements.maxPhotosPerEstimate).toBe(40)
    // every OTHER entitlement field still resolves from the default
    expect(cfg.tiers.pro.entitlements.maxEstimatesPerMonth).toBe(
      DEFAULT_BILLING_CONFIG.tiers.pro.entitlements.maxEstimatesPerMonth
    )
    expect(cfg.tiers.pro.entitlements.chatEnabled).toBe(
      DEFAULT_BILLING_CONFIG.tiers.pro.entitlements.chatEnabled
    )
  })

  it('new per-tier stripePriceId fields default to null for all three tiers', () => {
    for (const t of TIER_NAMES) {
      expect(DEFAULT_BILLING_CONFIG.tiers[t].stripePriceIdMonth).toBeNull()
      expect(DEFAULT_BILLING_CONFIG.tiers[t].stripePriceIdYear).toBeNull()
    }
  })

  it('a pre-existing row WITHOUT a tiers key still resolves stripePriceId nulls + entitlements from DEFAULT', async () => {
    serviceClientImpl = () => makeServiceClient({ metadata: { markup: 5 } })
    const cfg = await getBillingConfig()
    expect(cfg.tiers.pro.stripePriceIdMonth).toBeNull()
    expect(cfg.tiers.pro.stripePriceIdYear).toBeNull()
    expect(cfg.tiers.pro.entitlements).toEqual(DEFAULT_BILLING_CONFIG.tiers.pro.entitlements)
  })

  it('DEFAULT featureBullets per tier are non-empty marketing copy', () => {
    for (const t of TIER_NAMES) {
      expect(DEFAULT_BILLING_CONFIG.tiers[t].featureBullets.length).toBeGreaterThan(0)
    }
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
    // Phase 152 Plan 01 (CREDITUI-03): the app shell layout reads
    // signupCreditGrant / tiers[tier].monthlyCreditGrant from getBillingConfig
    // to compute the topbar usage chip's percentUsed via computeUsagePercent —
    // the runtime-authoritative billing source, a legitimate display consumer
    // (DISPLAY ONLY — no mutation). The guard still fails on any OTHER
    // reference of the symbol.
    const APP_LAYOUT_PATH = resolve(process.cwd(), 'app/(app)/layout.tsx')
    // Phase 152 Plan 02 (CREDITUI-05): the per-company admin detail page reads
    // getBillingConfig to compute the effective markup shown on the new
    // super-admin-only Cost & Billing card — a legitimate admin-only consumer
    // (DISPLAY ONLY — no mutation, never tenant-facing). The guard still fails
    // on any OTHER reference of the symbol.
    const ADMIN_COMPANY_PAGE_PATH = resolve(
      process.cwd(),
      'app/admin/companies/[id]/page.tsx',
    )
    // Phase 153 Plan 02 (CREDITUI-07): triggerAutoTopupIfNeeded reads
    // autoTopupEnabled (platform kill switch) + topUpPacks (to resolve the
    // pack being auto-purchased) from getBillingConfig — the runtime-
    // authoritative billing source, a legitimate consumer (same role as the
    // credit-ledger debit call site it is invoked from). The guard still
    // fails on any OTHER reference of the symbol.
    const AUTO_TOPUP_PATH = resolve(process.cwd(), 'lib/billing/auto-topup.ts')
    // Phase 153 Plan 03 (CREDITUI-07): saveAutoTopupSettings reads
    // autoTopupEnabled (platform kill switch) + topUpPacks (to range-validate
    // the tenant-selected packIndex server-side) from getBillingConfig — the
    // runtime-authoritative billing source, a legitimate tenant-action
    // consumer. The guard still fails on any OTHER reference of the symbol.
    const AUTO_TOPUP_ACTION_PATH = resolve(process.cwd(), 'lib/actions/auto-topup.ts')
    // Phase 158 (BILLADMIN-01/03): the super-admin billing overview page reads
    // getBillingConfig to compute the platform-wide real-cost/credit summary
    // (replacing the old hardcoded MRR math) and the per-tier prices shown in
    // the credit-model-centric per-company table — a legitimate admin-only
    // display consumer (DISPLAY ONLY — no mutation). The guard still fails on
    // any OTHER reference of the symbol.
    const ADMIN_BILLING_PAGE_PATH = resolve(process.cwd(), 'app/admin/billing/page.tsx')
    // Pre-launch audit fix (Onda 2, chat abuse guard): the chat route reads
    // absorbedChatRateLimitPerMin from getBillingConfig to rate-limit the
    // absorbed-cost AI chat endpoint per company — the runtime-authoritative
    // billing source, a legitimate consumer. The guard still fails on any
    // OTHER reference of the symbol.
    const CHAT_ROUTE_PATH = resolve(process.cwd(), 'app/api/chat/route.ts')
    // Phase 112 (runtime-editable entitlements): the async getEntitlementsForTier
    // resolver reads tiers[tier].entitlements from getBillingConfig (via a dynamic
    // import) — the server-side authority for tier caps + feature flags, a
    // legitimate runtime billing-config consumer. It lives in the SERVER-ONLY
    // lib/entitlements-server.ts (moved out of the client-reachable
    // lib/entitlements.ts so the dynamic billing-config import no longer drags
    // server-only into the client bundle). The guard still fails on any OTHER
    // reference of the symbol.
    const ENTITLEMENTS_PATH = resolve(process.cwd(), 'lib/entitlements-server.ts')
    // Runtime-editable plans (BILLCFG-02): the admin integrations content server
    // component sources the billing form's `current` prop from getBillingConfig —
    // the canonical deep-merge reader — so a legacy row that predates the nested
    // tier fields still resolves them from the defaults (was a hand-rolled shallow
    // merge that crashed the form). A legitimate admin-only DISPLAY consumer.
    const ADMIN_INTEGRATIONS_CONTENT_PATH = resolve(
      process.cwd(),
      'app/admin/integrations/integration-category-content.tsx',
    )
    // v4.18 (panel-managed subscription Prices): checkout resolves the Stripe
    // Price id from tiers[t].stripePriceIdMonth/Year (config-first, env fallback);
    // stripe-price-map maps a live price id back to a tier recognizing the same
    // config ids; stripe-display-prices prefers the config ids over env when
    // resolving the displayed unit_amount. All three are legitimate runtime
    // billing-config consumers. The guard still fails on any OTHER reference.
    const CHECKOUT_SESSION_PATH = resolve(process.cwd(), 'app/api/billing/create-checkout-session/route.ts')
    const STRIPE_PRICE_MAP_PATH = resolve(process.cwd(), 'lib/billing/stripe-price-map.ts')
    const STRIPE_DISPLAY_PRICES_PATH = resolve(process.cwd(), 'lib/billing/stripe-display-prices.ts')
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
      APP_LAYOUT_PATH,
      ADMIN_COMPANY_PAGE_PATH,
      AUTO_TOPUP_PATH,
      AUTO_TOPUP_ACTION_PATH,
      ADMIN_BILLING_PAGE_PATH,
      CHAT_ROUTE_PATH,
      ENTITLEMENTS_PATH,
      CHECKOUT_SESSION_PATH,
      STRIPE_PRICE_MAP_PATH,
      STRIPE_DISPLAY_PRICES_PATH,
      ADMIN_INTEGRATIONS_CONTENT_PATH,
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
