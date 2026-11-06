import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { isDemoCompany } from '@/lib/demo/config'
import type { BillingBlockCode } from '@/lib/billing/block-codes'

/**
 * SEED-055 Phase D: the single server-side answer to "what may this company do?".
 *
 *   active          enforcement OFF (no DB read at all), BYOK, the demo company, or balance > 0
 *   paywalled       balance <= 0 and the owner has no live paid subscription
 *                   (free tier, canceled/unpaid, no subscription id) - the app is
 *                   read-only until they subscribe
 *   out_of_credits  balance <= 0 on a live Pro/Business subscription - no new
 *                   estimates or AI, editing existing estimates stays allowed
 *
 * The balance that gates is the SPENDABLE balance (SEED-055 D4): a live
 * subscriber spends `credit_balance` (every lot); a company that is not a live
 * subscriber can only spend signup + admin `adjust` lots (minus credit_debt) -
 * purchased top-up lots, and a lapsed monthly lot, do not count.
 *
 * With `billing_config.enforcementEnabled === false` every path resolves to
 * `active` and nothing is written (the self-heal below is also gated on it).
 */
export type AccessState = 'active' | 'paywalled' | 'out_of_credits'

export type AccessStateResult = {
  state: AccessState
  tier: string | null
  balance: number
  enforcement: boolean
}

export type { BillingBlockCode }
export type GateResult = { ok: true } | { ok: false; code: BillingBlockCode }

type CompanyRow = {
  tier: string | null
  credit_balance: number | null
  byok_enabled: boolean | null
  stripe_subscription_id: string | null
  stripe_subscription_status: string | null
  credit_debt?: number | null
}

const COMPANY_COLUMNS =
  'tier, credit_balance, credit_debt, byok_enabled, stripe_subscription_id, stripe_subscription_status'

/** Lot sources a non-subscriber may still spend. */
const NON_SUBSCRIBER_SOURCES = ['signup', 'adjust'] as const

/** Subscription statuses that keep a paid tier "live" (past_due = Stripe dunning). */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

async function readCompany(db: SupabaseClient, companyId: string): Promise<CompanyRow | null> {
  const { data } = await db.from('companies').select(COMPANY_COLUMNS).eq('id', companyId).maybeSingle()
  return (data as CompanyRow | null) ?? null
}

/** Which wall an empty balance hits for this company. */
function emptyBalanceState(row: CompanyRow): BillingBlockCode {
  const paidTier = row.tier === 'pro' || row.tier === 'business'
  const hasSub = Boolean(row.stripe_subscription_id)
  const status = row.stripe_subscription_status
  const liveStatus = status == null || LIVE_STATUSES.has(status)
  return paidTier && hasSub && liveStatus ? 'out_of_credits' : 'paywalled'
}

/**
 * Spendable balance of a company that is NOT a live subscriber:
 * SUM(remaining of live signup/adjust lots) - credit_debt. Falls back to the
 * cached `credit_balance` if the lots cannot be read (never lock out on a read
 * hiccup).
 */
async function spendableNonSubscriberBalance(
  db: SupabaseClient,
  companyId: string,
  row: CompanyRow
): Promise<number> {
  const { data, error } = await db
    .from('credit_lots')
    .select('remaining, expires_at')
    .eq('company_id', companyId)
    .in('source', [...NON_SUBSCRIBER_SOURCES])
  if (error || !data) return row.credit_balance ?? 0
  const now = Date.now()
  const live = (data as Array<{ remaining?: number | null; expires_at?: string | null }>).reduce(
    (acc, l) => {
      const expired = l.expires_at != null && new Date(l.expires_at).getTime() <= now
      return expired ? acc : acc + (l.remaining ?? 0)
    },
    0
  )
  return live - (row.credit_debt ?? 0)
}

type Resolved = AccessStateResult & { exempt: boolean; blocked: BillingBlockCode }

async function resolve(companyId: string, client?: SupabaseClient): Promise<Resolved> {
  const cfg = await getBillingConfig()
  const enforcement = cfg.enforcementEnabled === true
  if (!enforcement) {
    // Inert while enforcement is OFF: no DB read, no self-heal write. tier and
    // balance are only populated when enforcement is ON.
    return { state: 'active', tier: null, balance: 0, enforcement, exempt: true, blocked: 'paywalled' }
  }
  const db = client ?? requireServiceClient()

  let row = await readCompany(db, companyId)
  if (!row) {
    // Unknown company: never lock out on a missing row.
    return { state: 'active', tier: null, balance: 0, enforcement, exempt: true, blocked: 'paywalled' }
  }

  const exempt = Boolean(row.byok_enabled) || isDemoCompany(companyId)

  // Self-heal a lost signup grant: a free company with an empty balance and NO
  // ledger rows at all never received it. grantSignupCredits is idempotent on
  // `signup:{companyId}`, so racing callers cannot double-grant.
  if (!exempt && row.tier === 'free' && (row.credit_balance ?? 0) <= 0) {
    const { count } = await db
      .from('credit_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
    if (count === 0) {
      // Lazy: credit-ledger drags in the notification pipeline, which every
      // action/service importing this module would otherwise load.
      const { grantSignupCredits } = await import('@/lib/billing/credit-ledger')
      await grantSignupCredits(companyId)
      row = (await readCompany(db, companyId)) ?? row
    }
  }

  const blocked = emptyBalanceState(row)
  const balance =
    exempt || blocked === 'out_of_credits'
      ? (row.credit_balance ?? 0)
      : await spendableNonSubscriberBalance(db, companyId, row)
  const state: AccessState = exempt || balance > 0 ? 'active' : blocked
  return { state, tier: row.tier, balance, enforcement, exempt, blocked }
}

export async function getAccessState(
  companyId: string,
  client?: SupabaseClient
): Promise<AccessStateResult> {
  const { state, tier, balance, enforcement } = await resolve(companyId, client)
  return { state, tier, balance, enforcement }
}

/**
 * Gate for CREATING anything (estimate, project, client, AI op). Refused when
 * the company is paywalled / out of credits, or when its positive balance is
 * still below the op's estimated cost.
 */
export async function assertCanCreate(
  companyId: string,
  estimatedCredits: number,
  client?: SupabaseClient
): Promise<GateResult> {
  const r = await resolve(companyId, client)
  if (r.state !== 'active') return { ok: false, code: r.state }
  if (!r.exempt && r.balance < estimatedCredits) return { ok: false, code: r.blocked }
  return { ok: true }
}

/**
 * Gate for EDITING existing data. Only the paywall (read-only app) refuses an
 * edit; an out-of-credits Pro company may still fix a price before sending.
 */
export async function assertCanEdit(
  companyId: string,
  client?: SupabaseClient
): Promise<GateResult> {
  const r = await resolve(companyId, client)
  if (r.state === 'paywalled') return { ok: false, code: 'paywalled' }
  return { ok: true }
}
