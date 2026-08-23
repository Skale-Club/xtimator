import 'server-only'
import { cookies } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'
import {
  REFERRAL_COOKIE,
  isWithinAttributionWindow,
  parseReferralCookie,
} from '@/lib/affiliates/attribution'
import { commissionWindowEnd } from '@/lib/affiliates/commission'

/**
 * SEED-054 — turn a referral cookie into an `affiliate_referrals` row.
 *
 * Called from the FIRST-company signup path only (lib/actions/company.ts). The
 * "first company only" rule mirrors the signup credit grant's anti-farming
 * rationale: a user who already has a tenant and adds a second company must not
 * mint a fresh commission stream for whoever's link they happened to click.
 *
 * NEVER THROWS. Attribution is a growth-accounting side effect; a failure here
 * must not break a signup that has already created the company and the
 * membership row. Same discipline as grantCredits (lib/billing/credit-ledger.ts):
 * swallow, log, move on.
 */
export async function attributeReferralFromCookie(
  companyId: string
): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    // Program off → do not even read the cookie. Turning the program on later
    // does not retroactively attribute past signups, which is the correct
    // behaviour: nobody was promised a commission on them.
    if (!cfg.affiliate.enabled) return

    const cookieStore = await cookies()
    const parsed = parseReferralCookie(cookieStore.get(REFERRAL_COOKIE)?.value)
    if (!parsed) return

    // The COOKIE's TTL is a fixed generous constant at the edge; the CONFIGURED
    // window is the authority, enforced here. See attribution.ts for why.
    const now = new Date()
    if (!isWithinAttributionWindow(parsed.issuedAt, cfg.affiliate.attributionWindowDays, now)) {
      return
    }

    const svc = requireServiceClient()

    // Only an ACTIVE affiliate earns. A 'pending' (unapproved) or 'suspended'
    // affiliate's link still works as a URL — it just does not attribute, which
    // is deliberate: approval is what makes a code payable.
    const { data: affiliate, error: lookupError } = await svc
      .from('affiliates')
      .select('id, user_id')
      .eq('code', parsed.code)
      .eq('status', 'active')
      .maybeSingle()

    if (lookupError) {
      throw new Error(`affiliate lookup failed: ${lookupError.message}`)
    }
    if (!affiliate) return

    const affiliateId = (affiliate as { id: string; user_id: string | null }).id
    const affiliateUserId = (affiliate as { id: string; user_id: string | null }).user_id

    // Fix 2 — self-referral guard. Without this, an affiliate can register a
    // second company, sign up through their OWN referral link, and earn
    // commission on their own subscription forever. Compare the affiliate's
    // owning user against the NEW company's owner (companies.user_id) — a
    // fresh signup always sets that column to the just-created owner (see
    // lib/actions/company.ts), so this read is always fresh at attribution
    // time. Skip attribution rather than throw: the signup itself must
    // still succeed.
    if (affiliateUserId) {
      const { data: company, error: companyLookupError } = await svc
        .from('companies')
        .select('user_id')
        .eq('id', companyId)
        .maybeSingle()

      if (companyLookupError) {
        throw new Error(`company owner lookup failed: ${companyLookupError.message}`)
      }

      const companyOwnerId = (company as { user_id: string | null } | null)?.user_id
      if (companyOwnerId && companyOwnerId === affiliateUserId) {
        console.warn(
          `[attributeReferralFromCookie] skipped self-referral: affiliate ${affiliateId} (user ${affiliateUserId}) referred their own company ${companyId}`,
        )
        return
      }
    }

    // Insert-and-swallow-23505 rather than check-then-insert: UNIQUE(company_id)
    // is the real authority, and a concurrent double-submit of the onboarding
    // form would race a pre-check. 23505 here means the company is already
    // attributed — first attribution wins, permanently.
    const { error: insertError } = await svc.from('affiliate_referrals').insert({
      affiliate_id: affiliateId,
      company_id: companyId,
      attributed_at: now.toISOString(),
      // Frozen at attribution time — a later change to the configured duration
      // must not restate an existing referral's earning window.
      commission_window_ends_at: (
        commissionWindowEnd(now, cfg.affiliate.commissionDurationMonths) ??
        // durationMonths = 0 means "lifetime". The column is NOT NULL (a null
        // there would be ambiguous with "unset"), so encode lifetime as a date
        // far enough out that it is unreachable in practice.
        new Date('2999-12-31T00:00:00.000Z')
      ).toISOString(),
      status: 'active',
    })

    if (insertError && insertError.code !== '23505') {
      throw new Error(`referral insert failed: ${insertError.message}`)
    }
  } catch (err) {
    console.warn('[attributeReferralFromCookie] swallowed failure:', err)
  }
}
