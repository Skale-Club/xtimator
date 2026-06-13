# Quick Task 260613-aoe — Summary

**Date:** 2026-06-13
**Goal:** Repair the vitest unit-suite failures caused by test-harness mock drift; get
`npx vitest run` green or document the rest in `.planning/known-issues.md`.

## Outcome

`npx vitest run`: **54 failed → 10 failed**, **1441 → 1501 passing**, **0 regressions**.
The 10 remaining failures (8 files) are NOT mock drift — they are tests correctly catching
intentional product changes or a genuine product gap. All 10 are documented in
[known-issues.md](../../known-issues.md) (section "Unit Test Suite — residual after mock-drift fix").

## What was fixed (test-infra only — no product code changed)

Commits (atomic, on `dev`): `debb379`, `d1c8668`, `42aa7f5`, `450efc2`.

**Bucket A — `requireServiceClient` mock gap (7 files, 27 tests).** Product calls
`requireServiceClient()`; mocks only exported `createServiceClient`. Fix: alias both exports to one
spy in each `vi.mock`/`vi.doMock` so existing `.mockReturnValue(client)` flows through unchanged.
Files: admin-actions, admin-dashboard, admin-gate, blog-actions, seo-actions, queries/auth,
cleanup-route-auth. Two files also needed read-before-write chain support (`.select().eq().maybeSingle()`)
and blog-actions needed `audit-log` mocked so its audit insert didn't pollute the insert spy.

**Bucket B — `unstable_cache` mock gap (3 files).** `lib/queries/auth.ts` wraps `getCachedCompany`
in `unstable_cache` at import; the `next/cache` mocks omitted it (broke suite collection). Added a
passthrough, plus `getActiveCompanyId` mocks (actions resolve the active company via `cookies()`).
Files: custom-domain-action, price-book/import-action, price-book/bulk-adjust-action.

**Bucket C — refactored-dependency / chain-shape drift (4 files).**
- whatsapp/client: mock `getWhatsAppPlatformConfig` (client reads encrypted config, not env; the
  supabase lookup was consuming the one-shot `fetch` mock).
- tour-telemetry: mock `getActiveCompanyId` + `assertWritable` (new auth-context flow).
- queries/dashboard: add `.is()` to the count/projects chains (product added archived_at/deleted_at
  soft-delete filters).
- theme-action: mock `getActiveCompanyId`; update assertion to `.eq('id', companyId)` (theme is now
  per active-company, not user_id).

**Stale assertions for intentional changes (3 files).**
- generate-estimate: error copy now "…transcript, photo, or prompt…" (prompt input added).
- onboarding-schema: `STEP_FIELDS[1]` includes `subdomain` (multi-tenant onboarding field).
- missing-key-ux: send route requires `workflow_status='consolidated'` (SEED-028) before the Resend-key
  check; fixture sets it so the test reaches the 503 branch.

## What was documented (left red on purpose) — see known-issues.md

- **TEST-ENV-01 (FAIL, genuine product gap):** `lib/whatsapp/agent.ts:111` and
  `lib/whatsapp/intent-router.ts:171,234` read `process.env.OPENAI_API_KEY` directly (ADMIN-06
  violation). Needs a product fix (route through `getIntegrationKey()`).
- **TEST-AI-01/02 (FLAGGED):** provider-factory + translate-route assert the pre-OpenRouter AI layer
  (Anthropic/Gemini). `lib/ai` is OpenRouter-only now — need rewrites.
- **TEST-WIZ-01, TEST-BRAND-01, TEST-LAND-01, TEST-PB-01, TEST-ICONS-01 (FLAGGED):** schema/design/copy/
  structure contract changes (clientId optional + step 2; auth dark redesign vs BRAND-03; AuthDialog
  `?auth=login` auto-open; dialog `|` vs `—`; root `proxy.ts` removed). Each needs a product-owner
  decision or a small rewrite.

## Notes / deviations

- The task framed all ~54 failures as `requireServiceClient` mock drift; in reality ~44 were
  test-infra (fixed) and ~10 are product-contract drift (documented). No product code was modified.
- No shared mock helper was extracted: `vi.mock`/`vi.doMock` factories are hoisted and cannot reference
  external (non-`mock*`) symbols, and client shapes vary per file — per-file inline fixes are lower-risk.
