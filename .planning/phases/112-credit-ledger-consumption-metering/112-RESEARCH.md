# Phase 112: Credit Ledger + Consumption Metering - Research

**Researched:** 2026-06-24
**Domain:** Multi-tenant billing / credit metering on Supabase Postgres + Inngest job pipeline
**Confidence:** HIGH (every recommendation is grounded in code already in this repo — Phases 55/56/82/94/110/111)

## Summary

This phase builds the credit metering core: an append-only, tenant-scoped `credit_ledger` table; a debit helper that converts the real AI cost captured by Phase 110 (`real_cost × markup / creditUnitUsd`) into a credit debit; a fast-read cached `companies.credit_balance`; the `monthlyCreditGrant` entitlement field + a grant-writing helper; a `checkCredits` pre-op gate; and idempotency reused verbatim from `recordUsage`. Every parameter (markup, creditUnitUsd, per-tier grant) is read at runtime from `getBillingConfig()` (Phase 111) — **no hard-coded billing numbers**.

The single most important verified finding: **the credit debit cannot live in `lib/billing/record-ai-cost.ts`.** A Phase-110 static guard (`tests/unit/billing/measure-only-invariant.test.ts`) fails the build if the tokens `credit`/`debit`/`ledger`/`balance`/`markup` — or any charging import — appear in that file. The debit therefore must live in a **new module** (`lib/billing/credit-ledger.ts`) and fire from the call sites, not from inside `recordAICost`. This is not a preference — it is a CI-enforced contract the planner must honor.

The second key finding: there are **two distinct instrumentation seams** already in the code, and they are NOT co-located. `recordAICost` fires deep at the *provider level* (`lib/ai/providers/openrouter.ts`, `lib/ai/openrouter-client.ts`, `transcribe-audio.ts`) where `usage.cost` is known but only `attemptId`/`companyId`/`projectId` are in scope. `recordUsage` fires at a *separate Inngest `step.run('record-usage')`* where `companyId` + the `requestId` idempotency key live. The cleanest debit seam is a **third `step.run('record-credit-debit')` inside each Inngest job**, after `record-usage`, that reads back the just-written `ai_cost_events` row(s) for the attempt and writes the ledger debit — keeping the never-throw provider path untouched and the debit retry-isolated.

**Primary recommendation:** New migration `20260624000004_phase112_credit_ledger.sql` (credit_ledger table, company_members SELECT RLS mirroring invoices, `companies.credit_balance` column) + new `lib/billing/credit-ledger.ts` (`recordCreditDebit`, `grantCredits`, `checkCredits`, `reconcileBalance`) + `monthlyCreditGrant` on `Entitlements` sourced from `billing_config.tiers[tier].monthlyCreditGrant` + an `enforcementEnabled: false` flag added to `billing_config` so debits RECORD but `checkCredits` does not BLOCK until Phase 116 calibration flips it on.

<user_constraints>
## User Constraints (from REQUIREMENTS.md locked decisions — no CONTEXT.md for this phase)

There is no `112-CONTEXT.md` (this research was spawned by `/gsd:plan-phase` without a prior discuss step). The binding constraints come from the milestone's **Locked decisions** (REQUIREMENTS.md) and **Locked guardrails** (STATE.md), which carry the same authority:

### Locked Decisions (verbatim, REQUIREMENTS.md)
- **Stripe is the rail, the credit ledger is OURS** — credit metering lives in our `credit_ledger`, NOT Stripe metered billing.
- **Hybrid credit model** — backend debits `real_cost × markup` (margin-safe by construction); frontend shows a simple credit balance, never token math. Denomination: 1 credit = $0.01 of charged AI value.
- **Markup target 4.5x**; grant sized so the real cost of the FULL monthly grant is ≤ ~30% of the subscription price.
- **Consumption rule** — debit wherever WE spend AI (the points already in `usage_events`); MCP external-assistant conversation = zero credit; lightweight web-chat conversation absorbed.
- **Overage = top-up** (buy more credits) + upgrade prompt; no silent mid-job block.
- **Everything super-admin-configurable** via `billing_config` — no hard-coded billing numbers, no env vars. The tenant only experiences the result.
- **Calibrate before charging** — measure real cost in production with billing OFF; derive grant/markup/price from data.

### Claude's Discretion (this phase)
- Exact module layout for `lib/billing/credit-ledger.ts` (one file vs split helpers).
- The precise `step.run` id names and ordering within each Inngest job.
- Whether `reconcileBalance` is a SQL function or a TS helper (recommendation: TS helper using the service client, for symmetry with the rest of the module).
- The exact `enforcementEnabled` flag placement inside `BillingConfig` (recommendation: top-level boolean default `false`).

