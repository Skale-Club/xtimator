---
phase: 115-credit-balance-ux-owner-facing
plan: 02
subsystem: billing
tags: [credits, billing, owner-ux, settings, topbar]
requires:
  - "lib/queries/credits.ts getCreditOverview (Plan 115-01) — balance + owner-safe history + lowBalanceThresholds"
  - "components/ui/card glass Card set + components/i18n/t <T> + lib/i18n/use-translation useTranslation"
  - "app/api/billing/create-topup-session (Phase 113) — top-up button POST target"
provides:
  - "components/billing/credit-balance-card.tsx CreditBalanceCard (balance + static guidance + low/zero warning + CTA)"
  - "components/billing/credit-history-list.tsx CreditHistoryList (owner-safe ledger rows)"
  - "components/billing/top-up-button.tsx TopUpButton (client POST to create-topup-session)"
  - "components/app-shell/credit-chip.tsx CreditChip (compact topbar balance chip)"
  - "/settings/billing Credits card + history mounted below the count-based Usage card (MIG-01 additive)"
affects:
  - "app/(app)/settings/billing/page.tsx, app/(app)/layout.tsx, components/app-shell/topbar.tsx"
tech-stack:
  added: []
  patterns:
    - "presentational server-renderable cards consume the Plan-01 owner-safe projection — cost/markup never present on the row type (defense-in-depth)"
    - "topbar chip fed by the layout's EXISTING companies billingRow select (credit_balance added) — no second query"
    - "client top-up button mirrors upgrade-buttons.tsx fetch→window.location.href pattern, packIndex-only body"
key-files:
  created:
    - "components/billing/credit-balance-card.tsx"
    - "components/billing/credit-history-list.tsx"
    - "components/billing/top-up-button.tsx"
    - "components/app-shell/credit-chip.tsx"
    - "tests/unit/billing/credit-balance-card.test.tsx"
  modified:
    - "app/(app)/settings/billing/page.tsx"
    - "app/(app)/layout.tsx"
    - "components/app-shell/topbar.tsx"
decisions:
  - "Per-action guidance is a STATIC '10–15 credits' string locked to SEED-035 — NOT computed from config (fake precision before Phase-116 calibration)"
  - "isLow = balance <= Math.max(...lowBalanceThresholds) (empty array → false) drives the informational warning; copy never says blocked/denied/cannot (enforcement OFF)"
  - "Credits card is ADDITIVE — the count-based 'Usage This Month' card is untouched (MIG-01 parallel run)"
  - "Chip balance comes from the layout's billingRow companies select (credit_balance), NOT getActiveCompany() (AppCompany lacks the column)"
metrics:
  duration: "~6m"
  completed: "2026-06-24"
  tasks: 4
  commits: 3
  files_created: 5
  files_modified: 3
---

# Phase 115 Plan 02: Credit Balance UX — Owner-Facing UI Summary

Owner-facing credit balance UX consuming Plan-01's `getCreditOverview`: a glass Credits card (balance headline + static "an estimate ≈ 10–15 credits" guidance + low/zero informational warning + top-up/upgrade CTA), an owner-safe consumption-history list, a packIndex-only top-up button, and a compact topbar credit chip — all mounted on `/settings/billing` BELOW the still-present count-based "Usage This Month" card (MIG-01 additive). No token/cost math anywhere; enforcement is OFF so copy is a heads-up nudge, never "blocked".

## What Was Built

- **`components/billing/credit-balance-card.tsx` (new)** — server-renderable, props `{ balance, lowBalanceThresholds }`. Mirrors the Usage card's glass `<Card variant="glass">` markup: `<CreditCard>` header + `<T>Credits</T>` title, the balance headline (`balance.toLocaleString()` in `font-mono text-2xl` next to `<T>credits</T>`), a STATIC guidance line (`<T>Roughly speaking, an estimate uses about 10–15 credits.</T>` — SEED-035 phrasing, not computed). `const isLow = lowBalanceThresholds.length > 0 && balance <= Math.max(...lowBalanceThresholds)` (empty-array guard → false). When `isLow`, an amber `data-testid="credit-low-warning"` region (mirroring trial-banner's `AlertTriangle` + amber classes) renders INFORMATIONAL copy + `<TopUpButton packIndex={0}>` wrapped in a `<Link href="/settings/billing?topup=1">` + an `<T>Upgrade plan</T>` `<Link href="/settings/billing">`. NO `$`, NO "markup"/"token" in the rendered output; NO "blocked"/"denied"/"cannot".
- **`components/billing/credit-history-list.tsx` (new)** — server-renderable, props `{ rows: CreditHistoryRow[] }` (type imported from `@/lib/queries/credits`). Glass card titled `<T>Recent activity</T>`; each row → a human label (`reason` grant/topup/adjust first, else `operation_type` estimate/photo_batch/audio_minutes/price_research → `<T>` labels, fallback `<T>Usage</T>`), a SIGNED delta (`+`/`` prefix, green when positive / muted when negative, `font-mono tabular-nums`), and `new Date(created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })`. Empty → `<T>No credit activity yet.</T>`. `real_cost_usd`/`markup` are not even on the row type (Plan-01 owner-safe projection) — defense in depth.
- **`components/billing/top-up-button.tsx` (new, 'use client')** — props `{ packIndex }`. Mirrors `upgrade-buttons.tsx`: `useState` loading, POSTs `/api/billing/create-topup-session` with `{ packIndex }`, `if (res.ok && data.url) window.location.href = data.url`, toast on failure, disabled while pending. The client sends ONLY packIndex — credits/price are resolved server-side (Phase-113 Pitfall 4).
- **`components/app-shell/credit-chip.tsx` (new, 'use client')** — props `{ balance }`. Compact `<Link href="/settings/billing">` with `<Coins>` + `balance.toLocaleString()` + `credits` label (lg+), h-9 rounded-md muted styling matching the topbar action buttons. No cost math.
- **`app/(app)/settings/billing/page.tsx` (modified)** — after `getBillingData(...)`, `const company = await getActiveCompany()` (guard `if (!company) redirect('/onboarding')`) → `const credits = await getCreditOverview(company.id)`. A new two-column grid (`<CreditBalanceCard ... /> <CreditHistoryList ... />`) inserted BELOW the count-based usage grid and ABOVE `TierCardsGrid`. The existing "Usage This Month" card is byte-unchanged (MIG-01 additive).
- **`app/(app)/layout.tsx` (modified)** — the EXISTING `billingRow` companies select widened from `'tier, tier_trial_ends_at'` to `'tier, tier_trial_ends_at, credit_balance'` (NO new query) and `creditBalance={billingRow.data?.credit_balance ?? 0}` threaded into `<Topbar />`.
- **`components/app-shell/topbar.tsx` (modified)** — `creditBalance?: number` added to `TopbarProps`; `{typeof creditBalance === 'number' && <CreditChip balance={creditBalance} />}` rendered in the right-actions row before `<NotificationBell />`.
- **`tests/unit/billing/credit-balance-card.test.tsx` (new, Wave-0 RED→GREEN)** — 5 presentational assertions: balance shown; static 10/15 guidance with no `$`/markup/token; low (40 ≤ max 200) warning + `/settings/billing?topup=1` + `/settings/billing` CTA with no blocked/denied/cannot; healthy (5000) hides the warning; zero shows warning + top-up CTA. `<T>` and `TopUpButton` mocked to passthroughs so copy assertions run on plain rendered text.

