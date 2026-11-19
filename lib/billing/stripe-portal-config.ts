import type Stripe from 'stripe'

/**
 * Xtimator shares its Stripe account with other Skale Club businesses, so the
 * account's DEFAULT Customer Portal configuration belongs to someone else (it
 * returns to skale.club and has no plan switching). Xtimator's own portal
 * configuration is tagged with this metadata pair and looked up at runtime, so
 * no id has to be stored anywhere: creating (or replacing) the tagged
 * configuration in Stripe is enough.
 */
export const XTIMATOR_PORTAL_METADATA_KEY = 'app'
export const XTIMATOR_PORTAL_METADATA_VALUE = 'xtimator'

const FOUND_TTL_MS = 5 * 60 * 1000
// A miss is cached briefly so a freshly created configuration is picked up fast.
const MISS_TTL_MS = 60 * 1000

let cache: { id: string | null; expiresAt: number } | null = null

/** Test-only: forget the cached lookup. */
export function resetPortalConfigurationCache(): void {
  cache = null
}

/**
 * The id of the active portal configuration tagged `app=xtimator`, or
 * undefined when none exists or the lookup fails. Callers pass it as
 * `configuration` only when defined, so a failure falls back to Stripe's
 * account default instead of breaking "Manage subscription".
 */
export async function resolvePortalConfigurationId(
  stripe: Stripe,
): Promise<string | undefined> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.id ?? undefined

  try {
    const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 })
    const match = list.data.find(
      (c) => c.active && c.metadata?.[XTIMATOR_PORTAL_METADATA_KEY] === XTIMATOR_PORTAL_METADATA_VALUE,
    )
    const id = match?.id ?? null
    if (!id) {
      console.warn('[stripe-portal-config] no active portal configuration tagged app=xtimator; using the account default')
    }
    cache = { id, expiresAt: now + (id ? FOUND_TTL_MS : MISS_TTL_MS) }
    return id ?? undefined
  } catch (err) {
    console.warn(
      '[stripe-portal-config] portal configuration lookup failed; using the account default:',
      err instanceof Error ? err.message : err,
    )
    cache = { id: null, expiresAt: now + MISS_TTL_MS }
    return undefined
  }
}

/** Spread into `billingPortal.sessions.create` params. */
export async function portalConfigurationParam(
  stripe: Stripe,
): Promise<{ configuration?: string }> {
  const id = await resolvePortalConfigurationId(stripe)
  return id ? { configuration: id } : {}
}
