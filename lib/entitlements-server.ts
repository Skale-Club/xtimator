// lib/entitlements-server.ts
// SERVER-ONLY companion to lib/entitlements.ts.
//
// lib/entitlements.ts is client-reachable (its static `tiers`/`getEntitlements`
// are imported by client components such as app/admin/companies/companies-controls.tsx).
// The billing-config-sourced resolver dynamically imports the SERVER-ONLY
// `@/lib/billing/billing-config`; keeping that dynamic import inside
// entitlements.ts pulled `import 'server-only'` into the client graph via
// Turbopack's dynamic-import tracing, breaking the build. Isolating the resolver
// here — a module no client component imports — keeps entitlements.ts pure and
// client-safe while this file stays server-only.
import 'server-only'
import { getEntitlements, type Entitlements, type TierName } from './entitlements'

/**
 * SERVER-SIDE authority (Phase 112 — runtime-editable entitlements). Resolves a
 * tier's entitlements from `billing_config.tiers[tier].entitlements` (the
 * super-admin panel, applied without a deploy) merged OVER the static default so
 * config wins per field and any field the stored row omits falls back to the
 * constant in lib/entitlements.ts. An unrecognized tier resolves to static
 * `free`, matching getEntitlements.
 *
 * getBillingConfig is server-only and pulled in via a DYNAMIC import so the cost
 * of the billing module graph is only paid on the server code paths that call
 * this resolver.
 */
export async function getEntitlementsForTier(tier: string): Promise<Entitlements> {
  const fallback = getEntitlements(tier)
  try {
    const { getBillingConfig } = await import('@/lib/billing/billing-config')
    const cfg = await getBillingConfig()
    const configured = cfg.tiers[tier as TierName]?.entitlements
    if (!configured) return fallback
    // Config wins per field; unset fields fall through to the static default.
    return { ...fallback, ...configured, monthlyCreditGrant: fallback.monthlyCreditGrant }
  } catch {
    // Static build / service client unavailable — degrade to the static default.
    return fallback
  }
}