## Cardinal Rules Honored

- **No cost math in the owner UX** — grep of `$`/`real_cost_usd`/`markup`/`token` against the rendered output is clean; the only source matches are doc-comments documenting the rule and a template-literal `${` in a className. Test 2 asserts `container.innerHTML` contains no `$`/markup/token.
- **Informational copy** — the low/zero warning is a heads-up nudge + top-up/upgrade CTA; no "blocked"/"denied"/"cannot" in rendered copy (Test 3). Enforcement is OFF this milestone.
- **Additive (MIG-01)** — the count-based "Usage This Month" card remains in the billing page untouched; the credits card is a new block below it.
- **No second companies query for the chip** — the layout's single existing `from('companies')` select gained `credit_balance`; no new query added (Pitfall 4).
- **i18n** — every owner-facing string wrapped in `<T>` (server) or `t()` (client chip/button).
- **No migration, no secret, no env var.** `credit_balance` is a pre-existing companies column (Phase 112).

## Deviations from Plan

None — plan executed exactly as written. (Pre-existing tsc errors in unrelated test files — es2018 regex-flag + mock-typing issues in `tests/unit/ai/refine-shared-prompt.test.ts`, `tests/unit/estimate/observability.test.ts`, `step-runner.test.ts`, `generate-estimate-job.test.ts` — are out-of-scope: not caused by this plan's changes and not in any file touched here.)

## Checkpoint

- **Task 4 (checkpoint:human-verify)** — AUTO-APPROVED. Auto-mode is active (`workflow.auto_advance = true`) and project memory standing instruction treats all human-verify checkpoints as auto-approved; proceeded without pausing. The credit balance UX (card + history + chip) is built and unit-verified; live visual UAT (npm run dev, /settings/billing) remains an optional non-blocking human check.

## Verification

- `npx vitest run tests/unit/billing/credit-balance-card.test.tsx` → 5/5 GREEN.
- FULL `npx vitest run` → **296 files passed | 3 skipped, 2095 passed | 2 skipped | 33 todo** (baseline 115-01: 295/2090; +1 file / +5 = the new card test). No regressions; the known parallel-only `mcp-route-contract.test.ts` flake did not surface.
- `npx tsc --noEmit -p tsconfig.json` → no errors in any of the 8 touched/created source files (4 components + page + layout + topbar + chip).
- grep proofs: rendered credit components free of `$`/`real_cost_usd`/`markup`/`token` (matches are doc-comments + a className template literal only); no `blocked`/`denied`/`cannot` in rendered warning copy; layout has exactly one `from('companies')` with `credit_balance` added; the "Usage This Month" card remains in the billing page.
- All commits normal hooked (gitleaks ran, no `--no-verify`, no leaks).

## Commits

- 4b369efe — test(115-02): RED for CreditBalanceCard balance + guidance + low/zero CTA
- f725935a — feat(115-02): CreditBalanceCard + CreditHistoryList + TopUpButton
- 84c74ac3 — feat(115-02): mount credits card on /settings/billing + topbar chip

## Self-Check: PASSED

- FOUND: components/billing/credit-balance-card.tsx
- FOUND: components/billing/credit-history-list.tsx
- FOUND: components/billing/top-up-button.tsx
- FOUND: components/app-shell/credit-chip.tsx
- FOUND: tests/unit/billing/credit-balance-card.test.tsx
- FOUND commits: 4b369efe, f725935a, 84c74ac3
