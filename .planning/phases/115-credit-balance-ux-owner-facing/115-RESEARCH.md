# Phase 115: Credit Balance UX (owner-facing) - Research

**Researched:** 2026-06-24
**Domain:** Next.js 16 App Router server-component UI over an existing Supabase credit ledger; i18n copy; reuse of the existing notification + Stripe top-up rails
**Confidence:** HIGH (this is an internal-integration phase — every fact below is read directly from the repo, not training data)

## Summary

Phase 115 is a **display + CTA** phase, not a data-model phase. Every backend primitive already exists and is verified in the tree: the append-only `credit_ledger` table (RLS tenant-readable via `company_members`), the fast-read `companies.credit_balance` cache, `reconcileBalance`, the `create-topup-session` Stripe route, the `buildOverageAffordance` helper (explicitly built in Phase 113 "for reuse by the Phase-115 balance widget"), and the `notifyQuotaThresholds` notification path. There is **no migration** and **no new backend logic** required — only a read-query helper, two/three UI surfaces, copy strings, and one notification hook.

The cleanest implementation mirrors the existing `/settings/billing` page exactly: it is a server component that calls a query helper (`getBillingData`) and renders glass `Card`s with `<T>`-wrapped copy. Phase 115 adds (1) a new `lib/queries/credits.ts` helper that reads `companies.credit_balance` (balance) + a `credit_ledger` slice (history), (2) a "Credits" card + a consumption-history list on that same page, (3) optionally a small header chip in `topbar.tsx`, and (4) a low/zero-balance warning + top-up/upgrade CTA. The owner sees `operation_type + delta_credits + date` only — **never** `real_cost_usd` or `markup` (those columns exist on the ledger but must be excluded from the SELECT projection, not just hidden in the view).

**Primary recommendation:** Put the balance + history + per-action guidance on the existing `/settings/billing` page as new glass cards (mirroring the "Usage This Month" card), backed by a new `lib/queries/credits.ts` server helper that projects ONLY owner-safe columns. Drive the low/zero CTA from `billing_config.lowBalanceThresholds` and link the top-up CTA at the `create-topup-session` route (`/settings/billing?topup=1`) and upgrade at the tier grid. Per-action guidance is a static copy string for v1. Enforcement is OFF this milestone, so the widget is informational — frame copy accordingly. Optionally add a compact header chip in `topbar.tsx`.

---

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (`/gsd:discuss-phase` was not run). Constraints below are extracted verbatim from REQUIREMENTS.md locked decisions and the SEED-035 "Frontend: saldo + UX" section, and carry the same authority.

### Locked Decisions (from REQUIREMENTS.md + SEED-035)
- **Hybrid credit model** — backend debits `real_cost × markup`; **frontend shows a simple credit balance ("≈ an estimate = 10–15 credits"), NEVER token math.** (REQUIREMENTS line 9; SEED-035 §2)
- **Denomination:** 1 credit = $0.01 of charged AI value. This is a backend fact; the owner never sees the dollar conversion.
- **Overage = top-up + upgrade prompt; no silent mid-job block.** (REQUIREMENTS line 12)
- **Everything super-admin-configurable via `billing_config`** — the tenant only experiences the result; the owner has **no access** to billing controls (markup/grant/thresholds). (REQUIREMENTS line 14; BILLCFG-03)
- **Low-balance thresholds come from `billing_config.lowBalanceThresholds`** (default `[200, 50]`), set by super-admin (Phase 111). The widget reads them, never hard-codes them.

### Claude's Discretion
- **Header chip vs settings-only placement** — recommend the cleanest. (Recommendation below: settings page is mandatory; header chip is optional/nice-to-have and low-risk.)
- **How per-action guidance is derived/displayed** — recommend a static/approximate mapping or a coarse estimate. (Recommendation: static copy string for v1.)
- **Exact history page size / pagination** — recommend a sane default (latest ~20–50 rows, no pagination for v1).
- **Whether the low-balance notification fires from `recordCreditDebit` or a separate path** — recommend the hook point.

