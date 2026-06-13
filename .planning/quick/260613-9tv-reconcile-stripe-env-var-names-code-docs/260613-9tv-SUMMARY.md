---
phase: quick-260613-9tv
plan: 01
subsystem: billing / platform-config
tags: [stripe, env-vars, platform-config, coolify, docs]
requires:
  - lib/platform-config.ts getIntegrationKey (existing)
  - app/api/billing/create-checkout-session/route.ts (reads STRIPE_PRICE_PRO/BUSINESS, NEXT_PUBLIC_APP_URL)
  - app/api/webhooks/stripe/route.ts (reads STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET)
provides:
  - getIntegrationKey('stripe') env fallback preferring STRIPE_SECRET_KEY (STRIPE_API_KEY back-compat)
  - .env examples naming the exact vars the code reads
  - go-live runbook + seeds pointing env promotion at Coolify
affects:
  - lib/billing/stripe-client.ts (unchanged caller — benefits from new fallback)
  - lib/billing/connect-oauth.ts (unchanged caller)
tech-stack:
  added: []
  patterns:
    - per-provider candidate-list env fallback in getIntegrationKey
key-files:
  created:
    - .planning/quick/260613-9tv-reconcile-stripe-env-var-names-code-docs/260613-9tv-SUMMARY.md
    - .planning/quick/260613-9tv-reconcile-stripe-env-var-names-code-docs/deferred-items.md
  modified:
    - lib/platform-config.ts
    - tests/unit/platform-config.test.ts
    - .env.production.example
    - .env.local.example
    - docs/STRIPE-CONNECT-OWNER-SETUP.md
    - .planning/seeds/SEED-017-stripe-live-webhook.md
    - .planning/seeds/SEED-021-stripe-connect-live-mode-activation.md
decisions:
  - "Stripe env fallback uses a per-provider candidate list ['STRIPE_SECRET_KEY','STRIPE_API_KEY']; every other provider keeps the single {PROVIDER}_API_KEY candidate so behaviour is byte-for-byte unchanged"
  - "warn message now logs the ACTUAL matched env var name (not hardcoded {PROVIDER}_API_KEY); the 'Falling back to env var ' prefix is preserved so the existing anthropic test still passes"
  - "STRIPE_CONNECT_CLIENT_ID_API_KEY kept as-is in SEED-021 — it resolves via getIntegrationKey('stripe_connect_client_id') whose fallback is {PROVIDER}_API_KEY"
metrics:
  duration: ~9 min
  completed: 2026-06-13
  tasks: 3
  files: 7
---

# Quick 260613-9tv: Reconcile Stripe Env Var Names (Code vs Docs) Summary

Aligned the `getIntegrationKey('stripe')` env fallback to the conventional `STRIPE_SECRET_KEY` name (with `STRIPE_API_KEY` kept for back-compat via a per-provider candidate list), then reconciled both `.env` example files and the Stripe go-live runbook + two seeds so the documented env var names match what the code reads at runtime and env promotion targets Coolify (`/opt/xtimator/.env.production`) instead of the retired Vercel flow.

## What Was Done

### Task 1 — Candidate-list env fallback for getIntegrationKey + tests (TDD)
- **RED:** Added 3 tests to `tests/unit/platform-config.test.ts`:
  - `getIntegrationKey('stripe')` prefers `STRIPE_SECRET_KEY` over `STRIPE_API_KEY` (warn message contains the actual var used).
  - `getIntegrationKey('stripe')` back-compat: falls back to `STRIPE_API_KEY` when `STRIPE_SECRET_KEY` is unset.
  - Regression: a non-stripe provider (`openai`) still resolves `OPENAI_API_KEY` with the same warn behaviour.
  - Extended the suite `afterEach` to delete `STRIPE_SECRET_KEY` / `STRIPE_API_KEY` so cases don't leak.
  - The "prefers STRIPE_SECRET_KEY" test failed as expected (got `sk_api_old`).
- **GREEN:** Replaced the single-name lookup in the `if (!data)` branch of `getIntegrationKey()` with a per-provider candidate list: `stripe → ['STRIPE_SECRET_KEY','STRIPE_API_KEY']`, every other provider → `['{PROVIDER}_API_KEY']`. First non-empty `process.env[name]` wins; the `console.warn` now logs the matched var name while keeping the exact `[platform-config] Falling back to env var ` prefix and trailing ` for provider … Configure via /admin/integrations …` text. Caching/return semantics unchanged. **No other function, the DB path, decrypt, or toBuffer was touched.**
- Result: 11/11 platform-config tests pass. No REFACTOR needed.

