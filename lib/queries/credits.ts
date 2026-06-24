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