### Deferred Ideas (OUT OF SCOPE — do not build)
- **Enforcement / blocking on insufficient credits** — Phase 116 (CALIB-02 flips `enforcementEnabled`). Credits do NOT block generation this milestone. The widget is informational.
- **Credit rollover** (GRAN-03), **per-operation markup display** (GRAN-01), **platform revenue dashboard** (GRAN-04) — all v2.
- **Owner-editable billing parameters** — super-admin only, permanently out of tenant scope.
- **Token / cost / markup math in the owner UI** — forbidden by the core locked decision.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CREDITUI-01 | Owner sees a simple credit balance (header/settings) + consumption history + rough per-action guidance — never token math | Balance from `companies.credit_balance` (Phase 112). History from `credit_ledger` projecting `operation_type, delta_credits, reason, created_at` ONLY (exclude `real_cost_usd`/`markup`). Settings-page placement mirrors existing "Usage This Month" card. Per-action guidance = static copy string. |
| CREDITUI-02 | Low/zero-balance states show a warning + top-up/upgrade CTA, reusing the existing threshold-notification path | Thresholds from `billing_config.lowBalanceThresholds` (`[200, 50]`). In-UI warning rendered in the credits card. Notification reuses `notifyQuotaThresholds` pattern (`lib/quota.ts`) → `linkUrl: '/settings/billing'`. CTA: top-up → `create-topup-session` route (`/settings/billing?topup=1`); upgrade → `TierCardsGrid` / `create-checkout-session`. `buildOverageAffordance` (Phase 113) already returns both URLs. |

---

## Standard Stack

This is an internal-integration phase. No new libraries. Everything is already in the repo.

### Core (existing, reuse verbatim)
| Module / Component | Path | Purpose | Why Standard |
|--------------------|------|---------|--------------|
| `companies.credit_balance` | `supabase/migrations/20260624000004_phase112_credit_ledger.sql` | O(1) balance read (CREDIT-03) | The reconcilable cached value the widget reads — never SUM the ledger live for the headline number |
| `credit_ledger` | same migration | Append-only history; RLS `SELECT` via `company_members` | Owner can read own history directly (tenant-readable) |
| `reconcileBalance` | `lib/billing/credit-ledger.ts` | Repairs cache = SUM(ledger) | Guarantees the shown balance equals the ledger (CREDIT-03); widget reads the cache, not a live SUM |
| `buildOverageAffordance` | `lib/billing/overage-affordance.ts` | `{topUpUrl, upgradeUrl} | null` from a `checkCredits` result | Built explicitly "for reuse by the Phase-115 balance widget" (113-03 SUMMARY) |
| `create-topup-session` route | `app/api/billing/create-topup-session/route.ts` | One-time top-up Stripe checkout (POST `{packIndex}`) | The top-up CTA target |
| `getBillingConfig` | `lib/billing/billing-config.ts` | `lowBalanceThresholds`, `topUpPacks` | Source of truth for thresholds + pack list (server-only) |
| `notifyQuotaThresholds` | `lib/quota.ts` | Threshold-crossing notification (dedup per company/month) | The reuse target for CREDITUI-02 (pattern to mirror for a credit-balance event) |
| `getBillingData` | `lib/queries/billing.ts` | Existing settings-page data loader | Mirror for the new credits query; or extend it |
| `<T>` / `useTranslation` | `components/i18n/t.tsx`, `lib/i18n/use-translation.ts` | EN/PT/ES copy | All new user-facing copy must be `<T>`-wrapped |
| glass `Card` set | `components/ui/card` | `variant="glass"` cards | The settings page visual language |

### Supporting (existing patterns to mirror)
| Item | Path | When to Use |
|------|------|-------------|
| `TrialBanner` | `components/billing/trial-banner.tsx` | Style reference for a thin warning banner (amber, `AlertTriangle`, `/settings/billing` link) |
| `UpgradeButtons` | `components/billing/upgrade-buttons.tsx` | Pattern for a client button POSTing to a checkout route then `window.location.href` |
| `TierCardsGrid` | `components/billing/tier-cards-grid.tsx` | The upgrade CTA surface already on the billing page |
| `topbar.tsx` | `components/app-shell/topbar.tsx` | Where an optional header chip would mount (right-side actions row) |
| `billing-data.test.ts` | `tests/unit/billing/billing-data.test.ts` | The chainable-mock test pattern for the new credits query |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `lib/queries/credits.ts` | Extend `getBillingData` to also return balance + recent ledger | Extending keeps one query/one round-trip on the page, but `getBillingData` uses `requireServiceClient` and is keyed by `userId`; a separate helper keeps concerns clean and can be reused by the header chip. **Recommend a new `lib/queries/credits.ts`** scoped to the active company. |
| Live `SUM(delta_credits)` for the headline balance | `companies.credit_balance` cache | Live SUM is O(n) and risks drift from the documented fast-read contract. **Use the cache** (CREDIT-03); reconcile is a repair path, not a read path. |
| Header chip as a server component | Header chip reading a passed-in balance prop from the layout | The layout already does a `companies` read; passing `credit_balance` down avoids a second query. **If adding the chip, extend the existing layout `companies` select to include `credit_balance`.** |