### Deferred Ideas (OUT OF SCOPE for Phase 112)
- **Stripe grant/top-up webhooks** (`invoice.paid` granting, one-time top-up checkout) → **Phase 113** (TOPUP-01/02/03, MIG-01). THIS phase adds the `grantCredits` helper the webhook will *call*, not the webhook.
- **Owner-facing balance UX** (widget, history, low-balance CTA) → **Phase 115** (CREDITUI-01/02). THIS phase makes the ledger *readable* by the tenant (RLS) so 115 can render it.
- **Estimate payment 1% fee** → **Phase 114** (independent track).
- **Calibrating real numbers + flipping charging ON** → **Phase 116** (CALIB-02). THIS phase records debits and adds the `enforcementEnabled` flag; it does NOT turn enforcement on.
- **`knowledge` (RAG/embeddings) debit point** — SEED-035 lists it as a *future* metered op; it is not among the four CREDIT-02 ops and is not instrumented in `usage_events` today. Out of scope.
- **Per-operation-type markup** (GRAN-01), **rollover** (GRAN-03) — v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CREDIT-01 | Tenant-scoped append-only `credit_ledger` (grant/debit/topup/adjust) with real cost, markup, balance | Table shape confirmed from SEED-035 §2; RLS pattern from Phase 94 invoices (company_members SELECT); migration convention from Phase 110. See "Standard Stack" + Pitfall 1. |
| CREDIT-02 | Each instrumented op debits `real_cost × markup` | Debit formula + the two-seam architecture (provider-level `recordAICost` vs job-level `step.run`); recommend a new `step.run('record-credit-debit')` reading `ai_cost_events` back. See "Architecture Pattern 2". |
| CREDIT-03 | Fast-read balance, reconcilable to the ledger | Cached `companies.credit_balance` column updated in the same service-role write as the ledger insert + a `reconcileBalance()` SUM-of-deltas helper. See "Architecture Pattern 3". |
| CREDIT-04 | Configurable per-tier `monthlyCreditGrant` on entitlements | Add field to `Entitlements`; source the value from `billing_config.tiers[tier].monthlyCreditGrant` (already in `DEFAULT_BILLING_CONFIG`). `grantCredits` helper writes the grant (called by Phase 113 webhook). See "Architecture Pattern 4". |
| CREDIT-05 | Pre-op balance check → top-up path, not hard mid-flow fail | `checkCredits` returning `{ allowed, balance, shortfall }`, gated by `enforcementEnabled` (default false → always allowed during measure-only). Mirrors the existing `checkQuota` 402 pattern at the route. See "Architecture Pattern 5". |
| CREDIT-06 | Idempotent debits (reuse `recordUsage` idempotency) | Reuse the exact partial-unique-index + check-then-insert dedup from `usage_events`. Debit idempotency key shape: `${attemptId}:debit:${operation_type}`. See "Architecture Pattern 6". |
| CREDIT-07 | Zero-debit for non-spend ops (MCP conversation) | Falls out automatically: a debit is derived from an `ai_cost_events` row, which only exists where WE spend AI. MCP external conversation writes no cost row → no debit. See "Pitfall 4 + Open Question 1". |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Migrations:** idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`, `DROP … IF EXISTS`), authored only — **NOT applied to remote**. Deploy is CI→GHCR→Coolify; never build on the VPS. The new migration carries alongside `20260624000003` in the pipeline.
- **RLS on the new table** (mandatory — all tenant tables have RLS).
- **Never expose the service role key to the browser**; all writes via `requireServiceClient()`/`createServiceClient()`.
- **Never-throw on the debit path:** a ledger-write failure must not break generation/transcription (same contract as `recordAICost`). Wrap in try/catch + `console.warn`.
- **Channel-neutral:** the domain/ledger code must not import `lib/whatsapp/*` (a static grep gate is the project norm).
- **No secrets in `.planning/` docs** — none appear here (placeholders only).
- **GSD workflow:** all edits go through `/gsd:execute-phase 112`.

## Standard Stack

### Core (all already in the repo — this phase adds NO new dependencies)
| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| `@supabase/supabase-js` | (installed) | DB access via injected client | Already the data layer; quota/cost helpers inject the client |
| `lib/supabase/service` → `requireServiceClient` / `createServiceClient` | repo | RLS-bypassing service-role writes | The established write path for `usage_events`, `ai_cost_events`, `pipeline_events` |
| `lib/billing/billing-config.ts` → `getBillingConfig` | repo (Phase 111) | Runtime source of `markup`, `creditUnitUsd`, `tiers[].monthlyCreditGrant`, (new) `enforcementEnabled` | BILLCFG-03: no hard-coded billing numbers. Ships DORMANT — Phase 112 is its FIRST consumer. |
| `lib/billing/record-ai-cost.ts` → `AICostInput` / `ai_cost_events` | repo (Phase 110) | The real-cost source the debit is derived from | COST-03 capture; the ledger reads these rows |
| `lib/quota.ts` → `recordUsage` dedup mechanism | repo (Phase 56) | Idempotency pattern to copy verbatim | CREDIT-06 explicitly says "reuse the existing `recordUsage` idempotency" |
| `lib/entitlements.ts` → `Entitlements` / `getEntitlements` | repo (Phase 55/108) | Where `monthlyCreditGrant` is added | CREDIT-04 |
| `vitest` | (installed) | Unit + static-migration-contract tests | Project test framework; Phase 110/111 set the test pattern |

### Supporting / patterns to mirror
| Source file | What to copy |
|-------------|--------------|
| `supabase/migrations/20260619000001_phase94_invoices.sql` | The **canonical tenant-readable financial table**: `company_members` SELECT/INSERT/UPDATE RLS, no DELETE, FK to companies ON DELETE CASCADE, `amount_cents INTEGER CHECK (>0)`, partial-unique index on a nullable Stripe id, company_id index. |
| `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` | The **partial unique index** `(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — the exact idempotency primitive for debits. |
| `supabase/migrations/20260624000003_phase110_ai_cost_events.sql` | Migration header conventions, `NUMERIC` for money/cost, `TEXT + CHECK` for enum-like columns (project avoids Postgres enums), idempotent DDL, "NOT applied to remote" note. |
| `lib/quota.ts` `recordUsage` (lines 177-208) | The **check-then-insert dedup** + `PG_UNIQUE_VIOLATION = '23505'` swallow (the partial index can't be an `onConflict` arbiter via supabase-js — do NOT try `.upsert(onConflict)`). |
| `lib/billing/record-ai-cost.ts` | The **never-throw side-effect** shape: try → service client → insert → catch → `console.warn` → void. |

**Installation:** none. `npm view` not applicable — zero new packages.

## Architecture Patterns

### Recommended file layout
```
supabase/migrations/
└── 20260624000004_phase112_credit_ledger.sql   # credit_ledger + companies.credit_balance column + RLS + indexes

lib/billing/
├── credit-ledger.ts        # NEW: recordCreditDebit, grantCredits, checkCredits, reconcileBalance, debitIdemKey
├── billing-config.ts       # MODIFY: add enforcementEnabled (default false) to BillingConfig + DEFAULT_BILLING_CONFIG
└── record-ai-cost.ts       # DO NOT TOUCH — measure-only guard locks it (see Pitfall 2)

lib/
├── entitlements.ts         # MODIFY: add monthlyCreditGrant to Entitlements + all 4 tiers
└── inngest/functions/
    ├── generate-estimate.ts  # MODIFY: add step.run('record-credit-debit') after record-usage
    ├── analyze-photos.ts     # MODIFY: same
    └── transcribe-audio.ts   # MODIFY: same (note: this job uses void recordAICost, not a step — see Pattern 2)

tests/unit/billing/
├── credit-ledger.test.ts            # debit math, never-throw, idempotency, enforcement-gate-off-allows
├── credit-ledger-migration.test.ts  # static SQL contract (mirrors ai-cost-events-migration.test.ts)
└── ...
```

### Pattern 1: The `credit_ledger` table (CREDIT-01)
**What:** Append-only, one row per credit movement, tenant-readable.
**Columns (confirmed against SEED-035 §2 + adapted to repo conventions):**
```sql
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delta_credits   INTEGER NOT NULL,          -- signed: debit negative, grant/topup positive
  reason          TEXT NOT NULL CHECK (reason IN ('grant','debit','topup','adjust')),
  operation_type  TEXT CHECK (operation_type IN ('estimate','photo_batch','audio_minutes','price_research')),  -- NULL for grant/topup/adjust
  ref_id          TEXT,                       -- attempt_id for debits, stripe event id for grants/topups
  real_cost_usd   NUMERIC(12,6),              -- nullable: provenance of a debit; NULL for grant/topup/adjust
  markup          NUMERIC(6,3),               -- the markup applied at debit time (audit/forensics); NULL for non-debits
  balance_after   INTEGER NOT NULL,           -- running balance snapshot after this row
  idempotency_key TEXT,                       -- dedup; partial-unique with company_id (see Pattern 6)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
**Why `INTEGER` for credits:** denomination is 1 credit = $0.01, so credits are whole units (the seed says "9.000 créditos"). Money/credit-count = integer; only `real_cost_usd` (provenance) and `markup` are fractional. This mirrors the Phase-111 decision "money stored as INTEGER CENTS".

**RLS (CREDIT-03 + Phase 115 readability) — DIFFERENT from `ai_cost_events`:**
- `ai_cost_events` is **service-role-only** (super-admin SELECT) because it is platform cost forensics.
- `credit_ledger` must be **tenant-readable** so the OWNER sees balance/history. Mirror the Phase 94 invoices RLS exactly:
```sql
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_ledger_select" ON public.credit_ledger FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));
-- NO client INSERT/UPDATE/DELETE policies: ledger is append-only and written ONLY by the service role (bypasses RLS).
```
> The Phase 82 migration ends with an assertion that fails the build if any policy references `companies.user_id`. **Must use the `company_members` subquery**, never `companies.user_id`.

**Indexes:** `(company_id, created_at DESC)` for history reads; partial unique `(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL` for debit dedup.

### Pattern 2: Where the debit fires (CREDIT-02) — THE LOAD-BEARING DECISION
**Confirmed two-seam reality in the code:**

| Seam | File | Context available | Fires |
|------|------|-------------------|-------|
| Provider level | `lib/ai/providers/openrouter.ts:215`, `lib/ai/openrouter-client.ts:210,305`, `transcribe-audio.ts:195` | `attemptId`, `operationType`, `companyId`, `projectId`, `realCostUsd` (just read from `usage.cost`) | `void recordAICost(...)` (never-throw, fire-and-forget) |
| Job level | `generate-estimate.ts:174`, `analyze-photos.ts:158` | `companyId`, `requestId` (the idempotency key) | `await step.run('record-usage', …)` |

**Recommendation: a SEPARATE `recordCreditDebit` helper, called from a new `step.run('record-credit-debit')` in each Inngest job — NOT from inside `recordAICost`.**

Reasons (all verified):
1. **The measure-only guard forbids it in `recordAICost`.** `tests/unit/billing/measure-only-invariant.test.ts` fails CI if `credit`/`debit`/`ledger`/`balance`/`markup` or any charging import appears in `lib/billing/record-ai-cost.ts`. Phases 110-01 and 110-03 both already hit this guard and had to reword *comments*. Adding debit code there is a hard CI failure. (Confidence: HIGH — guard read in full.)
2. **The provider seam has no idempotency key.** `recordAICost` correlation rides on `attemptId` only; the retry-stable idempotency key (`requestId`) lives at the job's `record-usage` step. The debit needs idempotency (CREDIT-06), so it belongs where that key exists.
3. **Retry isolation.** Phase-67 already split `record-usage` into its own `step.run` "so a DB write failure can retry independently" and so Anthropic is never re-charged. A `record-credit-debit` step inherits the same property — and runs only on AI success (debits only successful spend).

**The debit step reads cost back from `ai_cost_events`:** because `recordAICost` writes `ai_cost_events` keyed by `attempt_id`, the debit step queries `SELECT real_cost_usd FROM ai_cost_events WHERE attempt_id = $attemptId` (summing rows for multi-call ops like photo_batch / multiple vision calls), then computes and inserts the debit. This keeps the debit *derived from the same real cost* (CREDIT-02 intent) without re-instrumenting the provider path.

> **Eventual-consistency caveat (MEDIUM):** `recordAICost` is fire-and-forget (`void`), so the `ai_cost_events` row may not be committed when the `record-credit-debit` step runs in the same job tick. Two safe options for the planner: (a) the debit step awaits a short read with a small retry, OR (b) thread the already-known `realCostUsd` from the AI result into the Inngest step directly (cleaner — `generateEstimateForProject`/the vision result already had `usage.cost` in hand). Option (b) avoids the read-back race entirely and is recommended where the cost value is reachable at the job level. Flag for the plan to choose per-job.

**Debit math (exact):**
```ts
// debit_credits = round(real_cost_usd × markup / creditUnitUsd)
const cfg = await getBillingConfig()
const credits = Math.round((realCostUsd * cfg.markup) / cfg.creditUnitUsd)
// realCostUsd === null (provider gave no cost) → debit 0 credits, NEVER guess (null-vs-0 discipline carries through)
```

### Pattern 3: Fast-read balance (CREDIT-03)
**Recommendation: cached `companies.credit_balance INTEGER NOT NULL DEFAULT 0` column, updated in the SAME service-role write as each ledger insert, plus a `reconcileBalance()` SUM helper.**

- Migration adds the column: `ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 0;` (NOT NULL + DEFAULT 0 backfills all rows atomically — same technique as Phase 55's `tier` column).
- On every ledger write, the helper computes `balance_after = currentBalance + delta` and updates `companies.credit_balance = balance_after`. Write the ledger row and the balance update with the same service client. (A SQL trigger or an RPC could make this atomic; given the project has no triggers and prefers app-layer logic — see `recordUsage`'s app-layer dedup — a TS helper that reads-current-then-writes-both is consistent with the codebase. The planner may upgrade to a Postgres function for true atomicity; document it as Claude's discretion.)
- `reconcileBalance(companyId)`: `SELECT COALESCE(SUM(delta_credits),0) FROM credit_ledger WHERE company_id = $1` → write it back to `companies.credit_balance`. The reconcile function is the source-of-truth repair path the seed calls "reconcilable".
- **Why cached, not SUM-on-read:** `checkCredits` runs before every AI op (hot path); a per-op SUM over a growing append-only table is the classic ledger pitfall (Pitfall 3). A single-column read is O(1).

### Pattern 4: `monthlyCreditGrant` (CREDIT-04)
- Add `monthlyCreditGrant: number` to the `Entitlements` type and all four tiers in `lib/entitlements.ts`. **But** the authoritative runtime value is `billing_config.tiers[tier].monthlyCreditGrant` (already present in `DEFAULT_BILLING_CONFIG`: free 0 / trial 2000 / pro 9000 / business 30000). The entitlements field is the static/fallback shape; the grant *amount* used at grant time is read from `getBillingConfig()` (BILLCFG-03 — no hard-coded billing numbers). Recommendation: the `Entitlements.monthlyCreditGrant` mirrors the config defaults so static callers stay null-safe, exactly as `maxPriceResearchPerMonth` was added in Phase 108.
- Add a `grantCredits(companyId, credits, { reason: 'grant'|'topup', refId, idempotencyKey })` helper to `credit-ledger.ts`. **The granting itself (on `invoice.paid`) is Phase 113** — this phase only ships the helper the webhook will call, plus a unit test. Mark it dormant-but-tested (mirrors how Phase 111 shipped `getBillingConfig` dormant).

### Pattern 5: `checkCredits` gate (CREDIT-05) + the enforcement flag
**Recommendation signature:** `checkCredits(companyId, estimatedCredits?): Promise<{ allowed: boolean; balance: number; shortfall: number }>`.
- Reads `companies.credit_balance` (fast path), compares to an estimated/minimum cost.
- **Gated by `enforcementEnabled` (new `billing_config` flag, default `false`):** when enforcement is OFF (the entire pre-calibration period — CALIB-02/Phase 116 flips it on), `checkCredits` **always returns `{ allowed: true }`** while still reporting `balance`/`shortfall` for UI. This makes Phase 112 safe to ship: debits are RECORDED (so calibration has data) but nothing BLOCKS. (See Pitfall 5.)
- **Where called:** mirror the existing `checkQuota` 402 pattern. The estimate/transcribe/analyze-photos routes already do `const { allowed } = await checkQuota(...); if (!allowed) return 402 { error, upgradeUrl }` (`app/api/generate-estimate/route.ts:80-86`). `checkCredits` slots in alongside `checkQuota` at the same pre-dispatch point, returning a **top-up path** (`upgradeUrl`/`topUpUrl`) rather than a hard mid-flow throw. Because enforcement is off this phase, the gate is wired but inert until Phase 116.
- **No new flag exists yet:** `BillingConfig` (Phase 111) has `meteredOperations` and `lowBalanceThresholds` but NO `enforcementEnabled`. Adding it is a one-field, backward-compatible extension of `BillingConfig` + `DEFAULT_BILLING_CONFIG` (default `false`) + the zod `billingConfigSchema`. The deep-merge reader already tolerates rows written before a field existed. (Confidence: HIGH — `billing-config.ts` read in full.)

### Pattern 6: Idempotency (CREDIT-06)
**Reuse the `usage_events` mechanism verbatim:**
- Partial unique index `(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- Check-then-insert + swallow `23505` (do NOT use `.upsert(onConflict)` — `recordUsage`'s comment documents that supabase-js can't supply the partial-index predicate as an arbiter; it raised "no unique or exclusion constraint matching the ON CONFLICT specification" and broke estimate jobs).
- **Debit idempotency key shape:** `${attemptId}:debit:${operation_type}` (e.g. `a1b2…:debit:estimate`). This keys on the attempt + op, so a retried Inngest step never double-debits. (The seed/prompt suggested exactly this shape.)
- **Grant idempotency key shape (for Phase 113's reuse):** `${stripeEventId}:grant:${tier}` — distinct namespace, reuses `stripe_processed_events` concept; out of scope to wire here but the helper accepts the key.

### Anti-Patterns to Avoid
- **Adding any debit/credit/ledger token to `lib/billing/record-ai-cost.ts`** — CI fails (Pitfall 2).
- **SUM-on-read for balance** on the hot `checkCredits` path (Pitfall 3).
- **`.upsert({ onConflict: 'company_id,idempotency_key' })`** for dedup — breaks against the partial index (documented in `recordUsage`).
- **Coercing `realCostUsd ?? 0` into a debit** — a null cost (provider gave none) must debit 0, not a guessed value; the null-vs-0 discipline from Phase 110 carries forward.
- **Throwing on the debit path** — a ledger failure must not break generation (never-throw, like `recordAICost`).
- **Hard-coding markup/creditUnitUsd/grant** — read from `getBillingConfig()` at call time (BILLCFG-03).
- **Blocking generation this phase** — enforcement is off until Phase 116.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debit/grant idempotency | A new dedup scheme | Copy `recordUsage`'s partial-index + 23505-swallow | CREDIT-06 mandates reuse; the upsert pitfall is already solved & documented |
| Tenant RLS on the ledger | Bespoke policy | Copy Phase 94 invoices `company_members` SELECT | Phase 82 assertion fails the build otherwise; invoices is the proven financial-table template |
| Runtime billing params | Constants / env vars | `getBillingConfig()` | BILLCFG-03 non-negotiable; the reader exists & is dormant waiting for this phase |
| Real-cost source | Re-read `usage.cost` at the job | `ai_cost_events` rows by `attempt_id` (or thread the value through) | Phase 110 already captured it; re-instrumenting risks divergence |
| Never-throw side effect | New try/catch convention | Mirror `recordAICost` shape | One consistent best-effort pattern across cost/pipeline/credit writes |
| Migration safety | Hand-written DDL | Mirror `phase94_invoices` + `phase110_ai_cost_events` headers/conventions | Idempotent, NUMERIC, TEXT+CHECK, not-applied-to-remote — all repo norms |

**Key insight:** This phase is almost entirely *composition of existing primitives* (Phase 56 idempotency + Phase 82/94 RLS + Phase 110 cost capture + Phase 111 config). The only genuinely new code is the debit math and the balance cache. Resist inventing new mechanisms.

## Common Pitfalls

### Pitfall 1: Wrong RLS posture (copying `ai_cost_events` instead of `invoices`)
**What goes wrong:** Cloning the Phase 110 `ai_cost_events` migration (the most recent, most similar-looking one) gives a **service-role-only / super-admin-SELECT** table. Then Phase 115's owner-facing balance widget can't read the ledger.
**Why:** `ai_cost_events` is platform forensics; `credit_ledger` is tenant-visible billing history.
**How to avoid:** Copy the **`invoices`** RLS block (`company_members` SELECT), not `ai_cost_events`. Writes still go through the service role (which bypasses RLS).
**Warning sign:** the migration has a `platform_admins` EXISTS clause instead of a `company_members` subquery.

### Pitfall 2: Tripping the Phase-110 measure-only static guard
**What goes wrong:** Putting debit logic (or even the words credit/debit/ledger/balance/markup) into `lib/billing/record-ai-cost.ts` fails `tests/unit/billing/measure-only-invariant.test.ts` in CI.
**Why:** The guard statically scans that exact file for forbidden charging tokens and charging imports.
**How to avoid:** All debit code lives in the NEW `lib/billing/credit-ledger.ts`. Do not touch `record-ai-cost.ts`. (Both Phase 110 plans already hit this guard on mere comments — it is strict.)
**Warning sign:** any diff to `lib/billing/record-ai-cost.ts`.

### Pitfall 3: Balance drift / slow SUM-on-read
**What goes wrong:** Computing balance as a live `SUM(delta_credits)` on every `checkCredits` call gets slow as the append-only table grows, and ad-hoc balance writes drift from the ledger.
**Why:** Classic ledger anti-pattern — the running total and the event log disagree after a partial failure.
**How to avoid:** Single cached `companies.credit_balance`, updated atomically-as-possible with each ledger write, plus a `reconcileBalance()` that recomputes the SUM and repairs the cache. Snapshot `balance_after` on each row so any single row is self-describing.
**Warning sign:** `checkCredits` issuing an aggregate query.

### Pitfall 4: Special-casing MCP zero-debit (CREDIT-07) when it's automatic
**What goes wrong:** Writing an explicit "if MCP, skip debit" guard — adding a channel coupling the architecture deliberately avoids.
**Why:** A debit is derived from an `ai_cost_events` row, and that row only exists where WE spend AI. MCP external-assistant *conversation* runs on the user's assistant (their spend) → no cost row → no debit. When MCP triggers OUR generation, that fires `recordAICost` like any channel → debits normally.
**How to avoid:** Do nothing special. Document that CREDIT-07 holds *by construction* (the seed's central insight). The only honest check: confirm the four metered ops are the *only* things that write `ai_cost_events` with a chargeable cost (they are — `estimate`/`photo_batch`(vision)/`audio_minutes`/`price_research`; `translation`/`vision` are sub-calls of those ops, see Open Question 2).
**Warning sign:** a `channel === 'mcp'` branch anywhere in the debit path.

### Pitfall 5: Shipping enforcement ON before calibration
**What goes wrong:** `checkCredits` blocks real users this phase, on the illustrative (un-calibrated) `DEFAULT_BILLING_CONFIG` numbers — violating "calibrate before charging" and risking blocking paying customers on guessed grants.
**Why:** The grant/markup defaults are explicitly placeholders (flagged CALIB-02 in `billing-config.ts`).
**How to avoid:** Add `enforcementEnabled: false` to `billing_config`; `checkCredits` returns `allowed: true` whenever it's false. Debits still RECORD (calibration needs the data). Phase 116 flips the flag after deriving real numbers.
**Warning sign:** `checkCredits` returning `allowed: false` while `enforcementEnabled` is false.

### Pitfall 6: Eventual-consistency race reading `ai_cost_events` back
**What goes wrong:** The `record-credit-debit` step reads `ai_cost_events` for the attempt and finds nothing because `void recordAICost(...)` hasn't committed yet.
**Why:** Cost capture is fire-and-forget; the debit step may run before the async insert lands.
**How to avoid:** Prefer threading the known `realCostUsd` directly into the Inngest step where reachable (Pattern 2 option b); otherwise add a bounded read-retry. Treat a not-found cost as "debit deferred/skipped", never as 0-and-done.
**Warning sign:** debits intermittently missing for fast jobs.

## Code Examples

### The never-throw debit helper (shape mirrors `recordAICost`)
```ts
// lib/billing/credit-ledger.ts  (NEW — NOT record-ai-cost.ts)
// Source pattern: lib/billing/record-ai-cost.ts (never-throw) + lib/quota.ts (idempotency)
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig } from '@/lib/billing/billing-config'

const PG_UNIQUE_VIOLATION = '23505'

export function debitIdemKey(attemptId: string, op: string): string {
  return `${attemptId}:debit:${op}`
}

export async function recordCreditDebit(input: {
  companyId: string
  operationType: 'estimate' | 'photo_batch' | 'audio_minutes' | 'price_research'
  realCostUsd: number | null
  attemptId: string
}): Promise<void> {
  try {
    if (input.realCostUsd == null) return // null cost → no debit (never guess; null-vs-0)
    const svc = requireServiceClient()
    const cfg = await getBillingConfig()
    const credits = Math.round((input.realCostUsd * cfg.markup) / cfg.creditUnitUsd)
    if (credits <= 0) return
    const key = debitIdemKey(input.attemptId, input.operationType)

    // dedup: check-then-insert (mirror recordUsage; do NOT use upsert onConflict)
    const { data: existing } = await svc.from('credit_ledger')
      .select('id').eq('company_id', input.companyId).eq('idempotency_key', key)
      .limit(1).maybeSingle()
    if (existing) return

    // read current cached balance, compute balance_after, write ledger + balance
    const { data: co } = await svc.from('companies')
      .select('credit_balance').eq('id', input.companyId).single()
    const current = (co as { credit_balance?: number } | null)?.credit_balance ?? 0
    const balanceAfter = current - credits

    const { error } = await svc.from('credit_ledger').insert({
      company_id: input.companyId,
      delta_credits: -credits,
      reason: 'debit',
      operation_type: input.operationType,
      ref_id: input.attemptId,
      real_cost_usd: input.realCostUsd,
      markup: cfg.markup,
      balance_after: balanceAfter,
      idempotency_key: key,
    })
    if (error && (error as { code?: string }).code !== PG_UNIQUE_VIOLATION) throw error
    await svc.from('companies').update({ credit_balance: balanceAfter }).eq('id', input.companyId)
  } catch (err) {
    console.warn('[recordCreditDebit] swallowed write failure:', err) // never break generation
  }
}
```

### Wiring the debit step into an Inngest job (after record-usage)
```ts
// lib/inngest/functions/generate-estimate.ts — after the existing step.run('record-usage', …)
// Source: the existing record-usage step (lines 174-177)
await step.run('record-credit-debit', async () => {
  await recordCreditDebit({
    companyId,
    operationType: 'estimate',
    realCostUsd, // threaded from the AI result (preferred) OR read back from ai_cost_events by attemptId
    attemptId,
  })
})
```

### `checkCredits` gated by enforcement
```ts
// lib/billing/credit-ledger.ts
import type { SupabaseClient } from '@supabase/supabase-js'
export async function checkCredits(
  supabase: SupabaseClient, companyId: string, estimatedCredits = 0
): Promise<{ allowed: boolean; balance: number; shortfall: number }> {
  const cfg = await getBillingConfig()
  const { data } = await supabase.from('companies').select('credit_balance').eq('id', companyId).single()
  const balance = (data as { credit_balance?: number } | null)?.credit_balance ?? 0
  const shortfall = Math.max(0, estimatedCredits - balance)
  if (!cfg.enforcementEnabled) return { allowed: true, balance, shortfall } // measure-only: never block
  return { allowed: shortfall === 0, balance, shortfall }
}
```

## State of the Art

| Old Approach (count-based, current prod) | Current Approach (this milestone) | When | Impact |
|------------------------------------------|-----------------------------------|------|--------|
| `usage_events` count vs `maxEstimatesPerMonth`/`maxEstimatesPerDay` | Credit ledger: `real_cost × markup` debit | v4.7 | Counts degrade to secondary guard-rails (MIG-01, Phase 113); both run in parallel during transition |
| Quota 402 hard-block at route | `checkCredits` top-up path, enforcement-gated | v4.7 | No silent mid-job block; inert until Phase 116 calibration |

**Not deprecated, runs in parallel:** `checkQuota`/`recordUsage` stay live this milestone (MIG-01). Phase 112 ADDS the credit track beside them — it does not remove the count-based path.

## Open Questions

1. **Does `price_research` get a debit step?** It is metered via `recordUsage` in `lib/estimate/price-research/orchestrator.ts:276` (NOT in an Inngest job), and its cost is captured by `recordAICost` at the OpenRouter-web call. The debit seam there is the orchestrator, not a `step.run`. 
   - What we know: it's one of the four CREDIT-02 ops; cost lands in `ai_cost_events`.
   - What's unclear: whether to debit inline in the orchestrator (never-throw) or batch it.
   - Recommendation: debit inline right after `recordUsage` in the orchestrator, reusing the same `buildIdemKey`-style key but in the `:debit:` namespace; never-throw. Let the plan confirm the exact insertion point.

2. **`vision` and `translation` operation_types.** `ai_cost_events` has six op types (`estimate`,`photo_batch`,`audio_minutes`,`price_research`,`translation`,`vision`) but the ledger CHECK should list only the FOUR chargeable user-facing ops. `vision` cost is the per-photo sub-call that rolls up into the `photo_batch` debit; `translation` is absorbed (not a CREDIT-02 op).
   - Recommendation: the debit reads/aggregates `ai_cost_events` for the attempt and attributes the debit to the user-facing op (`photo_batch`), not the sub-call (`vision`). Confirm the photo-batch debit sums all `vision` rows for that attempt.

3. **Atomicity of ledger-insert + balance-update.** Two separate service-client statements can drift on a partial failure (reconcile repairs it). 
   - Recommendation: acceptable for measure-only (enforcement off); the planner may elevate to a Postgres function/RPC for true atomicity if desired. Document as discretion.

## Environment Availability

Step 2.6: SKIPPED — this phase is code + a Supabase migration only. No new external tools/services/runtimes. The migration is authored, not applied (CI→GHCR→Coolify owns deploy), so no live DB connection is required at plan/execute time. `gen_random_uuid`, RLS, partial indexes, `NUMERIC`/`INTEGER` — all already used by existing migrations on the same Postgres.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (installed) |
| Config file | repo `vitest.config.*` (existing; Phase 110/111 tests run under it) |
| Quick run command | `npx vitest run tests/unit/billing` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CREDIT-01 | `credit_ledger` table shape + tenant `company_members` RLS + append-only (no client write policies) | static migration contract | `npx vitest run tests/unit/billing/credit-ledger-migration.test.ts` | ❌ Wave 0 |
| CREDIT-02 | `recordCreditDebit` computes `round(cost×markup/unit)`, debits negative delta | unit | `npx vitest run tests/unit/billing/credit-ledger.test.ts` | ❌ Wave 0 |
| CREDIT-03 | `companies.credit_balance` column updated on write; `reconcileBalance` = SUM(deltas) | unit + migration contract | `npx vitest run tests/unit/billing/credit-ledger.test.ts` | ❌ Wave 0 |
| CREDIT-04 | `monthlyCreditGrant` on all 4 tiers; `grantCredits` writes a positive grant row | unit | `npx vitest run tests/unit/entitlements.test.ts` + credit-ledger.test.ts | ⚠️ extend entitlements.test.ts |
| CREDIT-05 | `checkCredits` returns `{allowed,balance,shortfall}`; `allowed:true` always when `enforcementEnabled:false` | unit | `npx vitest run tests/unit/billing/credit-ledger.test.ts` | ❌ Wave 0 |
| CREDIT-06 | Retried debit (same `${attemptId}:debit:${op}` key) inserts once; 23505 swallowed | unit | `npx vitest run tests/unit/billing/credit-ledger.test.ts` | ❌ Wave 0 |
| CREDIT-07 | No-cost-row attempt → no debit; never-throw on ledger failure | unit | `npx vitest run tests/unit/billing/credit-ledger.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing` (+ `tests/unit/entitlements.test.ts` when touched)
- **Per wave merge:** `npx vitest run` (full suite — Phase 111 baseline was 283 files / 1986 green)
- **Phase gate:** Full suite green + `npx tsc --noEmit -p tsconfig.json` clean on touched files before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/billing/credit-ledger-migration.test.ts` — static SQL contract (table, `company_members` RLS, no client write policies, partial unique index, `companies.credit_balance` column). Mirror `tests/unit/billing/ai-cost-events-migration.test.ts` + `invoices-migration.test.ts`.
- [ ] `tests/unit/billing/credit-ledger.test.ts` — debit math, never-throw, idempotency dedup, enforcement-off-always-allows, grantCredits, reconcileBalance.
- [ ] Extend `tests/unit/entitlements.test.ts` — `monthlyCreditGrant` present on all 4 tiers (mirror the Phase-108 `maxPriceResearchPerMonth` extension).
- [ ] Extend `tests/unit/billing/billing-config.test.ts` — `enforcementEnabled` default `false`, schema round-trip.
- [ ] (Recommended) a channel-neutrality static grep test: `lib/billing/credit-ledger.ts` imports no `lib/whatsapp/*` (project norm).
- No framework install needed — Vitest is configured and the `tests/unit/billing/` directory already holds 14 test files.

## Sources

### Primary (HIGH confidence — repo source, read in full)
- `supabase/migrations/20260619000001_phase94_invoices.sql` — tenant-readable financial table RLS template (`company_members` SELECT, no DELETE, FK CASCADE, integer cents CHECK).
- `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` + `lib/quota.ts:177-208` — partial-unique-index idempotency + 23505-swallow (the upsert-onConflict pitfall).
- `supabase/migrations/20260624000003_phase110_ai_cost_events.sql` + `lib/billing/record-ai-cost.ts` — migration conventions + never-throw side-effect shape + the real-cost source.
- `tests/unit/billing/measure-only-invariant.test.ts` — the CI guard locking `record-ai-cost.ts` (proves the debit must live elsewhere).
- `lib/billing/billing-config.ts` — `getBillingConfig`, `DEFAULT_BILLING_CONFIG` (markup 4.5, creditUnitUsd 0.01, per-tier grants), deep-merge reader, 30s TTL cache. Confirmed NO `enforcementEnabled` field exists yet.
- `lib/entitlements.ts` — `Entitlements` type + 4 tiers; the Phase-108 `maxPriceResearchPerMonth` precedent for adding a field.
- `lib/inngest/functions/{generate-estimate,analyze-photos,transcribe-audio}.ts` — the `step.run('record-usage')` seam + the provider-level `void recordAICost` seam (the two-seam reality).
- `lib/ai/providers/openrouter.ts:215`, `lib/ai/openrouter-client.ts:210,305` — provider-level cost capture context.
- `app/api/generate-estimate/route.ts:80-86` — the `checkQuota` 402 pre-dispatch pattern `checkCredits` mirrors.
- `supabase/migrations/20260526000001_phase82_rls_company_members.sql` — the `company_members` RLS rewrite + the build-failing assertion against `companies.user_id`.
- `.planning/REQUIREMENTS.md`, `.planning/seeds/SEED-035`, `.planning/STATE.md` — locked decisions, table shape, phase boundaries.

### Secondary (MEDIUM confidence)
- Eventual-consistency note on `void recordAICost` vs the debit read-back (inferred from the fire-and-forget pattern; flagged as Open Question / Pitfall 6 for the plan to resolve).

### Tertiary (LOW confidence)
- None — every recommendation is grounded in repo source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every module/library is already in the repo and read directly.
- Architecture (table shape, RLS, two-seam debit, idempotency, balance cache, enforcement flag): HIGH — each maps to an existing, verified precedent (94/56/82/110/111).
- Debit fire timing (read-back vs thread-through) + price_research seam: MEDIUM — two valid options surfaced as Open Questions for the plan to pick.
- Pitfalls: HIGH — Pitfall 2 (measure-only guard) and Pitfall 1 (RLS posture) are read directly from the guard test and the two candidate migrations.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (stable — internal codebase, no fast-moving external deps). Re-verify only if Phases 110/111 files change before 112 executes.
