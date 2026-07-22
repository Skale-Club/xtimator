---
phase: 175-telegram-platform-events-toggles
verified: 2026-07-21T22:20:00Z
status: passed
score: 4/4 success-criteria verified (10/10 catalog kinds routed; PLAT-01/02/03 all satisfied)
human_verification:
  - test: "Apply migration supabase/migrations/20260721000002_phase175_platform_notification_preferences.sql to prod (manual-apply convention — deploy ships code only)"
    expected: "platform_notification_preferences table exists with 10 seeded rows; admin toggle saves persist instead of erroring. Until applied, the gate is fail-open (all events deliver, saves error) — no crash, but PLAT-02 persistence is inert."
    why_human: "Project convention: migrations are never run by CI/deploy; must be applied by hand against prod (Supabase server f2b95485). Verify actual schema after apply."
  - test: "Visit /admin/integrations → Platform Alerts tab as super-admin"
    expected: "Per-Event Telegram Toggles matrix renders all 10 kinds grouped into Tenant Activity / Job Failures / Critical-Reliability; pipeline_stuck and cron_failed show a lock icon with a disabled always-on switch; toggling a non-locked event off shows a toast and survives refresh (once migration applied)"
    why_human: "Visual rendering + real-time toggle/persist round-trip cannot be verified programmatically"
---

# Phase 175: Telegram Platform-Event Catalog & Per-Event Toggles — Verification Report

**Phase Goal:** Every platform event reaches Xtimator admins on Telegram, with a per-event admin toggle and unskippable critical alerts — extending the already-shipped `notifyOps()`/`lib/telegram/client.ts` pipeline (never routing Telegram through `notify()`).
**Verified:** 2026-07-21T22:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Automated Gate Results

| Check | Command | Result |
| ----- | ------- | ------ |
| Targeted test suites | `vitest run tests/unit/{notifications,observability,webhooks,billing}/ company-action + quota + generate-estimate-job` | **747 passed / 93 files, exit 0** |
| CI typecheck | `tsc --noEmit -p tsconfig.ci.json` | **clean, exit 0** |

The 747-test green run across the notifications/observability/webhooks/billing suites plus the company-action, quota, and generate-estimate-job files IS the behavioral spot-check for this phase (Step 7b) — every catalog kind, the fail-open gate, the locked bypass, both Stripe arms, and the quota revival are exercised by unit tests. No runnable standalone entry point exists to curl.

## Goal Achievement — Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
| - | --------------------------------- | ------ | -------- |
| 1 | Typed catalog distinct from tenant `EventType`; every cataloged event routes through `notifyOps()` | ✓ VERIFIED | `lib/notifications/platform-events.ts` — sibling 10-kind union, no `EventType` import. All 10 kinds traced to live call sites (table below). |
| 2 | Super-admin can toggle each event's Telegram delivery; persisted in `platform_notification_preferences` | ✓ VERIFIED (code); migration pending manual prod apply | Loader + save action + UI form + category flag all wired end-to-end. |
| 3 | `locked` critical events always deliver regardless of toggle | ✓ VERIFIED | `isLockedPlatformEvent` short-circuits BEFORE DB read (platform-preferences.ts:53); UI disables switch; server rejects locked-disable (platform-event-actions.ts:30-32). |
| 4 | Turning an event off stops Telegram while Sentry records unconditionally | ✓ VERIFIED | ops-alert.ts: Sentry (step 2, lines 67-76) is outside the toggle gate; Telegram (step 3, lines 82-89) is gated. Test ops-alert.test.ts:226-232 asserts toggle=false → Sentry called once, Telegram NOT called. |