**Installation:** none — no new packages.

**Version verification (current as of 2026-06-24):**
- `vitest ^4.1.4`, `next 16.2.6`, `react 19.2.4` (read from `package.json`). No new deps, so no registry check needed.

---

## Architecture Patterns

### Recommended Project Structure
```
lib/queries/
  credits.ts              # NEW — getCreditOverview(companyId): { balance, history[], thresholds }
                          #        projects ONLY owner-safe ledger columns
components/billing/
  credit-balance-card.tsx # NEW — server-renderable card: balance + per-action guidance + low/zero warning + CTA
  credit-history-list.tsx # NEW — maps owner-safe ledger rows (operation label + signed delta + date)
  top-up-button.tsx       # NEW (client) — POST create-topup-session {packIndex}; mirrors UpgradeButtons
components/app-shell/
  credit-chip.tsx         # OPTIONAL — compact header balance chip linking to /settings/billing
app/(app)/settings/billing/page.tsx   # MODIFY — add the credits card + history below the usage card
lib/billing/credit-ledger.ts          # MODIFY (CREDITUI-02 only) — fire a low-balance notification after a debit
```

### Pattern 1: Server-component page reads a query helper, renders glass cards
**What:** The billing page is an async server component; it calls `getBillingData(...)` and renders `<Card variant="glass">` blocks with `<T>` copy.
**When to use:** The credits card + history follow the identical shape.
**Example (existing, the model to mirror):**
```tsx
// Source: app/(app)/settings/billing/page.tsx (verified)
const data = await getBillingData(claims.sub as string)
// ...
<Card variant="glass" className="p-6">
  <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
    <CardTitle><T>Usage This Month</T></CardTitle>
  </CardHeader>
  <CardContent className="space-y-3 px-0 pt-4 text-sm">
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground"><T>Estimates</T></span>
      <span className="font-mono font-medium">{data.estimatesThisMonth} / ...</span>
    </div>
  </CardContent>
</Card>
```

### Pattern 2: Owner-safe ledger projection (the cardinal rule)
**What:** The history query selects ONLY `operation_type, delta_credits, reason, created_at`. `real_cost_usd` and `markup` exist on the row but are NEVER in the projection.
**When to use:** Every read that feeds the owner UI.
**Example (the SELECT to write):**
```ts
// Source: derived from credit_ledger schema (20260624000004) — owner-safe columns only
const { data } = await supabase
  .from('credit_ledger')
  .select('operation_type, delta_credits, reason, created_at')  // NO real_cost_usd, NO markup
  .eq('company_id', companyId)
  .order('created_at', { ascending: false })
  .limit(50)
```
**Why projection, not just hiding in the view:** defense in depth — if a future dev passes the rows to a client component or logs them, the cost columns simply aren't present.

### Pattern 3: Reuse the affordance helper for the CTA decision
**What:** `buildOverageAffordance({ allowed, balance, shortfall })` returns `{ topUpUrl, upgradeUrl }` or `null`. For the low-balance card, compute "is balance below the lowest threshold" and surface the same two URLs.
**Example (existing):**
```ts
// Source: lib/billing/overage-affordance.ts (verified)
// shortfall>0 -> { topUpUrl:'/settings/billing?topup=1', upgradeUrl:'/settings/billing' }
```
Note: for a *low* (not zero) balance, `shortfall` may be 0 (you still have credits), so the widget should drive the warning off `balance <= max(lowBalanceThresholds)` rather than off `shortfall`. Reuse the URL constants, not necessarily the helper's boolean.

