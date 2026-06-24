---
phase: 114-estimate-payment-fee-payment-ui-gating-disclosure
plan: 03
subsystem: billing
tags: [stripe-connect, fee-disclosure, billing-config, transparency, disclose]
requires:
  - lib/billing/billing-config.ts (Phase 111 getBillingConfig, estimateFeePct)
  - components/settings/stripe-connect-card.tsx (Phase 70 three-state Connect card)
  - app/(app)/settings/payments/page.tsx (Phase 70 Connect lifecycle page)
  - tests/unit/billing/billing-config.test.ts (114-01 pre-added dormancy allowlist entry for payments/page.tsx)
provides:
  - "StripeConnectCard feePct prop + config-driven fee disclosure in the not_connected branch (DISCLOSE-01)"
  - "payments/page.tsx server-side getBillingConfig().estimateFeePct read, threaded as feePct prop"
  - "tests/unit/settings/payments-disclosure.test.tsx :: config-driven disclosure proof (0.02 → '2%')"
affects:
  - components/settings/stripe-connect-card.tsx
  - app/(app)/settings/payments/page.tsx
  - tests/unit/settings/payments-page.test.tsx (getBillingConfig mock stub — render tests stay green)
tech-stack:
  added: []
  patterns:
    - "Server reads live billing_config %, client component formats it (number in, label out) — never hard-coded"
    - "Disclosure scoped to the connection moment (not_connected branch only), not leaked to connected/not_configured"
    - "Config-driven render proven by mocking getBillingConfig → 0.02 and asserting '2%' (not a hard-coded literal)"
key-files:
  created:
    - tests/unit/settings/payments-disclosure.test.tsx
  modified:
    - components/settings/stripe-connect-card.tsx
    - app/(app)/settings/payments/page.tsx
    - tests/unit/settings/payments-page.test.tsx
decisions:
  - "Disclosed % derived as feePct×100 formatted with no decimals for whole percents, up to 2 for fractional (0.01→'1%', 0.02→'2%', 0.005→'0.5%')."
  - "The 114-02-owned payments-page.test.tsx needed a getBillingConfig mock (not disclosure assertions) once the page became a getBillingConfig consumer — its existing render tests crashed on the real server-only reader (createServiceClient). Disclosure assertions stay solely in the new payments-disclosure.test.tsx."
  - "Disclosure lives ONLY in the not_connected branch — once connected the owner sees the fee in their own Stripe dashboard; not_configured shows the support message instead."
metrics:
  duration: ~8m
  tasks: 3
  files: 4
  completed: 2026-06-24
---

# Phase 114 Plan 03: Fee Disclosure at Connect Summary

The Stripe Connect card now discloses the platform fee at the connection moment, and the disclosed percentage is driven entirely by the live `billing_config.estimateFeePct` read server-side — it can never diverge from the % actually charged (FEE-03) and is never a hard-coded "1%" literal in JSX.

## What Shipped

- **DISCLOSE-01 — config-driven disclosure on the Connect card (`components/settings/stripe-connect-card.tsx`)**: `StripeConnectCard` gains a required `feePct: number` prop. Inside the body it derives `feeLabel = feePct×100` formatted as a percent (`Number.isInteger(feeWhole) ? feeWhole : feeWhole.toFixed(2)` → `0.01 → "1%"`, `0.02 → "2%"`, `0.005 → "0.5%"`). The `not_connected` branch of `<CardContent>` renders a `data-testid="fee-disclosure"` amber-accented notice ("Xtimator charges a {feeLabel} fee on each payment you receive through the platform | this is separate from Stripe's processing fees.") directly below the existing connect copy, via the same `t()` interpolation pattern used elsewhere in the file. The disclosure is scoped to `not_connected` ONLY — `not_configured` and `connected` are untouched. No hard-coded digit "1" in the copy (grep `[^0-9]1%[^0-9]|charges a 1%` → 0).
- **DISCLOSE-01 — server-side live % read (`app/(app)/settings/payments/page.tsx`)**: the async server component imports `getBillingConfig` and reads `const { estimateFeePct } = await getBillingConfig()` before the return, threading `<StripeConnectCard state={state} feePct={estimateFeePct} />`. No hard-coded fee number on the page; no new company column; the three-state `state` derivation (114-02 gating concern) untouched. The Phase-111 dormancy guard stays green via the allowlist entry 114-01 pre-added for this path (NOT re-touched here — verified present at `billing-config.test.ts:220`).
- **DISCLOSE-01 — config-driven proof (`tests/unit/settings/payments-disclosure.test.tsx`, NEW)**: a dedicated test (zero overlap with the 114-01/114-02-owned files) mirrors the `payments-page.test.tsx` mock+render convention and adds a `getBillingConfig` mock. Three cases: `estimateFeePct: 0.02` + NOT_CONNECTED → HTML contains `"2%"`, `"separate from Stripe"`, `data-testid="fee-disclosure"` (proves config-driven, not hard-coded); `0.01` + NOT_CONNECTED → `"1%"` (same path, different config → different render); `0.02` + CONNECTED → disclosure ABSENT (connection-moment only).

