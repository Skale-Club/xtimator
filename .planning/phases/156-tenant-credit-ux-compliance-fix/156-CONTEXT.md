---
phase: 156
slug: tenant-credit-ux-compliance-fix
milestone: v4.17
requirements: [CREDITFIX-01, CREDITFIX-02, CREDITFIX-03]
autonomous: true
created: 2026-07-06
---

# Phase 156 — Context (locked decisions)

## Goal

Repair a real regression against a locked v4.15 decision (CREDITUI-04: tenants must NEVER see a raw credit count or $ figure anywhere) — the owner found 3 live violations on `/settings/billing`. Also add the real visual progress bar the owner expects in the topbar, and reconcile tier pricing so it can't silently drift from `billing_config`.

**This phase ships first, independent of Phases 157-159.** No new backend/ledger logic — every fix is a display-layer change over already-shipped functions.

## The 3 confirmed violations (fix exactly these, verified via live Explore research)

### Violation 1 — `TopUpPackCard` shows raw credits

**File:** `components/billing/topup-pack-card.tsx`, line 51 (confirmed via research)
```tsx
<p className="text-sm text-muted-foreground">
  <T text={`≈ ${credits.toLocaleString()} credits`} />
</p>
```
**Fix:** Delete this line entirely. The card already shows the dollar price ($20/$50/$100) and the "Top up $X" button — that's sufficient; the credit-count subtext is the violation. Do not replace it with any other numeric representation of credits.

### Violation 2 — `AutoTopupDialog` pack-picker shows raw credits

**File:** `components/billing/auto-topup-dialog.tsx`, line 111 (confirmed via research)
```tsx
{packs.map((pack, i) => (
  <SelectItem key={i} value={String(i)}>
    ${pack.priceCents / 100} (≈{pack.credits.toLocaleString()} credits)
  </SelectItem>
))}
```
**Fix:** Change the `SelectItem` label to show ONLY the dollar amount: `${pack.priceCents / 100}`. Remove the `(≈X credits)` parenthetical entirely.

### Violation 3 — `CreditHistoryList` shows raw credit deltas

**File:** `components/billing/credit-history-list.tsx`, lines 61-86 (confirmed via research)
```tsx
<span className={`font-mono font-medium tabular-nums ${positive ? 'text-emerald-600 ...' : 'text-muted-foreground'}`}>
  {positive ? '+' : ''}
  {row.delta_credits.toLocaleString()}
</span>
```
**Fix (locked decision):** This is the "Recent activity" feed — it must become **qualitative, not quantitative**. Replace the numeric `delta_credits` display with a small colored indicator only (e.g. a `TrendingUp`/`ArrowUpRight` icon in emerald for positive rows — grants/top-ups — and a `TrendingDown`/`ArrowDownRight` icon in muted-foreground for negative rows — debits). Keep the row label (`rowLabel(row)` — "Monthly grant", "Top-up", "Estimate", "Photos", etc.) and the timestamp. **Do not render `delta_credits` (or any derived number) in any form** — no digits, no "+", no percentage. The feature's remaining value is showing WHEN and WHAT KIND of activity happened, not HOW MUCH.

This is an intentional narrowing of the component's information density, not a bug in your fix — it's the direct consequence of the locked "never show a raw credit count" rule applied consistently.

## Topbar progress bar (CREDITFIX-02)

**File:** `components/app-shell/credit-chip.tsx`, lines 17-31 (confirmed via research)

Current: text-only, no visual bar —
```tsx
<Coins className="h-4 w-4 shrink-0" />
<span className="font-mono font-medium tabular-nums">{percentUsed}%</span>
<span className="hidden text-xs lg:inline">{t('used')}</span>
```

**Fix:** Add a real visual progress-bar element using the existing `components/ui/progress.tsx` primitive (the same one `components/billing/usage-progress-bar.tsx` already wraps) sized to fit the compact topbar chip (`h-9` container — the bar should be a slim inline element, e.g. `h-1.5 w-10 sm:w-14`, NOT a full-width bar). Reuse the exact same color-escalation thresholds already established in `usage-progress-bar.tsx` (0-69% green/healthy, 70-89% amber/warning, 90-100% red/critical) — do not invent new thresholds or duplicate the color logic; extract it to a shared helper if `usage-progress-bar.tsx` doesn't already export one, or import/reuse its existing constants directly. Keep the `{percentUsed}%` text alongside the bar (both, not either/or) — the fix is "text-only" → "bar + text", per the owner's literal ask ("no header, precisa ter um progress bar também").

