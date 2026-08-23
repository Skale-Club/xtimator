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
 * Phase (CREDITFIX) — actual cycle-grant lookup, replacing the old assumption
 * that every cycle starts at exactly the configured `monthlyCreditGrant`. Sums
 * `credit_ledger.delta_credits` for rows credited this UTC calendar month with
 * reason 'grant' (the monthly/signup grant) or 'topup' (a purchased pack) —
 * the two reasons that actually ADD to a company's allowance for the cycle.
 * Debits ('debit'/'adjust' etc.) are excluded so a mid-cycle top-up correctly
 * raises the denominator instead of being invisible.
 *
 * Service client (credit_ledger has deny-all RLS, mirrors getCreditOverview
 * above). Never throws — returns 0 on any failure so a transient read error
 * degrades to "nothing granted this cycle" (caller then hides the usage bar
 * entirely rather than showing a wrong percentage).
 */
export async function getCycleGrantedCredits(companyId: string): Promise<number> {
  try {
    const svc = requireServiceClient()
    const now = new Date()
    const startOfMonthIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString()

    const { data, error } = await svc
      .from('credit_ledger')
      .select('delta_credits')
      .eq('company_id', companyId)
      .in('reason', ['grant', 'topup'])
      .gte('created_at', startOfMonthIso)

    if (error || !data) return 0

    return (data as { delta_credits: number }[]).reduce(
      (sum, row) => sum + (row.delta_credits ?? 0),
      0
    )
  } catch {
    return 0
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
