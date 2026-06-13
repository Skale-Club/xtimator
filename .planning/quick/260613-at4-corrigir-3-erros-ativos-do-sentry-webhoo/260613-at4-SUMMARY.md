---
phase: quick-260613-at4
plan: 01
subsystem: observability/billing
tags: [sentry, stripe, webhook, error-handling]
requirements: [XTIMATOR-1, XTIMATOR-2, XTIMATOR-3]
dependency_graph:
  requires:
    - lib/billing/stripe-client.ts getStripeClient()
    - "@sentry/nextjs Sentry.init"
  provides:
    - Stripe webhook that returns 503 (not unhandled 500) when STRIPE_SECRET_KEY is absent
    - Server-side Sentry beforeSend that drops not-found-page framework noise
  affects:
    - app/api/webhooks/stripe/route.ts
    - sentry.server.config.ts
key_files:
  created: []
  modified:
    - app/api/webhooks/stripe/route.ts
    - sentry.server.config.ts
decisions:
  - "Return 503 (not 200) on missing Stripe key so Stripe retries later once STRIPE_SECRET_KEY is configured, rather than silently acknowledging an unprocessed event"
  - "Transaction-scoped Sentry filter (event.transaction === 'POST /_not-found/page'), not error-message-scoped, so genuine Server Action errors on real routes still reach Sentry"
metrics:
  duration: ~4 min
  completed: 2026-06-13
  tasks: 2
  files: 2
  commits: 2
---

# Phase quick-260613-at4 Plan 01: Corrigir 3 erros ativos do Sentry (webhook + not-found noise) Summary

Resolved the 3 active Sentry issues in xtimator (org skale-club) with two surgical server-side changes, each an atomic commit referencing the Sentry issue IDs so Sentry's GitHub integration can auto-resolve them: the Stripe webhook now degrades to a logged 503 when the Stripe key is unconfigured (stopping the Stripe-retry Sentry flood), and the server Sentry config drops `POST /_not-found/page` framework noise from bot/scanner RSC probes.

## What Was Built

### Task 1 — Stripe webhook graceful degradation (XTIMATOR-1)
`app/api/webhooks/stripe/route.ts`: wrapped the bare `const stripe = await getStripeClient()` call in a `try/catch` in the same position (after the rawBody/sig and platform/connect secret reads, before the signature-verification loop). On throw — which happens when `STRIPE_SECRET_KEY` is absent (`getStripeClient()` at `lib/billing/stripe-client.ts:13`) — the catch logs via `console.error` and returns `new Response('Stripe not configured', { status: 503 })`. This converts the previous unhandled 500 (which made real Stripe webhook IPs retry and flood Sentry, handled:no) into a graceful 503. `stripe` is typed `let stripe: Stripe` reusing the existing type-only import (line 2); no new import added. Because the catch path `return`s, `stripe` is definitely assigned on the fall-through, so the downstream `stripe.webhooks.constructEvent(...)` loop has no definite-assignment error. The entire rest of the handler (existing 400 missing-secret path, idempotency insert, dispatch, all event-type cases) is byte-for-byte unchanged. `lib/billing/stripe-client.ts` was NOT touched — other callers rely on `getStripeClient()` throwing.

### Task 2 — Filter not-found-page framework noise (XTIMATOR-2, XTIMATOR-3)
`sentry.server.config.ts`: added a `beforeSend(event)` to the existing `Sentry.init({...})`. It returns `null` (drops the event) when `event.transaction === 'POST /_not-found/page'`, otherwise returns `event`. This silences the `TypeError: Failed to parse body as FormData` and `Failed to find Server Action` framework errors that Next.js throws when bots/scanners POST garbage to non-existent Server Action / RSC endpoints. All pre-existing init options (`dsn`, `environment`, `sendDefaultPii`, `tracesSampleRate`, `includeLocalVariables`, `enableLogs`) are unchanged. The filter is transaction-scoped (not error-message-scoped), so genuine Server Action / FormData errors on real routes still reach Sentry. No other Sentry config file was touched.

## Verification

Per the plan's gate (full `next build` is slow and carries pre-existing unrelated failures, so `npx tsc --noEmit` is the typecheck gate).

**Commands run and results:**

1. **`npx eslint app/api/webhooks/stripe/route.ts`** (after Task 1) → exit 0, clean. Same file pre-change baseline was also exit 0.
2. **`npx eslint sentry.server.config.ts`** (after Task 2) → exit 0, clean. Pre-change baseline was also exit 0.
   - Note: the `lint` npm script is plain `eslint` (ESLint 9 flat config under Next 16.2.6). The `next lint --file` / `eslint --file` flags are not supported by this toolchain, so lint was scoped by passing the file paths directly to `eslint` — equivalent to `npm run lint` restricted to the changed files.
3. **`npx tsc --noEmit`** → exit 2 both before and after each change, with the **exact same 5 pre-existing errors** every run. **Zero NEW errors introduced.**

**Pre-existing tsc errors (baseline — unchanged by this work, NOT in the two touched files):**
- `app/admin/integrations/actions.ts(272,40)` — Stripe API version literal `"2026-04-22.dahlia"` vs `"2026-05-27.dahlia"`
- `lib/billing/stripe-client.ts(15,28)` — same Stripe API version literal mismatch
- `tests/unit/notifications/account-emails.test.ts(84,46)` — `Branding` missing metaDescription/ogImageUrl/canonicalBaseUrl/faviconUrl
- `tests/unit/notifications/account-emails.test.ts(172,46)` — same Branding mismatch
- `tests/unit/notifications/account-emails.test.ts(219,46)` — same Branding mismatch

These were present before any edit and are out of scope (Stripe SDK version bump + a test fixture drift). Logged here for the verifier; not fixed (scope boundary — not caused by this task's changes).

## Deviations from Plan

None — plan executed exactly as written. Both before/after diffs from the task actions were applied verbatim; both files now match the plan's `<interfaces>` and `<verification>` expectations.

## Commits

- `f6d4132` — fix(quick-260613-at4): degrade Stripe webhook to 503 when key unconfigured (Fixes XTIMATOR-1) — `app/api/webhooks/stripe/route.ts`, +11/-1
- `5e53d4f` — fix(quick-260613-at4): filter not-found-page framework noise from Sentry (Fixes XTIMATOR-2 XTIMATOR-3) — `sentry.server.config.ts`, +10/-0

Both passed the gitleaks pre-commit hook (no leaks; only env-var NAMES referenced, no secret values introduced).

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: app/api/webhooks/stripe/route.ts (modified, try/catch + 503 present)
- FOUND: sentry.server.config.ts (modified, beforeSend + 'POST /_not-found/page' present)
- FOUND: commit f6d4132 (Fixes XTIMATOR-1)
- FOUND: commit 5e53d4f (Fixes XTIMATOR-2 XTIMATOR-3)
- CONFIRMED: lib/billing/stripe-client.ts untouched (appears in baseline tsc errors unchanged; not in modified file list)
- CONFIRMED: exactly two files changed, two atomic commits