### Pattern 4: Notification reuse for CREDITUI-02
**What:** `notifyQuotaThresholds` is the count-quota path. CREDITUI-02 says "reuse the existing threshold-notification path." The cleanest reuse is to add a sibling helper (e.g. `notifyLowCreditBalance`) in `lib/quota.ts` (or a small new module) that mirrors `notifyQuotaThresholds`: dedup per company/month via `metadata.dedupe_key`, `linkUrl: '/settings/billing'`, fired when the balance crosses a `lowBalanceThresholds` boundary *downward*. Hook it where the balance actually drops — at the end of `recordCreditDebit` in `lib/billing/credit-ledger.ts` (it already has `current` and `balanceAfter` in scope, exactly like `notifyQuotaThresholds` takes `previousCount`/`newCount`).
**Example (the pattern to mirror):**
```ts
// Source: lib/quota.ts notifyQuotaThresholds (verified)
void notify({
  companyId, userId: userId ?? null,
  eventType: 'quota.80pct',           // a new credit event would slot here
  title: copy.title, body: copy.body,
  linkUrl: '/settings/billing',
  metadata: { dedupe_key: `quota-80-${companyId}-${month}` },
})
```

### Anti-Patterns to Avoid
- **Exposing cost/markup/token math.** Never SELECT or render `real_cost_usd`/`markup`. Never show the `× markup` or `/ creditUnitUsd` math. (Core locked decision.)
- **Live-SUMming the ledger for the headline balance.** Read `companies.credit_balance`. Reconcile is a repair path.
- **Hard-coding thresholds or pack prices.** Read `lowBalanceThresholds` / `topUpPacks` from `getBillingConfig()` (server-only). The owner UI never sees the config controls (BILLCFG-03).
- **Framing the warning as a block.** Enforcement is OFF (`enforcementEnabled: false`). Copy must be informational ("running low — top up to keep going"), never "you are blocked."
- **Calling `getBillingConfig()` from a client component.** It is `import 'server-only'`. Thresholds/packs must be read in the server component (or via a route) and passed down as props.
- **Raw English strings in JSX.** Wrap all owner-facing copy in `<T>` (EN/PT/ES).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Top-up checkout | A new Stripe session route | `app/api/billing/create-topup-session` (POST `{packIndex}`) | Already built, server-side pack lookup, demo-guarded |
| CTA URL decision | Custom shortfall logic | `buildOverageAffordance` + the URL constants | Phase 113 built it for this widget |
| Balance read | `SUM(delta_credits)` query | `companies.credit_balance` | CREDIT-03 fast-read; reconcilable |
| Balance ↔ ledger consistency | A custom reconcile-on-read | `reconcileBalance` (already exists; runs server-side) | The cache is the contract; don't re-derive in the UI |
| Low-balance notification plumbing | A new notification system | `notify` + `buildNotificationCopy` + `notifyQuotaThresholds` pattern | Existing dedup, channels, in-app/email already wired |
| i18n of new copy | Manual translation files | `<T>` / `useTranslation` (auto-batches to `/api/translate`, static dict fallback) | The app's translation layer handles PT/ES at runtime |
| Glass card styling | New CSS | `components/ui/card` `variant="glass"` | The settings page visual language |

**Key insight:** This phase is ~90% wiring existing primitives into two UI surfaces. The only genuinely new code is a read-query helper (owner-safe projection), the presentational components, copy strings, and one notification hook. Resist building anything else.

---

## Common Pitfalls

### Pitfall 1: Leaking cost/markup columns into the owner UI
**What goes wrong:** A `select('*')` on `credit_ledger`, or passing full rows to a client component, exposes `real_cost_usd` and `markup` — violating the core "never token math" decision.
**Why it happens:** The columns are right there on the row; `select('*')` is the lazy default.
**How to avoid:** Explicit owner-safe projection (`operation_type, delta_credits, reason, created_at`). Add a unit test asserting the query string contains neither `real_cost_usd` nor `markup`.
**Warning signs:** Any dollar figure, multiplier, or token count visible in the credits UI.

### Pitfall 2: Framing the widget as enforcement
**What goes wrong:** Copy says "out of credits — generation blocked," but `enforcementEnabled` is `false` this milestone, so generation still runs. The owner is misled.
**Why it happens:** Treating credits like the old count-quota (which DID block).
**How to avoid:** Informational copy only. "You're running low on credits. Top up to stay ahead." The widget makes sense with enforcement off (scope fence: this is display + CTA).
**Warning signs:** Words like "blocked," "denied," "you cannot."

