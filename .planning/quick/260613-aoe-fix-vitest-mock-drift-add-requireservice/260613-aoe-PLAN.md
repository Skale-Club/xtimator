# Quick Task 260613-aoe: Fix vitest mock drift

**Created:** 2026-06-13
**Mode:** quick (test-infra only)

## Goal

`npx vitest run` green, or remaining failures documented in `.planning/known-issues.md`
with rationale. Test-infra only — no product code changes unless a genuine product bug
is found (in which case: document, do not "fix product to satisfy tests").

## Baseline

`npx vitest run` → **54 failed / 1441 passed** across **25 failed files** (captured pre-fix).

## Triage (root cause per failing file)

### Bucket A — `requireServiceClient` mock gap (TEST-INFRA → FIX)
Mock returns only `createServiceClient`; product calls `requireServiceClient()`.
Fix: alias both to one factory so existing `.mockReturnValue(client)` flows through.
- `tests/unit/admin-actions.test.ts` (6)
- `tests/unit/admin-dashboard.test.ts` (4)
- `tests/unit/admin-gate.test.ts` (4)
- `tests/unit/blog-actions.test.ts` (7)
- `tests/unit/seo-actions.test.ts` (4) — `app/admin/seo/actions.ts:49`
- `tests/unit/queries/auth.test.ts` (2) — two `vi.doMock` blocks; `lib/queries/auth.ts:27`
- `tests/unit/cleanup-route-auth.test.ts` (1) — route uses `requireServiceClient` → 500

### Bucket B — `unstable_cache` mock gap (TEST-INFRA → FIX)
Mock `next/cache` omits `unstable_cache`; `lib/queries/auth.ts` calls it at import.
Fix: add `unstable_cache: (fn) => fn` passthrough.
- `tests/unit/custom-domain-action.test.ts` (3)
- `tests/unit/price-book/import-action.test.ts` (suite collect fail)
- `tests/unit/price-book/bulk-adjust-action.test.ts` (suite collect fail)

### Bucket C — refactored-dependency / chain-shape mock drift (TEST-INFRA → FIX)
- `tests/unit/whatsapp/client.test.ts` (1) — client now reads `getWhatsAppPlatformConfig()`;
  the supabase config lookup consumes the one-shot `fetch` mock → mock platform-config instead.
- `tests/unit/tour/tour-telemetry.test.ts` (2) — `logTourEvent` now routes through
  `getActiveCompanyId()` + `assertWritable()`; mock those.
- `tests/unit/queries/dashboard.test.ts` (4) — product added `.is('archived_at',null).is('deleted_at',null)`;
  mock chain lacks `.is()`.
- `tests/integration/theme-action.test.ts` (3) — `saveThemePreference` now scopes via
  `getActiveCompanyId()` and updates `.eq('id', companyId)` (was `user_id`); mock + assertion update.

### Bucket D — product-contract drift / obsolete (TRIAGE → fix-if-clearly-intentional, else DOCUMENT)
- `tests/unit/ai/provider-factory.test.ts` (3) — product is **OpenRouter-only** now
  (`lib/ai/index.ts`: "Anthropic/Gemini SDKs are no longer used"). Test asserts deleted
  provider-selection → obsolete; rewrite to test OpenRouter resolution or document.
- `tests/unit/services/generate-estimate.test.ts` (1) — error copy gained ", or prompt".
- `tests/unit/onboarding-schema.test.ts` (1) — STEP_FIELDS[1] gained `subdomain`.
- `tests/unit/wizard-client-only.test.ts` (2) — `clientId` now optional + step 2 exists (POSSIBLE REGRESSION).
- `tests/unit/globals-brand-tokens.test.ts` (1) — auth layout redesigned (dark).
- `tests/unit/price-book/bulk-adjust-dialog.test.tsx` (1) — title separator "—" → "|".
- `tests/unit/components/landing-page.test.tsx` (1) — AuthDialog "welcome back" heading not found.
- `tests/unit/app-icons.test.ts` (suite) — reads `proxy.ts` (ENOENT; file moved/removed).
- `tests/integration/missing-key-ux.test.ts` (1) — /send returns 409 not 503.
- `tests/unit/translate-route.test.ts` (1) — returns 503 not 200 (provider config?).

### Bucket E — genuine product finding (DOCUMENT, do not change product here)
- `tests/unit/env-var-sweep.test.ts` (1) — `lib/whatsapp/agent.ts` + `lib/whatsapp/intent-router.ts`
  read provider API keys directly from `process.env` (incomplete platform-config migration; ADMIN-06).

## Tasks

1. Fix Bucket A (requireServiceClient) — 7 files. Verify subset. Commit.
2. Fix Bucket B (unstable_cache) — 3 files. Commit.
3. Fix Bucket C (refactored-dep mocks) — 4 files. Commit.
4. Re-run full suite. Triage Bucket D item-by-item: fix clearly-intentional stale tests
   (update test only), document possible-regressions + obsolete-needs-decision in
   `.planning/known-issues.md`. Document Bucket E. Commit.
5. Final `npx vitest run`. Write SUMMARY.md, update STATE.md. Commit.

## Notes
- No shared mock helper extracted: `vi.mock`/`vi.doMock` factories are hoisted and cannot
  reference external (non-`mock*`) symbols; client shapes vary per file. Per-file inline fix
  is lower-risk. Aliasing `createServiceClient === requireServiceClient` keeps existing
  test bodies unchanged.
