/**
 * Phase 104 (NOTIF-06) — Pure notification-category migration.
 *
 * `migrateCategories` is the unit-tested PURE source of truth that the SQL data
 * migration (`supabase/migrations/20260621000001_notification_categories_remap.sql`)
 * MIRRORS exactly. No DB access, no `server-only` — safe to import anywhere.
 *
 * Behavior (matches the SQL `jsonb_build_object` + `jsonb_strip_nulls` rewrite):
 *  - OR-merge `payment | trial | quota | admin` (and any already-present `billing`)
 *    into a single `billing` object, per boolean channel. Idempotent: re-running on
 *    already-migrated input treats the existing `billing` as a merge source.
 *  - Drop `whatsapp` and `ai_job` keys entirely (no category for them anymore).
 *  - Carry `estimate` and `system` through unchanged.
 *  - Do NOT synthesize `whatsapp`/`sms` channels — leave them absent so the resolver
 *    re-defaults them to false (never auto-enable a paid channel — Pitfall 5).
 *  - Omit any key whose merged object is empty (mirrors `jsonb_strip_nulls`).
 */

export type Chan = {
  in_app?: boolean
  email?: boolean
  whatsapp?: boolean
  sms?: boolean
}

// Old categories that collapse into the single `billing` category.
const BILLING_SOURCES = ['payment', 'trial', 'quota', 'admin', 'billing'] as const

// Channels OR-merged when collapsing billing sources. Paid channels
// (whatsapp/sms) are intentionally NOT merged — they re-default to false.
const MERGE_CHANNELS = ['in_app', 'email'] as const

export function migrateCategories(
  old: Record<string, Chan>,
): Record<string, Chan> {
  const out: Record<string, Chan> = {}

  // OR-merge all billing-source categories into one `billing` object.
  const billing: Chan = {}
  for (const ch of MERGE_CHANNELS) {
    let merged: boolean | undefined
    for (const src of BILLING_SOURCES) {
      const v = old[src]?.[ch]
      if (v === true) {
        merged = true
        break
      }
      if (v === false && merged === undefined) merged = false
    }
    if (merged !== undefined) billing[ch] = merged
  }
  if (Object.keys(billing).length > 0) out.billing = billing

  // Carry estimate + system through unchanged (if present).
  for (const key of ['estimate', 'system'] as const) {
    const cat = old[key]
    if (cat && Object.keys(cat).length > 0) {
      out[key] = { ...cat }
    }
  }

  // whatsapp + ai_job are dropped (never copied). Any other unknown keys are
  // also dropped — the reduced model only knows estimate/billing/system.
  return out
}