### Pitfall 3: `getBillingConfig()` is server-only
**What goes wrong:** Importing it into a client `'use client'` component throws at build (it's `import 'server-only'` and uses the service client).
**Why it happens:** Wanting the thresholds/packs inside an interactive button.
**How to avoid:** Read config in the server component (page) and pass `thresholds` / `topUpPacks` as plain props to client children. The top-up button only needs a `packIndex`.
**Warning signs:** "server-only cannot be imported from a Client Component" build error.

### Pitfall 4: Header-chip query cost
**What goes wrong:** A header `credit-chip` that runs its own `companies` query adds a DB round-trip to every authed page load.
**Why it happens:** Building the chip as a self-contained server component.
**How to avoid:** The app layout (`app/(app)/layout.tsx`) already SELECTs from `companies` for the active company. Add `credit_balance` to that existing select and pass it into `Topbar` → chip. No extra query.
**Warning signs:** A second `from('companies')` call in the request waterfall.

### Pitfall 5: Stale cached balance after top-up
**What goes wrong:** Owner buys a top-up; the page still shows the old balance because the grant lands via webhook asynchronously and the page was server-rendered before.
**Why it happens:** Server components cache; the webhook credits the ledger after redirect.
**How to avoid:** The top-up success redirect already lands on `/settings/billing?topup=1` — a fresh server render. If needed, the page can call `reconcileBalance` or simply read the (webhook-updated) cache on that fresh load. Don't over-engineer real-time; a fresh navigation is sufficient for v1.
**Warning signs:** Balance not reflecting a just-completed top-up after redirect.

### Pitfall 6: Per-action guidance drifting from real cost
**What goes wrong:** Hard-coding "an estimate ≈ 12 credits" that becomes wrong once markup/grant are calibrated (Phase 116).
**Why it happens:** A literal number in copy.
**How to avoid:** v1 — use an approximate *range* string ("an estimate ≈ 10–15 credits") framed as guidance, matching the SEED-035 language exactly. It's explicitly "rough." If a config-derived estimate is wanted later, compute it server-side from `billing_config` and pass it down — but a copy string is acceptable for v1 (per discretion).
**Warning signs:** A precise single-number claim presented as exact.

---

## Code Examples

### Owner-safe credit overview query (the new helper)
```ts
// Source: derived from lib/queries/billing.ts pattern + credit_ledger schema (verified)
// lib/queries/credits.ts
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'

export interface CreditHistoryRow {
  operation_type: string | null   // 'estimate' | 'photo_batch' | 'audio_minutes' | 'price_research' | null
  delta_credits: number           // signed: debit negative, grant/topup positive
  reason: string                  // 'grant' | 'debit' | 'topup' | 'adjust'
  created_at: string
}
export interface CreditOverview {
  balance: number
  history: CreditHistoryRow[]
  lowBalanceThresholds: number[]
}

export async function getCreditOverview(companyId: string): Promise<CreditOverview> {
  const svc = requireServiceClient()
  const [{ data: co }, { data: rows }, cfg] = await Promise.all([
    svc.from('companies').select('credit_balance').eq('id', companyId).single(),
    svc.from('credit_ledger')
       .select('operation_type, delta_credits, reason, created_at') // owner-safe only
       .eq('company_id', companyId)
       .order('created_at', { ascending: false })
       .limit(50),
    getBillingConfig(),
  ])
  return {
    balance: (co as { credit_balance?: number } | null)?.credit_balance ?? 0,
    history: (rows ?? []) as CreditHistoryRow[],
    lowBalanceThresholds: cfg.lowBalanceThresholds,
  }
}
```
Note: this uses `requireServiceClient` to match `getBillingData`. Because `credit_ledger` RLS is tenant-readable via `company_members`, a request-scoped client would also work if the page passes the user's session — but mirroring `getBillingData` (service client, company-scoped) is the established pattern.

### Top-up button (client) — mirrors UpgradeButtons
```tsx
// Source: components/billing/upgrade-buttons.tsx pattern (verified)
'use client'
async function handleTopUp(packIndex: number) {
  const res = await fetch('/api/billing/create-topup-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packIndex }),
  })
  const data = await res.json()
  if (res.ok && data.url) window.location.href = data.url
}
```

### Low-balance notification hook (CREDITUI-02) — mirrors notifyQuotaThresholds
```ts
// Source: lib/quota.ts notifyQuotaThresholds pattern (verified) — sketch for a sibling helper
// Fire when balanceAfter crosses below a lowBalanceThresholds boundary that `current` was above.
// Dedup per company/month via metadata.dedupe_key; linkUrl '/settings/billing'.
// Best-effort (try/catch, void notify) — must NEVER break the debit write.
```
Hook point: end of `recordCreditDebit` in `lib/billing/credit-ledger.ts`, where `current` and `balanceAfter` are both in scope. Keep it best-effort (the module is already never-throw).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Count-based usage card ("Estimates 3/10") | Credit balance + ledger history | This milestone (v4.7) | Credits run IN PARALLEL with counts (MIG-01); the existing usage card stays — the credits card is additive, not a replacement, this phase |
| `quota.80pct` / `quota.exhausted` (count) | Same notification rail, new credit-balance trigger | Phase 115 | Reuse `notify` + dedup; a credit-low event is a sibling, not a rewrite |

**Deprecated/outdated:** nothing to remove. The count-based usage card and credit card coexist during the parallel-run transition (MIG-01, Phase 113). Do not delete the existing usage card.

---

## Open Questions

1. **Header chip — ship it or defer?**
   - What we know: `topbar.tsx` has a clean right-actions row; the layout already reads `companies`. Adding `credit_balance` to that select + a chip is low-cost and low-risk.
   - What's unclear: whether the product wants a persistent header chip vs settings-only for v1.
   - Recommendation: settings-page surfaces are mandatory (CREDITUI-01 core). Treat the header chip as an optional, clearly-scoped task — recommend including it since it reuses the existing layout query, but it can be cut without affecting requirement coverage.

2. **Per-action guidance — static string vs config-derived estimate.**
   - What we know: SEED-035 + REQUIREMENTS use the exact phrase "an estimate ≈ 10–15 credits"; it's explicitly "rough." `billing_config` has markup but no measured per-op cost yet (calibration is Phase 116).
   - What's unclear: whether a config-derived number is wanted before calibration data exists.
   - Recommendation: static range copy string for v1 (matches the locked phrasing; avoids leaking math and avoids a fake-precise number pre-calibration).

3. **Low-balance notification dedup window.**
   - What we know: `notifyQuotaThresholds` dedups per company/month. Credit balance can oscillate (debit down, top-up up) within a month.
   - What's unclear: ideal dedup granularity for credits (per-month may be too coarse if they top up and dip again).
   - Recommendation: dedup per company + per threshold + per month (mirror the existing pattern); revisit if users report missed warnings. Acceptable for v1.

---

## Environment Availability

No new external dependencies. The phase uses only the existing Supabase project, the already-configured Stripe rail (Phase 113), and the in-repo notification system. Step 2.6: effectively SKIPPED — all dependencies are internal and already verified present in the tree (`credit_ledger` migration, `create-topup-session` route, `notify` pipeline).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase `credit_ledger` + `companies.credit_balance` | balance + history | ✓ (migration `20260624000004`) | — | — |
| `create-topup-session` Stripe route | top-up CTA | ✓ (Phase 113) | — | — |
| `notify` / `buildNotificationCopy` | low-balance notification | ✓ (Phase 77/104) | — | — |
| `<T>` i18n | EN/PT/ES copy | ✓ | — | — |

**Missing dependencies with no fallback:** none.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` → this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` |
| Config file | `vitest.config.*` at repo root (existing — the billing suite already runs under it) |
| Quick run command | `npx vitest run tests/unit/billing/credits-query.test.ts` (new file) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CREDITUI-01 | `getCreditOverview` returns `balance` from `companies.credit_balance` and history rows | unit | `npx vitest run tests/unit/billing/credits-query.test.ts` | ❌ Wave 0 |
| CREDITUI-01 | History query NEVER selects `real_cost_usd` / `markup` (owner-safe projection) | unit (source/string assertion) | `npx vitest run tests/unit/billing/credits-query.test.ts` | ❌ Wave 0 |
| CREDITUI-01 | Per-action guidance is a static range string (no token/cost math in component) | unit (render or source guard) | `npx vitest run tests/unit/billing/credit-balance-card.test.tsx` | ❌ Wave 0 |
| CREDITUI-02 | Low/zero balance produces a warning + top-up + upgrade CTA from `lowBalanceThresholds` | unit | `npx vitest run tests/unit/billing/credit-balance-card.test.tsx` | ❌ Wave 0 |
| CREDITUI-02 | Low-balance crossing fires a best-effort notification (mirrors `notifyQuotaThresholds`); never throws | unit | `npx vitest run tests/unit/billing/credit-low-notify.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/<file-under-edit>.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/billing`
- **Phase gate:** full `npx vitest run` green before `/gsd:verify-work` (baseline at Phase 113 was 289 files / 2054 passed).

### Wave 0 Gaps
- [ ] `tests/unit/billing/credits-query.test.ts` — covers CREDITUI-01 (balance read + owner-safe projection). Mirror `tests/unit/billing/billing-data.test.ts` chainable mock.
- [ ] `tests/unit/billing/credit-balance-card.test.tsx` — covers CREDITUI-01 guidance copy + CREDITUI-02 low/zero CTA rendering.
- [ ] `tests/unit/billing/credit-low-notify.test.ts` — covers CREDITUI-02 notification hook (never-throw, dedup, threshold crossing).
- [ ] No framework install needed — Vitest is configured and the billing suite already runs.

---

## Project Constraints (from CLAUDE.md)

- **Tech stack:** Next.js 16 App Router, TypeScript strict, Tailwind, shadcn/ui, react-hook-form + zod. (Credits UI needs no forms; plain server components + a small client button.)
- **No secrets in code or planning docs** — N/A for this UI phase, but never paste Stripe/whsec values into copy or summaries (use placeholders).
- **All AI/service-role server-side** — `getBillingConfig` and `requireServiceClient` stay server-only; never reach the browser. Pass derived values down as props.
- **i18n (EN/PT/ES):** all new owner-facing copy wrapped in `<T>` / driven through `useTranslation`. (Memory: planning docs in English; chat may be Portuguese — copy strings authored in English, translated at runtime.)
- **GSD workflow:** edits go through `/gsd:execute-phase` (planning enforcement).
- **Deploy CI→GHCR→Coolify:** no migration in this phase, so no DB deploy concern; never build on the VPS.
- **No checkpoint pauses** (memory): proceed through human-verify checkpoints as auto-approved.

---

## Sources

### Primary (HIGH confidence — read directly from the repo)
- `supabase/migrations/20260624000004_phase112_credit_ledger.sql` — `credit_ledger` schema, RLS (`company_members` SELECT), `companies.credit_balance`, indexes
- `lib/billing/credit-ledger.ts` — `recordCreditDebit` / `grantCredits` / `checkCredits` / `reconcileBalance`
- `lib/billing/billing-config.ts` — `lowBalanceThresholds` (`[200,50]`), `topUpPacks`, `enforcementEnabled: false`, server-only
- `lib/billing/overage-affordance.ts` — `buildOverageAffordance` (`topUpUrl`/`upgradeUrl`)
- `app/api/billing/create-topup-session/route.ts` — top-up checkout (POST `{packIndex}`)
- `app/(app)/settings/billing/page.tsx` + `lib/queries/billing.ts` — the page + query pattern to mirror
- `lib/quota.ts` — `notifyQuotaThresholds` (the CREDITUI-02 reuse pattern)
- `lib/notifications/event-types.ts`, `lib/notifications/copy.ts` — notification catalog + copy module
- `components/billing/trial-banner.tsx`, `upgrade-buttons.tsx`, `tier-cards-grid.tsx` — UI patterns
- `components/app-shell/topbar.tsx`, `app/(app)/layout.tsx` — header-chip placement + existing `companies` read
- `components/i18n/t.tsx`, `lib/i18n/use-translation.ts` — i18n
- `tests/unit/billing/billing-data.test.ts`, `credit-debit-wiring.test.ts` — test patterns
- `.planning/phases/112-.../112-03-SUMMARY.md`, `113-.../113-03-SUMMARY.md` — ledger + Stripe-rail context (113 explicitly scopes the widget to Phase 115)
- `package.json` — vitest ^4.1.4, next 16.2.6, react 19.2.4
- `.planning/config.json` — `nyquist_validation: true`

### Secondary / Tertiary
None — no web research needed; this is a fully internal-integration phase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive read directly from the tree; nothing inferred from training data.
- Architecture: HIGH — mirrors an existing, working page (`/settings/billing`) and existing helpers built explicitly for this widget.
- Pitfalls: HIGH — derived from the actual schema (cost columns on the ledger), the `server-only` guard, the `enforcementEnabled: false` state, and the parallel-run (MIG-01) decision.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (stable; the only volatility is whether Phase 116 calibration changes config defaults — irrelevant to this display phase since it reads config at runtime).
