import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Phase 111 Plan 02 — saveBillingConfig() server action coverage
 * (BILLCFG-02 editable panel + BILLCFG-03 authz-first / tenant-no-route).
 *
 * The save action upserts the metadata-only `platform_integrations`
 * `billing_config` row. It MUST:
 *   - call requireAdmin() FIRST — a non-admin is rejected before any DB write
 *   - validate via billingConfigSchema (invalid → ok:false, NO upsert)
 *   - write the FULL config as metadata, all crypto columns null, onConflict 'provider'
 *   - invalidatePlatformConfig() (runtime apply) + audit 'billing_config.save'
 *
 * Plus a static guard (BILLCFG-03): no tenant-facing route (app/ minus app/admin/)
 * imports the billing-config-form or writes the provider:'billing_config' upsert.
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const upsertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))

let lastUpsertPayload:
  | {
      provider?: string
      ciphertext?: unknown
      iv?: unknown
      auth_tag?: unknown
      metadata?: Record<string, unknown>
    }
  | null = null

// Chainable Supabase stub: svc.from(t).upsert(p, opts)
const fromMock = vi.fn((_table: string) => ({
  upsert: (
    payload: {
      provider?: string
      ciphertext?: unknown
      iv?: unknown
      auth_tag?: unknown
      metadata?: Record<string, unknown>
    },
    _opts?: { onConflict?: string }
  ) => {
    lastUpsertPayload = payload
    return upsertMock()
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
}))

// v4.18: saveBillingConfig provisions Stripe Prices via syncAllTierPrices before
// the upsert. Mock it to echo back the config's EXISTING ids (a no-op sync) so
// the persisted metadata is unchanged and NO real Stripe client is constructed.
vi.mock('@/lib/billing/stripe-subscription-prices', () => ({
  syncAllTierPrices: vi.fn(async (cfg: { tiers: Record<string, { stripePriceIdMonth: string | null; stripePriceIdYear: string | null }> }) => ({
    pro: { month: cfg.tiers.pro.stripePriceIdMonth, year: cfg.tiers.pro.stripePriceIdYear },
    business: { month: cfg.tiers.business.stripePriceIdMonth, year: cfg.tiers.business.stripePriceIdYear },
  })),
}))

vi.mock('@/lib/billing/stripe-display-prices', () => ({
  invalidateStripeDisplayPricesCache: vi.fn(),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---- imports under test (after mocks) --------------------------------------
import { saveBillingConfig } from '@/app/admin/integrations/actions'
import { DEFAULT_BILLING_CONFIG } from '@/lib/billing/billing-config'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import { logAdminAction } from '@/lib/admin/audit-log'

const invalidatePlatformConfigMock = vi.mocked(invalidatePlatformConfig)
const logAdminActionMock = vi.mocked(logAdminAction)

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'a@x.com' })
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  fromMock.mockClear()
  invalidatePlatformConfigMock.mockClear()
  logAdminActionMock.mockClear()
  lastUpsertPayload = null
})

describe('saveBillingConfig — authz position (BILLCFG-03)', () => {
  it('rejects a non-admin BEFORE any upsert (requireAdmin first)', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(saveBillingConfig(DEFAULT_BILLING_CONFIG)).rejects.toThrow()
    expect(requireAdminMock).toHaveBeenCalledTimes(1)
    expect(upsertMock).not.toHaveBeenCalled()
    expect(lastUpsertPayload).toBeNull()
  })
})

describe('saveBillingConfig — validation (BILLCFG-02)', () => {
  it('rejects a structurally-invalid input ({}) with ok:false and NO upsert', async () => {
    const res = await saveBillingConfig({})
    expect(res.ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
    expect(lastUpsertPayload).toBeNull()
  })

  it('rejects a negative markup with ok:false and NO upsert', async () => {
    const res = await saveBillingConfig({ ...DEFAULT_BILLING_CONFIG, markup: -1 })
    expect(res.ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('saveBillingConfig — happy path upsert shape (BILLCFG-02)', () => {
  it('upserts metadata-only billing_config, invalidates cache, audits billing_config.save', async () => {
    const res = await saveBillingConfig(DEFAULT_BILLING_CONFIG)
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)

    expect(lastUpsertPayload?.provider).toBe('billing_config')
    expect(lastUpsertPayload?.ciphertext).toBeNull()
    expect(lastUpsertPayload?.iv).toBeNull()
    expect(lastUpsertPayload?.auth_tag).toBeNull()
    expect(lastUpsertPayload?.metadata).toEqual(DEFAULT_BILLING_CONFIG)

    expect(invalidatePlatformConfigMock).toHaveBeenCalledTimes(1)
    expect(logAdminActionMock).toHaveBeenCalledTimes(1)
    expect(logAdminActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing_config.save' })
    )
  })
})

describe('BILLCFG-03 — no tenant-facing route reads/renders billing_config', () => {
  // Walk ONLY the app/ tree, SKIP app/admin/ (and any /tests/ path). For every
  // remaining file assert it matches NEITHER of two specific markers:
  //   (1) an import of the billing-config-form panel
  //   (2) the upsert provider literal provider: 'billing_config'
  // The bare token `billing_config` is intentionally NOT matched (too brittle).
  const APP_ROOT = resolve(process.cwd(), 'app')
  const SKIP_DIRS = ['admin', 'node_modules', '.next', 'tests']

  const PANEL_IMPORT = /from\s+['"][.@/].*billing-config-form['"]/
  const PROVIDER_UPSERT = /provider:\s*['"]billing_config['"]/

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) {
        // Skip app/admin (and the other excluded dirs) at any depth.
        if (SKIP_DIRS.includes(entry)) continue
        out.push(...walk(full))
      } else if (/\.(ts|tsx)$/.test(entry)) {
        out.push(full)
      }
    }
    return out
  }

  it('app/ (excluding app/admin/) never imports the panel form or writes the billing_config row', () => {
    const files = walk(APP_ROOT)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src, `tenant route imports billing-config-form: ${file}`).not.toMatch(
        PANEL_IMPORT
      )
      expect(src, `tenant route writes provider: 'billing_config': ${file}`).not.toMatch(
        PROVIDER_UPSERT
      )
    }
  })
})