**Score: 4/4 success criteria verified** (deployment-only caveat on #2, see Gaps Summary).

### PLAT-01 — All 10 catalog kinds traced to a REAL production call site

| Kind | Production call site | Verified |
| ---- | -------------------- | -------- |
| tenant_signup | `lib/actions/company.ts:321` (mode:'first' brand-new-company branch) | ✓ |
| tenant_payment_received | `lib/billing/connect-webhook.ts:168` (checkout.session.completed) + `:328` (invoice.paid) — Connect arms | ✓ |
| subscription_payment_received | `app/api/webhooks/stripe/route.ts:227` (checkout mode:subscription) + `:264` (invoice.paid) — platform arms | ✓ BOTH arms |
| tenant_quota_exhausted | `lib/quota.ts:285` inside `notifyQuotaThresholds` 100% branch (`prevPct<100 && newPct>=100`) | ✓ |
| estimate_generation_failed | `lib/inngest/functions/generate-estimate.ts:100` | ✓ |
| transcription_failed | `lib/inngest/functions/transcribe-audio.ts:133` | ✓ |
| vision_failed | `lib/inngest/functions/analyze-photos.ts:109` | ✓ |
| ai_fallback | `lib/ai/with-fallback.ts:145` | ✓ |
| pipeline_stuck (locked) | `lib/inngest/functions/pipeline-watchdog.ts:133` | ✓ |
| cron_failed (locked) | `app/api/cron/cleanup-whatsapp-sessions/route.ts:28,68` + `cleanup-orphan-projects/route.ts:22,35` | ✓ |

**notifyQuotaThresholds Phase-77 dead-caller fix — CONFIRMED LIVE:** `generate-estimate.ts:218-252` is a best-effort `void (async()=>{...})()` IIFE wrapped in try/catch that computes tier→limit→monthly count and calls `notifyQuotaThresholds({...})`. It reuses the in-scope `ownerUserId` (assigned line 119). It is deliberately NOT a `step.run` (fire-and-forget posture) so a failure never blocks/retries generation.

**v4.19-hardened step structure UNTOUCHED:** the `record-usage` step.run (lines 204-207, idempotency via requestId + usage_events UNIQUE index) is unchanged; the revival call is inserted strictly BETWEEN it and the unchanged `record-credit-debit` step.run (line 263). Idempotency keys, step.run boundaries, and costContext threading are intact.

### Required Artifacts

| Artifact | Expected | Status |
| -------- | -------- | ------ |
| `lib/notifications/platform-events.ts` | 10-kind union + catalog + isLockedPlatformEvent; locked set exactly {pipeline_stuck,cron_failed} | ✓ VERIFIED |
| `lib/observability/platform-preferences.ts` | fail-open isTelegramAlertEnabled + 30s TTL cache + invalidate | ✓ VERIFIED |
| `lib/observability/ops-alert.ts` | notifyOps gates Telegram per-kind; Sentry unconditional; never-throw | ✓ VERIFIED |
| `supabase/migrations/20260721000002_...sql` | table + service-role-only RLS + 10 seeded rows | ✓ VERIFIED (not yet applied to prod — by convention) |
| `lib/admin/platform-event-preferences.ts` | loadPlatformEventToggles (catalog ⋈ DB, locked forced enabled) | ✓ VERIFIED |
| `app/admin/integrations/platform-event-actions.ts` | savePlatformEventToggle, requireAdmin-first, server locked-guard | ✓ VERIFIED |
| `app/admin/integrations/platform-event-toggles-form.tsx` | category-grouped matrix, locked disabled+lock icon | ✓ VERIFIED |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| ops-alert.ts | platform-preferences.ts | `isTelegramAlertEnabled(alert.kind)` gating Telegram inside swallow-all try | ✓ WIRED (line 83) |
| platform-preferences.ts | platform-events.ts | `isLockedPlatformEvent()` BEFORE any DB read | ✓ WIRED (line 53) |
| generate-estimate.ts | quota.ts | `notifyQuotaThresholds(...)` after record-usage, try/caught IIFE | ✓ WIRED (line 242) |
| stripe/route.ts | ops-alert.ts | `notifyOps({kind:'subscription_payment_received', dedupeKey:...})` both arms | ✓ WIRED (lines 227,264) |
| platform-event-toggles-form.tsx | platform-event-actions.ts | `savePlatformEventToggle` from onCheckedChange | ✓ WIRED |
| platform-event-actions.ts | platform-preferences.ts | `invalidatePlatformPreferencesCache()` after upsert | ✓ WIRED (line 46) |
| integration-category-content.tsx | platform-event-preferences.ts | `loadPlatformEventToggles()` → form initial prop | ✓ WIRED (lines 98-100, 181-183) |

### PLAT-02 admin save-action posture

`savePlatformEventToggle` (platform-event-actions.ts): `requireAdmin()` FIRST (line 25) → validate kind → server-side locked-disable rejection (30-32) → upsert → `invalidatePlatformPreferencesCache()` (46) → `revalidatePath` (47) → `logAdminAction('platform_event.toggle')` (49). `'platform_event.toggle'` added to `AuditAction` union (audit-log.ts:39). Cache invalidated on save so the next `notifyOps()` honors the change immediately, not after the 30s TTL.

### Never-throw / fail-open / Sentry-unconditional guarantees

- **notifyOps never-throw preserved:** outer belt-and-suspenders try/catch (ops-alert.ts:47/90-92); Telegram block independently swallowed (87-89); Redis dedupe fails open (48-63).
- **Sentry unconditional:** step 2 (67-76) sits outside the toggle gate — captureMessage always fires.
- **Fail-open tested:** platform-preferences.test.ts asserts `isTelegramAlertEnabled` → true on no service client (line 111), rejecting `.select()` (122), and missing row (103); locked bypass returns true even when DB row is false (lines 84-90 exercise the honor path, locked-bypass covered separately); cache-invalidation observes two distinct responses across an invalidate.

### Test-Safety (no real Redis/Telegram/Supabase round-trip on local `npm test`)

`vi.mock('@/lib/observability/ops-alert')` confirmed present in all four required files: `tests/unit/webhooks/connect-events.test.ts:49`, `tests/unit/billing/stripe-webhook.test.ts:51`, `tests/unit/notifications/event-sources.test.ts:26`, `tests/unit/company-action.test.ts:22`. Assertions on the new kinds are real (not just mocks): event-sources.test.ts:285/359 (tenant_payment_received, both Connect arms), :414 (tenant_quota_exhausted); stripe-webhook.test.ts:147-148/248-249 (subscription_payment_received with exact dedupeKeys, both arms); company-action.test.ts:166 (tenant_signup).

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| — | No stubs, placeholders, TODO/FIXME, or hollow returns in any phase-175 artifact | ℹ️ Info | None. `return []` in loadPlatformEventToggles is the fail-open no-flag path, immediately followed by real catalog mapping; not a stub. |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| PLAT-01 | 175-01, 175-02 | ✓ SATISFIED | Typed catalog + all 10 kinds routed through notifyOps from live sites; quota dead-caller revived |
| PLAT-02 | 175-03 | ✓ SATISFIED (code); prod migration pending | DB-persisted toggle matrix + admin UI + save/loader wired |
| PLAT-03 | 175-01, 175-03 | ✓ SATISFIED | Locked check before DB read; UI disabled + server rejection |

No orphaned requirements — REQUIREMENTS.md maps only PLAT-01/02/03 to Phase 175, all claimed by plans.

### Git

All 6 task commits present and code committed: `e8466812`, `34fe5ba3` (175-01); `22deae44`, `f0fc6b2f` (175-02); `5fdbd7d3`, `84b8b75c` (175-03). Working tree clean (only untracked `.planning/phases/173-*/`). Note (from 175-03 SUMMARY, already flagged): metadata commit `66612305` swept in 3 sibling-176 plan files with no content change — cosmetic attribution only, no lost/altered content.

### Gaps Summary

No code gaps. The phase goal is fully delivered in the codebase and all automated gates are green (747 tests, tsc clean). One operational prerequisite — not a defect — gates PLAT-02 persistence going live in prod: migration `20260721000002` must be applied by hand (project convention: deploy ships code only, never runs migrations). Until then the system is fail-open (all events deliver, admin panel renders defaulting every non-locked kind to enabled, saves error only because the table is absent). This is documented in all three plan SUMMARYs and surfaced here under `human_verification` alongside the optional visual admin-panel spot-check.

Notable over-delivery vs the ROADMAP text: SC#1 says "3 net-new signup/payment/quota sites" but the implementation ships **4** distinct kinds — `tenant_payment_received` (Connect, customer→tenant) and `subscription_payment_received` (platform, tenant→Xtimator) are deliberately split rather than conflated, which strengthens rather than violates the requirement.

---

_Verified: 2026-07-21T22:20:00Z_
_Verifier: Claude (gsd-verifier)_
