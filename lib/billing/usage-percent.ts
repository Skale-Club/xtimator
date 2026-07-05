/**
 * Phase 152 Plan 01 (CREDITUI-03 / CREDITUI-04) — shared usage-percentage formula.
 *
 * The SOLE source of truth for converting a raw credit balance + cycle grant
 * into a tenant-facing usage percentage. Both server call sites
 * (app/(app)/settings/billing/page.tsx and app/(app)/layout.tsx) compute
 * `percentUsed` via this helper BEFORE the number ever reaches a client
 * component — the raw balance never flows to UsageProgressBar/CreditBalanceCard/
 * CreditChip (structural CREDITUI-04 enforcement).
 *
 * Pure function, no `import 'server-only'` — matches the lib/billing/calibration.ts
 * precedent of keeping pure math server/client-neutral.
 *
 * Formula: percentUsed = clamp(0, 100, round(100 * (cycleGrant - balance) / cycleGrant)).
 * If cycleGrant <= 0, returns 0 (divide-by-zero guard — render 0% used rather
 * than hiding the bar, per 152-CONTEXT.md).
 */
export function computeUsagePercent({
  balance,
  cycleGrant,
}: {
  balance: number
  cycleGrant: number
}): number {
  if (cycleGrant <= 0) return 0
  const raw = Math.round((100 * (cycleGrant - balance)) / cycleGrant)
  return Math.max(0, Math.min(100, raw))
}
