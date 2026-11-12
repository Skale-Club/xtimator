import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'

/**
 * Phase 115 — Credit Balance UX DATA layer (CREDITUI-01).
 *
 * Owner-facing read helper: the cached credit balance + a recent consumption
 * history projection + the configured low-balance thresholds. Mirrors the
 * `getBillingData` pattern (lib/queries/billing.ts): `import 'server-only'`,
 * `requireServiceClient()` (credit_ledger is service-role-only), null-safe.
 *
 * OWNER-SAFE PROJECTION (the cardinal rule): the history SELECT lists ONLY
 *   operation_type, delta_credits, reason, created_at
 * and NEVER `real_cost_usd` / `markup` / `balance_after` / `idempotency_key` /
 * `ref_id` / `id` / `company_id`. WHY this matters as defense-in-depth: if a
 * future dev passes these rows straight to a client component, the cost/markup
 * columns simply aren't present — they were never selected. Owner UX shows
 * credits consumed, never the underlying token/USD cost math.
 *
 * Company-scoped (takes companyId, NOT userId) so Plan 02's settings page AND
 * an optional header balance chip can both call it.
 */

export interface CreditHistoryRow {
  operation_type: string | null
  delta_credits: number
  reason: string
  created_at: string
}

export interface CreditOverview {
  balance: number
  history: CreditHistoryRow[]
  lowBalanceThresholds: number[]
}

/** Owner-safe history columns. EXACTLY these four — see the cardinal rule above. */
const OWNER_SAFE_LEDGER_COLUMNS = 'operation_type, delta_credits, reason, created_at'

/**
 * The topbar chip / usage bar denominator: what the company was GRANTED in its
 * live credit lots. Sums `granted` over every lot that has not expired
 * (`expires_at` NULL or in the future), whatever its source: signup, monthly,
 * topup or adjust. A mid-cycle top-up raises the denominator, and expired lots
 * drop out on their own at the cycle boundary.
 *
 * Signup and adjust lots used to be excluded, so a company living on those
 * (no monthly/topup lot yet) got 0 here and lost its bar; now every company
 * with credits has a valid denominator. 0 only when there is no live lot.
 *
 * Expiry is filtered in JS (a company has a handful of lots) to keep the query
 * a plain eq() with no or() filter.
 *
 * Service client (mirrors getCreditOverview). Never throws - returns 0 on any
 * failure so a transient read error degrades to "no bar".
 */
export async function getLiveGrantedCredits(companyId: string): Promise<number> {
  try {
    const svc = requireServiceClient()
    const { data, error } = await svc
      .from('credit_lots')
      .select('granted, expires_at')
      .eq('company_id', companyId)

    if (error || !data) return 0

    const now = Date.now()
    return (data as { granted: number | null; expires_at: string | null }[]).reduce(
      (sum, row) =>
        row.expires_at === null || new Date(row.expires_at).getTime() > now
          ? sum + (row.granted ?? 0)
          : sum,
      0
    )
  } catch {
    return 0
  }
}

export type LiveCreditLotSource = 'monthly' | 'topup' | 'signup' | 'adjust'

/** One live lot as the owner sees it: how much is left and when it lapses. */
export interface LiveCreditLot {
  source: LiveCreditLotSource
  remaining: number
  /** ISO timestamp, or null when the lot never expires (signup / adjust). */
  expiresAt: string | null
}

const LOT_SOURCE_ORDER: Record<LiveCreditLotSource, number> = {
  monthly: 0,
  topup: 1,
  signup: 2,
  adjust: 3,
}

/**
 * SEED-055 Phase E - the company's credits split by live lot, for the
 * /settings/billing balance card. Live = `remaining > 0` and not past
 * `expires_at`. Owner-safe projection (source, remaining, expires_at only).
 * Ordered monthly -> purchased (soonest expiry first) -> free -> adjustments.
 * Never throws - an unreadable table degrades to an empty list (the card then
 * shows the plain balance).
 */
export async function getLiveCreditLots(companyId: string): Promise<LiveCreditLot[]> {
  try {
    const svc = requireServiceClient()
    const { data, error } = await svc
      .from('credit_lots')
      .select('source, remaining, expires_at')
      .eq('company_id', companyId)
      .gt('remaining', 0)
    if (error || !data) return []

    const now = Date.now()
    return (data as { source: LiveCreditLotSource; remaining: number; expires_at: string | null }[])
      .filter((l) => l.source in LOT_SOURCE_ORDER)
      .filter((l) => l.expires_at == null || new Date(l.expires_at).getTime() > now)
      .map((l) => ({ source: l.source, remaining: l.remaining, expiresAt: l.expires_at }))
      .sort((a, b) => {
        const bySource = LOT_SOURCE_ORDER[a.source] - LOT_SOURCE_ORDER[b.source]
        if (bySource !== 0) return bySource
        return (
          (a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity) -
          (b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity)
        )
      })
  } catch {
    return []
  }
}

export async function getCreditOverview(companyId: string): Promise<CreditOverview> {
  const svc = requireServiceClient()

  const [companyRes, ledgerRes, cfg] = await Promise.all([
    svc.from('companies').select('credit_balance').eq('id', companyId).single(),
    svc
      .from('credit_ledger')
      .select(OWNER_SAFE_LEDGER_COLUMNS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50),
    getBillingConfig(),
  ])

  const co = (companyRes.data as { credit_balance?: number } | null) ?? null
  const rows = (ledgerRes.data as CreditHistoryRow[] | null) ?? []

  return {
    balance: co?.credit_balance ?? 0,
    history: rows,
    lowBalanceThresholds: cfg.lowBalanceThresholds,
  }
}