## Tasks & Commits

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | feePct prop + fee disclosure in not_connected branch (DISCLOSE-01) | 6911aec9 | components/settings/stripe-connect-card.tsx |
| 2 | read estimateFeePct server-side, pass into the card (DISCLOSE-01) | be338989 | app/(app)/settings/payments/page.tsx |
| 3 | test — disclosure renders the LIVE config %, not hard-coded (DISCLOSE-01) | 2a383efe | tests/unit/settings/payments-disclosure.test.tsx |
| — | deviation fix (Rule 1) — getBillingConfig mock in payments-page.test | 3ebf329f | tests/unit/settings/payments-page.test.tsx |

## Verification

- `npx vitest run tests/unit/settings/payments-disclosure.test.tsx tests/unit/billing/billing-config.test.ts tests/unit/settings/payments-page.test.tsx` → **3 files / 26 passed**.
- The disclosed % equals `estimateFeePct × 100` and is read from `getBillingConfig()` server-side — no hard-coded "1%" in the card copy (grep proof → 0).
- The disclosure renders ONLY in `not_connected` (absent when connected — asserted; not_configured untouched).
- `payments-page.test.tsx` (114-02-owned) carries NO disclosure assertions — only a `getBillingConfig` mock stub so its existing render tests survive the new consumer.
- `tsc --noEmit -p tsconfig.json` → no new errors in `stripe-connect-card.tsx` or `payments/page.tsx`.
- FULL `npx vitest run` → **292 files passed | 1 failed (2080 passed | 2 skipped | 33 todo)** = the known PARALLEL-ONLY `mcp-route-contract.test.ts > GET returns 405` flake (re-confirmed **8/8 in isolation**; touches no Phase-114 file; out-of-scope, logged to deferred-items.md by 114-01).
- No migration, no env var, no secret. The fee computation (114-01) and gating predicate (114-02) are untouched — read-only dependency on `estimateFeePct`.
- All commits normal hooked (gitleaks ran, no `--no-verify`); no leaks (no Stripe secrets; placeholder `ca_test_123` / `acct_abc` ids in tests only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getBillingConfig mock added to the 114-02-owned payments-page.test.tsx**
- **Found during:** plan verification (after Task 3, running the three verification suites together).
- **Issue:** Task 2 made `app/(app)/settings/payments/page.tsx` a new `getBillingConfig` consumer. The pre-existing `payments-page.test.tsx` render tests await `PaymentsSettingsPage`, which now unconditionally calls `getBillingConfig()` → the real server-only reader calls `createServiceClient`, which that test's `@/lib/supabase/service` mock does not export → all three render tests threw "No createServiceClient export is defined on the mock". The plan's `<dependency_note>` anticipated a file-write collision but not that the page's NEW consumer would break the sibling render tests.
- **Fix:** added `vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn().mockResolvedValue({ estimateFeePct: 0.01 }) }))` to `payments-page.test.tsx` — a stub only, NO disclosure assertions (those stay solely in the new `payments-disclosure.test.tsx`, honoring the plan's no-overlap rule). The three render tests pass unchanged.
- **Files modified:** tests/unit/settings/payments-page.test.tsx
- **Commit:** 3ebf329f

## Deferred Issues

- **Full-suite flake (out of scope):** `tests/unit/mcp-route-contract.test.ts > GET returns 405` fails ONLY in the full parallel `npx vitest run` (a 5s timeout; 1 failed / 2080 passed); it passes **8/8 in isolation**. Touches no Phase-114 file. Pre-existing parallel test-isolation flake, already logged to `.planning/phases/114-.../deferred-items.md` by 114-01. Not fixed per the scope boundary.

## Known Stubs

None. The disclosure is fully wired: the page reads the live `estimateFeePct` and the card formats and renders it; the `getBillingConfig` mock in `payments-page.test.tsx` is a test stub (intentional), not a production placeholder.

## Self-Check: PASSED

- Created files exist: tests/unit/settings/payments-disclosure.test.tsx, 114-03-SUMMARY.md
- Commits exist: 6911aec9, be338989, 2a383efe, 3ebf329f