### Task 2 — Reconcile .env example files
- `.env.production.example` (uncommented prod style): renamed `STRIPE_PRICE_ID_PRO_MONTHLY` → `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ID_BUSINESS_MONTHLY` → `STRIPE_PRICE_BUSINESS`; added `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_<your-secret>` and `NEXT_PUBLIC_APP_URL=https://xtimator.com` (with brief `#` comments). `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` retained.
- `.env.local.example` (`#`-commented Stripe block): renamed `STRIPE_PRO_PRICE_ID` → `STRIPE_PRICE_PRO`, `STRIPE_BUSINESS_PRICE_ID` → `STRIPE_PRICE_BUSINESS`; added commented `STRIPE_CONNECT_WEBHOOK_SECRET` and `NEXT_PUBLIC_APP_URL=http://localhost:9633` (dev port per `package.json`).
- Placeholders only. Grep audit confirms the four OLD price-var names return nothing in both files.

### Task 3 — Vercel → Coolify in runbook + seeds; correct var names
- `docs/STRIPE-CONNECT-OWNER-SETUP.md`: production live-mode checklist step now sets live values in `/opt/xtimator/.env.production` (or Coolify UI) + redeploy — explicitly "NOT Vercel". No other Vercel env instruction remained.
- `.planning/seeds/SEED-017-stripe-live-webhook.md`: webhook-secret promotion step + "Current State" + Scope now reference the Coolify-managed `/opt/xtimator/.env.production`; placeholders normalized (`whsec_<your-secret>`, `sk_live_<your-key>`).
- `.planning/seeds/SEED-021-stripe-connect-live-mode-activation.md`: "Part C: Env Variable Promotion (Vercel)" → "(Coolify)" with `/opt/xtimator/.env.production` bullets; `STRIPE_CONNECT_CLIENT_ID_API_KEY` deliberately kept (its env fallback is `{PROVIDER}_API_KEY`); Connect webhook secret + breadcrumb reworded. Frontmatter/structure preserved.

## Verification

- `npx vitest run tests/unit/platform-config.test.ts` → **11/11 pass** (8 existing + 3 new).
- `npx vitest run tests/unit/env-example.test.ts` → **3/3 pass**.
- Grep audit: old price-var names gone from both `.env` examples; no Vercel env-promotion instructions remain in runbook or seeds (only an intentional "— NOT Vercel" clarifier).
- gitleaks pre-commit hook passed on all three commits ("no leaks found").

### Full suite (`npx vitest run`)
- Result: **1441 passed, 54 failed, 2 skipped, 33 todo (216 files)**.
- **All 54 failures are pre-existing on `dev` and unrelated to this task.** Proven two ways:
  1. The dominant failure cause is `Error: [vitest] No "requireServiceClient" export is defined on the "@/lib/supabase/service" mock` (plus a fetch-mock `Cannot read 'ok'` in whatsapp/client) — harness/mock drift in files this task never touched.
  2. Reverting `lib/platform-config.ts` to its baseline (pre-change) content and re-running `tests/unit/seo-actions.test.ts` reproduces the identical `requireServiceClient` failure, confirming independence from the one-branch change here.
- Out of scope per task constraints; not fixed. Logged to `deferred-items.md`.

## Deviations from Plan

### Auto-fixed Issues
None — the only code change was the scoped `getIntegrationKey` fallback branch exactly as specified.

### Out-of-scope discoveries (logged, NOT fixed)
**1. [Scope boundary] Pre-existing env-var-sweep failure**
- **Found during:** Task 2 verification.
- **Issue:** `tests/unit/env-var-sweep.test.ts` flags `lib/whatsapp/agent.ts` (`process.env.OPENAI_API_KEY`) and `lib/whatsapp/intent-router.ts` as reading provider API keys directly. Confirmed present at the parent commit; neither file modified by this task.
- **Action:** Documented in `deferred-items.md`; suggested follow-up to route those reads through `getIntegrationKey('openai')` or add them to the test's EXEMPT set.

**2. [Observation] Real-looking Stripe test-mode identifiers in SEED-021**
- `ca_…` Client ID and `we_…` webhook ID literals exist in SEED-021 (pre-existing). Not gitleaks-blocked shapes and not secrets (Client IDs are public per Stripe docs). Outside the changed lines and the plan's "preserve all other content" directive. Noted in `deferred-items.md`.

## Known Stubs
None. No placeholder/empty-data stubs introduced.

## Commits
- `a6766e5` — fix(quick-260613-9tv): prefer STRIPE_SECRET_KEY in getIntegrationKey env fallback (code + test)
- `795c512` — docs(quick-260613-9tv): reconcile Stripe env var names in .env examples
- `e5cac72` — docs(quick-260613-9tv): point Stripe go-live env promotion at Coolify (runbook + seeds + deferred-items)

## Self-Check: PASSED
- All created files exist (SUMMARY.md, deferred-items.md).
- All modified files present on disk (lib/platform-config.ts, both .env examples, runbook).
- All 3 commits found in git history (a6766e5, 795c512, e5cac72).