The `Coins` icon may stay or be dropped at the executor's discretion — the bar is the required addition, the icon is not in scope either way.

## Tier pricing/feature reconciliation (CREDITFIX-03)

**File:** `components/billing/tier-cards-grid.tsx`, lines 15-62 (confirmed via research)

**What research found:** The hardcoded `TIERS` array's MONTHLY prices ($0/$29/$99) currently happen to match `billing_config`'s actual `subscriptionPriceCents` values (0, 2900, 9900) — there is no live numeric mismatch today. The real problem is structural: these are hardcoded STRINGS that could silently drift from `billing_config` the next time an admin edits pricing in the super-admin billing panel, since nothing connects them. Annual prices are ALREADY sourced dynamically from `billing_config` elsewhere in the same component (lines 91-104) — monthly prices are not, which is the inconsistency to fix.

**Fix (locked decision):**
1. **Prices**: make the MONTHLY price display for each tier read from `billing_config.tiers[tier].subscriptionPriceCents` (formatted the same way the annual price already is), removing the hardcoded `price: '$0'/'$29'/'$99'` strings from the `TIERS` array. This closes the drift risk permanently — the same class of fix already applied to annual prices, now applied consistently to monthly.
2. **Feature bullet lists** (`'3 estimates per month'`, `'Custom branding'`, `'WhatsApp delivery'`, `'Stripe Connect payments'`, etc.): `billing_config` has NO equivalent field for these — they are marketing copy, not billing data, so they stay as static strings (do NOT invent a new `features` config field — that would be new backend/ledger-adjacent scope, out of bounds for this phase). Instead, **verify each bullet's accuracy** against the actual current tier-gating code in the app (grep for tier checks gating the named features — e.g. does `tier !== 'free'` actually gate "Custom branding"? Does WhatsApp delivery still require Pro+, or is it now available more broadly after subsequent milestones?). Fix any bullet found to be factually wrong; leave accurate ones untouched. Document what was checked and what (if anything) was corrected in the plan's SUMMARY.md — this is a verification pass, not a copywriting exercise.

## What must NOT change in this phase

- No new `credit_ledger` rows, no new `billing_config` fields, no new DB columns/migrations.
- `getCreditOverview`, `getBillingConfig`, `computeUsagePercent`, `recordCreditDebit`, `grantCredits` — all untouched (already correct, already reused).
- `CreditBalanceCard` and `UsageProgressBar` (the tenant-facing summary card) — already compliant per research (only render `percentUsed`), leave as-is; do not refactor unless directly needed to share the color-escalation logic with the new `CreditChip` bar.
- The admin-only `CompanyCostCard` / `getCompanyCostOverview` (Phase 152) — admin-only surface, explicitly allowed to show real numbers, out of scope for this phase (Phase 158 touches the admin Billing page, not this one).
- Auto-top-up threshold/pack-selection LOGIC (`triggerAutoTopupIfNeeded`, `acquireAutoTopupLock`, `chargeAutoTopup`) — only the dialog's display copy changes (Violation 2), not the underlying selection/charge behavior.

## Test-file blast radius (must ship in the same change)

Grep for any existing test asserting the CURRENT (violating) behavior and update it to assert the FIXED behavior instead — do not leave a test locked to the bug. Specifically check:
- Any unit test on `topup-pack-card.tsx`, `auto-topup-dialog.tsx`, `credit-history-list.tsx`, or `credit-chip.tsx` for literal `credits`/`Credits`/numeric-delta assertions.
- The existing v4.15 "no raw credit number reaches a tenant surface" static-contract test (per v4.15 history, CREDITUI-04 had an enforced test) — find it and EXTEND its coverage to include these 3 newly-fixed files, so a future regression here is caught automatically. This is the most important test addition in this phase — it directly prevents this exact bug from recurring a third time.

## Claude's Discretion

- Exact icon choice for the up/down activity indicator (TrendingUp/TrendingDown vs ArrowUpRight/ArrowDownRight vs a colored dot) — pick whatever's already idiomatic in `components/billing/` or `lucide-react` usage elsewhere in the app.
- Exact bar width/sizing in the topbar chip — must fit the existing `h-9` compact container without breaking the topbar's layout on mobile (check `components/app-shell/topbar.tsx` responsive behavior).
- Whether to extract the color-escalation thresholds into a small shared helper (e.g. `lib/billing/usage-color.ts`) used by both `UsageProgressBar` and the new `CreditChip` bar, vs. duplicating the 3-tier if/else inline — prefer extraction if it's a clean 10-line function, don't over-engineer if it adds friction.
