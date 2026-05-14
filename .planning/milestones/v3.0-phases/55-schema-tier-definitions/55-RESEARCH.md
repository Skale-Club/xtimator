# Phase 55: Schema + Tier Definitions - Research

**Researched:** 2026-05-13
**Domain:** PostgreSQL live migration safety, TypeScript entitlements pattern, Supabase RLS for write-only tables
**Confidence:** HIGH

## Summary

Phase 55 is a pure infrastructure phase: it adds six columns to `companies`, creates a new `usage_events` table, and establishes `lib/entitlements.ts` as the authoritative tier definition. All subsequent v3.0 phases consume this output.

The migration is safe to apply to a live table. `tier TEXT NOT NULL DEFAULT 'free'` fills all existing rows atomically at DDL time — no backfill script needed. The five nullable TIMESTAMPTZ and TEXT columns (`tier_trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `tier_renews_at`, `tier_cancelled_at`) are straightforward `ALTER TABLE ... ADD COLUMN` operations with no default needed, matching the established Phase 24/38 pattern.

The `createOrUpdateCompany()` function uses a SELECT-then-INSERT/UPDATE pattern. TIER-04 (new companies get `tier_trial_ends_at = now() + 14 days`) is best handled at the **application layer in the INSERT branch** — not via a SQL DEFAULT, and not via a trigger. A DEFAULT cannot use `NOW() + interval` as a computed expression for per-row business logic (it would run on every INSERT including admin-initiated ones); a trigger is heavyweight for a single-column. The INSERT branch in `createOrUpdateCompany()` is the only code path that creates a company row, making it the safest and most auditable location.

The `Infinity` problem for unlimited tiers is well-known. The resolution used across the TypeScript ecosystem: represent "no limit" as `null` in the `Entitlements` type (`number | null`) and document the contract. This is JSON-safe, TypeScript-expressible, and makes intent explicit at the check site: `if (limit !== null && used >= limit)`.

**Primary recommendation:** One migration file, one `lib/entitlements.ts` file, one patch to `createOrUpdateCompany()` INSERT branch. No triggers, no DB functions.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TIER-01 | `companies` table gains columns: `tier` (TEXT NOT NULL DEFAULT 'free'), `tier_trial_ends_at` (TIMESTAMPTZ), `stripe_customer_id` (TEXT), `stripe_subscription_id` (TEXT), `tier_renews_at` (TIMESTAMPTZ), `tier_cancelled_at` (TIMESTAMPTZ) | ADD COLUMN safe on live table; DEFAULT fills existing rows atomically; nullable columns need no default |
| TIER-02 | `usage_events` table with UUID PK, company_id FK, event_type, units NUMERIC, metadata JSONB, created_at + index on (company_id, created_at DESC) | Matches estimate_activity pattern; JSONB used in 3 existing tables; RLS: ENABLE with no policies = service-role writes only |
| TIER-03 | `lib/entitlements.ts` exports tier definitions (free / trial / pro / business) with per-tier limits | No existing entitlements.ts in project; lib/errors/ pattern is the closest structural analog; `null` replaces `Infinity` |
| TIER-04 | New companies start with `tier='free'` and `tier_trial_ends_at = now() + 14 days` | Application layer INSERT branch in `createOrUpdateCompany()` — safest and most auditable; `tier` gets DEFAULT 'free' from migration so it applies everywhere |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL via Supabase | managed | ADD COLUMN migrations on live tables | Already in use; bunx supabase db push --db-url applies migrations |
| TypeScript strict | project-locked | Entitlements type definitions | CLAUDE.md constraint |
| Supabase JS v2 | existing | Client for queries | Already in use via createServiceClient() |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | existing | Unit tests for entitlements module | Wave 0 stub follows established test pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `null` for unlimited | `Infinity` | `Infinity` does not serialize to JSON; breaks any JSON.stringify call on the tier config — confirmed pitfall in SEED-013 Open Questions |
| `null` for unlimited | Large number (999999) | Magic number — callers can't distinguish "no limit" from "very high limit"; `null` is semantically unambiguous |
| Application-layer trial start | DB DEFAULT `now() + interval '14 days'` | PostgreSQL DEFAULT expressions are evaluated per INSERT, not computed lazily — but trial_ends_at should only be set on first company creation, not on subsequent UPSERTs or admin-initiated inserts. Application layer INSERT branch is unambiguous. |
| Application-layer trial start | DB trigger | Triggers are opaque, hard to test, and bypass application-layer logic. Not needed for single-column initialization. |

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── entitlements.ts          # NEW: authoritative tier definitions + TierName + Entitlements types
supabase/migrations/
└── 20260513000001_phase55_subscription_tiers.sql  # NEW: ADD COLUMN + CREATE TABLE
types/
└── database.types.ts        # MANUALLY EXTENDED: add tier columns to companies Row/Insert/Update + usage_events table
lib/
├── actions/
│   └── company.ts           # PATCHED: INSERT branch adds tier_trial_ends_at
└── queries/
    └── company.ts            # EXTENDED: add getCompanyTier() focused query
```

### Pattern 1: Safe ADD COLUMN on Live Table

**What:** PostgreSQL `ALTER TABLE ... ADD COLUMN` acquires an `ACCESS EXCLUSIVE` lock briefly, but with a DEFAULT value the column fill happens at DDL time (Postgres 11+: instant metadata update for volatile-free defaults). For nullable columns, the lock is even lighter.

**When to use:** Any time new columns are added to tables with existing rows.

**Rules for this migration:**
- `tier TEXT NOT NULL DEFAULT 'free'` — safe: DEFAULT fills existing rows at DDL application time, lock duration is milliseconds
- `tier_trial_ends_at TIMESTAMPTZ` — nullable, no default needed, lock is minimal
- `stripe_customer_id TEXT`, `stripe_subscription_id TEXT`, `tier_renews_at TIMESTAMPTZ`, `tier_cancelled_at TIMESTAMPTZ` — all nullable, safe

```sql
-- Source: established Phase 38 pattern (custom_domain) + PostgreSQL documentation on ADD COLUMN
-- Migration filename: 20260513000001_phase55_subscription_tiers.sql

-- COMPANIES: add subscription tier columns
ALTER TABLE companies
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'trial', 'pro', 'business'));

ALTER TABLE companies
  ADD COLUMN tier_trial_ends_at TIMESTAMPTZ;

ALTER TABLE companies
  ADD COLUMN stripe_customer_id TEXT;

ALTER TABLE companies
  ADD COLUMN stripe_subscription_id TEXT;

ALTER TABLE companies
  ADD COLUMN tier_renews_at TIMESTAMPTZ;

ALTER TABLE companies
  ADD COLUMN tier_cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.tier IS
  'Subscription tier: free | trial | pro | business. DEFAULT free = all existing companies start as free.';

COMMENT ON COLUMN companies.tier_trial_ends_at IS
  'When the free trial expires. NULL for companies not on trial or already upgraded. Set to now()+14 days on first company INSERT.';
```

### Pattern 2: usage_events Table — Service-Role Write Only

**What:** `usage_events` records AI consumption. No authenticated user should SELECT or INSERT directly — only the server-side service role (webhook, generate-estimate route) writes to it. This matches the `company_whatsapp`, `whatsapp_sessions`, and `whatsapp_processed_messages` pattern from Phase 40: `ENABLE ROW LEVEL SECURITY` with **no policies** = deny all for anon + authenticated; service role bypasses RLS.

**When to use:** Any table that is exclusively written by server-side service-role code and should never be client-accessible.

```sql
-- Source: Phase 40 migration pattern (company_whatsapp, whatsapp_processed_messages)

CREATE TABLE usage_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,  -- 'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'
  units        NUMERIC,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS policies: deny-all for anon/authenticated. Service role bypasses RLS.
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Index for quota queries: "how many estimates this month for company X?"
CREATE INDEX usage_events_company_created
  ON usage_events(company_id, created_at DESC);

COMMENT ON TABLE usage_events IS
  'Rolling audit log of AI operations per company. Written by service role only. Enables quota checks and billing analytics.';
```

**JSONB precedent:** JSONB columns exist in `estimate_activity.metadata` (initial schema), `platform_admins.metadata` (Phase 19 admin migration), and `platform_branding.landing_content` (Phase 15). No special type handling needed.

### Pattern 3: lib/entitlements.ts — TierName + Entitlements Types

**What:** The codebase has no existing entitlements file. The closest structural analog is `lib/errors/codes.ts` — a plain TypeScript module exporting types + data records with no React dependencies. The entitlements file should follow the same pattern: types first, then `as const satisfies` records.

**Key design decision — `null` vs `Infinity`:**
- `Infinity` in the `tiers` Record does not serialize to JSON. If any logging, API response, or client payload ever touches the entitlements object, `Infinity` becomes `null` silently (JSON.stringify behavior), and `null` in a numeric field would be misread as "no limit" or would cause NaN comparisons.
- `null` is the correct representation for "no limit." The Entitlements type uses `number | null`. Quota checks read: `if (limit !== null && used >= limit) { ... }`.

```typescript
// Source: established codebase pattern (lib/errors/codes.ts, SEED-013 design)
// lib/entitlements.ts

export type TierName = 'free' | 'trial' | 'pro' | 'business'

export type Entitlements = {
  /** null = unlimited */
  maxEstimatesPerMonth: number | null
  /** null = unlimited */
  maxEstimatesPerDay: number | null
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
}

export const tiers: Record<TierName, Entitlements> = {
  free: {
    maxEstimatesPerMonth: 10,
    maxEstimatesPerDay: 3,
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: false,
    pdfEnabled: true,
    priceBookEnabled: false,
    customDomainEnabled: false,
  },
  trial: {
    maxEstimatesPerMonth: null,  // unlimited during trial
    maxEstimatesPerDay: 20,
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  },
  pro: {
    maxEstimatesPerMonth: 200,
    maxEstimatesPerDay: 30,
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  },
  business: {
    maxEstimatesPerMonth: null,  // unlimited
    maxEstimatesPerDay: 100,
    maxPhotosPerEstimate: 50,
    maxAudioMinutesPerEstimate: 30,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: true,
  },
}

/**
 * Get entitlements for a tier. Falls back to 'free' for unknown tier strings.
 * This is the only place that maps a DB tier string to an Entitlements object.
 */
export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free
}
```

### Pattern 4: createOrUpdateCompany() Trial Start — INSERT Branch Patch

**What:** The SELECT-then-INSERT/UPDATE pattern in `lib/actions/company.ts` already has a distinct INSERT branch (new company) and UPDATE branch (existing company). TIER-04 requires that only new companies get `tier_trial_ends_at`. The INSERT branch is the exact right place to add this.

**Why not a SQL DEFAULT:** `tier_trial_ends_at` is nullable — its absence means "not on trial / already upgraded." Existing rows must remain NULL. A SQL DEFAULT with an expression would set it on every INSERT including admin force-tier operations in Phase 60.

**Why not a trigger:** Triggers fire on every row INSERT regardless of caller. Application-layer logic is auditable, testable, and explicit.

```typescript
// Source: lib/actions/company.ts INSERT branch
// Patch: add tier_trial_ends_at to the INSERT-only row

// In the INSERT branch:
const trialEndsAt = new Date()
trialEndsAt.setDate(trialEndsAt.getDate() + 14)

const { error } = await supabase.from('companies').insert({
  ...row,
  // TIER-04: new companies start with a 14-day trial
  tier_trial_ends_at: trialEndsAt.toISOString(),
})
```

Note: `tier` itself does NOT need to be in the insert row — the migration DEFAULT 'free' handles it. Only `tier_trial_ends_at` needs explicit application-layer control.

### Pattern 5: Manual database.types.ts Extension

**What:** Docker is unavailable on Windows (established since Phase 19). All TypeScript type updates are manual. This is a documented codebase convention — the same pattern was used for Phase 24 (estimate_template_* columns) and Phase 38 (custom_domain).

**How:** Add new fields to the `companies` Row/Insert/Update interfaces in `types/database.types.ts`. Add the entire `usage_events` table entry. Match the JSON type conventions: `string | null` for nullable TEXT/TIMESTAMPTZ, `number | null` for nullable NUMERIC.

```typescript
// In types/database.types.ts, companies.Row — add after custom_domain:
tier: string               // TEXT NOT NULL DEFAULT 'free' — never null at DB level
tier_trial_ends_at: string | null  // TIMESTAMPTZ nullable
stripe_customer_id: string | null
stripe_subscription_id: string | null
tier_renews_at: string | null
tier_cancelled_at: string | null

// In companies.Insert — all optional (have DB defaults or nullable):
tier?: string
tier_trial_ends_at?: string | null
stripe_customer_id?: string | null
stripe_subscription_id?: string | null
tier_renews_at?: string | null
tier_cancelled_at?: string | null

// In companies.Update — same as Insert
// tier?: string
// etc.
```

For `usage_events`, add a full new table entry following the existing pattern (see `company_price_book` as structural reference — UUID PK, company_id FK, JSONB column).

### Pattern 6: getCompanyTier() Focused Query

**What:** Phase 56 and 57 will call `checkQuota()` which needs the company's tier. Following the established pattern from `getCustomDomainSettings()` and `getEstimateTemplateSettings()` — focused single-query functions, not `select('*')`.

```typescript
// lib/queries/company.ts — new addition
export async function getCompanyTier(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; tier: string; tier_trial_ends_at: string | null } | null> {
  const { data } = await supabase
    .from('companies')
    .select('id, tier, tier_trial_ends_at')
    .eq('user_id', userId)
    .single()

  return data ?? null
}
```

### Anti-Patterns to Avoid

- **`Infinity` in entitlements data:** Does not serialize to JSON. `JSON.stringify({ max: Infinity })` produces `{"max":null}` — silent data corruption. Use `number | null` with `null` meaning "no limit."
- **SQL DEFAULT for trial_ends_at:** Would apply on every INSERT including admin operations in Phase 60 force-tier scenarios. Use application-layer INSERT branch.
- **DB trigger for TIER-04:** Opaque, hard to unit test, runs on every INSERT regardless of context. Not needed.
- **`select('*')` for tier queries:** Pulls all 20+ company columns when only `tier` is needed. Use `select('id, tier, tier_trial_ends_at')`.
- **Regenerating database.types.ts:** Docker is unavailable on Windows. Manual extension is the established codebase convention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Unlimited" tier representation | Custom sentinel class or symbol | `null` (TypeScript `number \| null`) | JSON-safe, TypeScript-idiomatic, no serialization edge cases |
| DB type regeneration on Windows | Custom Docker workaround | Manual extension of `types/database.types.ts` | Established since Phase 19; Docker unavailable in this environment |

## Runtime State Inventory

> This phase is greenfield for all new columns — no existing runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `companies` table: all existing rows will have `tier='free'` after migration (via DEFAULT). `tier_trial_ends_at` stays NULL for existing rows — this is correct behavior (grandfathering policy: existing users are treated as free without a trial clock). | None — DEFAULT fills existing rows atomically |
| Live service config | No external services reference company tier or trial dates yet | None |
| OS-registered state | None — no OS-level registration of tier data | None |
| Secrets/env vars | No new env vars in Phase 55 | None |
| Build artifacts | None relevant | None |

**Grandfathering note (from REQUIREMENTS.md Decisions):** The spec states "Existing estimates after downgrade remain read-only forever." This phase adds the schema but does not enforce any downgrade for existing users — they will have `tier='free'` and `tier_trial_ends_at=NULL`, which means the trial expiry cron (Phase 60) will not touch them (it targets `tier='free' AND tier_trial_ends_at IS NOT NULL AND tier_trial_ends_at < NOW()`).

## Common Pitfalls

### Pitfall 1: `Infinity` JSON Serialization
**What goes wrong:** `JSON.stringify(tiers.trial)` produces `{"maxEstimatesPerMonth":null,...}` when the value is `Infinity`. Any logging, API response, or debugging that touches the tiers object loses the "unlimited" information silently.
**Why it happens:** JSON specification has no `Infinity` representation; `JSON.stringify` converts it to `null`.
**How to avoid:** Use `number | null` as the TypeScript type. `null` means "no limit." All quota check code reads: `if (limit !== null && used >= limit)`.
**Warning signs:** `tiers.trial.maxEstimatesPerMonth === null` after a JSON round-trip when it should be "unlimited."

### Pitfall 2: Setting tier_trial_ends_at in UPDATE branch
**What goes wrong:** If `tier_trial_ends_at` is added to the shared `row` object in `createOrUpdateCompany()`, the UPDATE branch (existing companies re-saving settings) would reset the trial clock on every settings save.
**Why it happens:** The `row` object is shared between INSERT and UPDATE paths.
**How to avoid:** Add `tier_trial_ends_at` only to the INSERT branch. The UPDATE branch `row` object must NOT include it.
**Warning signs:** Existing companies suddenly get a new trial end date after saving settings.

### Pitfall 3: Missing CHECK constraint on tier column
**What goes wrong:** A typo in application code (`tier='Trial'` with capital T, or `tier='enterprise'`) silently inserts an invalid tier string. Future `getEntitlements()` calls fall back to `free`, silently misconfiguring the company.
**Why it happens:** Without a CHECK constraint, PostgreSQL accepts any TEXT value.
**How to avoid:** Add `CHECK (tier IN ('free', 'trial', 'pro', 'business'))` in the migration — consistent with D-07/D-08 pattern (TEXT + CHECK, no Postgres enums). This matches `company_whatsapp.status` constraint pattern.

### Pitfall 4: `usage_events` accessible to authenticated users
**What goes wrong:** If RLS policies are added for authenticated users, a malicious user could query their own usage_events and potentially correlate timing with other users via created_at or count queries.
**Why it happens:** Copying the standard CRUD policy pattern instead of the WhatsApp service-role-only pattern.
**How to avoid:** `ENABLE ROW LEVEL SECURITY` with **no policies** = deny all for anon + authenticated. Service role bypasses RLS. This is the Phase 40 pattern for `company_whatsapp`, `whatsapp_sessions`, `whatsapp_processed_messages`.

### Pitfall 5: database.types.ts out of sync with migration
**What goes wrong:** TypeScript code in Phase 56/57 that reads `company.tier` gets type `any` or causes TS errors because the types file wasn't updated.
**Why it happens:** The migration is applied to the DB but `types/database.types.ts` is manually maintained (no Docker to regenerate).
**How to avoid:** Update `types/database.types.ts` in the same plan task as the migration. Add `tier: string` (NOT `tier: string | null` — the DB column is NOT NULL) and all five nullable columns.
**Warning signs:** TypeScript errors like `Property 'tier' does not exist on type...` or implicit `any`.

### Pitfall 6: Missing getCompanyTier() query in lib/queries/company.ts
**What goes wrong:** Phase 56 (checkQuota) and Phase 57 (enforcement) have no focused function to fetch tier data, causing developers to reach for `getCompanySettings()` which pulls all 25+ columns.
**Why it happens:** Phase 55 scope is schema + types + entitlements — easy to overlook adding the query helper that downstream phases will need.
**How to avoid:** Add `getCompanyTier()` to `lib/queries/company.ts` in Phase 55 Plan 01. This follows the established pattern from `getCustomDomainSettings()` (Phase 38) and `getEstimateTemplateSettings()` (Phase 24).

## Code Examples

### Migration: Complete Phase 55 Migration

```sql
-- supabase/migrations/20260513000001_phase55_subscription_tiers.sql
-- Phase 55: Schema + Tier Definitions
-- Adds subscription tier columns to companies and creates usage_events table.
-- Applied via: bunx supabase db push --db-url {DATABASE_URL}

-- ============================================================
-- 1. COMPANIES: subscription tier columns
-- ============================================================

-- tier: NOT NULL with DEFAULT — fills all existing rows as 'free' atomically.
-- CHECK constraint ensures valid tier strings (TEXT+CHECK pattern, D-07/D-08 — no Postgres enum).
ALTER TABLE companies
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'trial', 'pro', 'business'));

-- Nullable datetime/text columns: no DEFAULT needed. NULL = not set / not applicable.
ALTER TABLE companies ADD COLUMN tier_trial_ends_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE companies ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE companies ADD COLUMN tier_renews_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN tier_cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.tier IS
  'Subscription tier: free | trial | pro | business. Defaults to free for all existing companies.';
COMMENT ON COLUMN companies.tier_trial_ends_at IS
  'Trial expiry. NULL = not on trial / already converted. Set on new company INSERT only.';
COMMENT ON COLUMN companies.stripe_customer_id IS
  'Stripe Customer ID (cus_xxx). Set by Stripe webhook on first checkout.';
COMMENT ON COLUMN companies.stripe_subscription_id IS
  'Stripe Subscription ID (sub_xxx). Set by Stripe webhook on checkout.session.completed.';

-- ============================================================
-- 2. USAGE_EVENTS: rolling audit log of AI operations
-- ============================================================

CREATE TABLE usage_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL
    CHECK (event_type IN ('estimate_generated', 'photo_analyzed', 'audio_transcribed')),
  units        NUMERIC,        -- e.g. audio minutes, photo count
  metadata     JSONB,          -- arbitrary context (project_id, estimate_id, idempotency_key)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS policies = deny-all for anon/authenticated. Service role bypasses RLS.
-- Consistent with Phase 40: company_whatsapp, whatsapp_sessions, whatsapp_processed_messages.
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Quota query index: "how many estimates this month for company X?"
CREATE INDEX usage_events_company_created
  ON usage_events(company_id, created_at DESC);

COMMENT ON TABLE usage_events IS
  'Rolling audit log of AI operations per company. Service-role writes only. Enables quota enforcement and billing analytics.';
```

### lib/entitlements.ts: Full Module

```typescript
// lib/entitlements.ts
// Source: SEED-013 design + codebase pattern (lib/errors/codes.ts)

export type TierName = 'free' | 'trial' | 'pro' | 'business'

export type Entitlements = {
  /** null = no limit (unlimited). Never use Infinity — does not serialize to JSON. */
  maxEstimatesPerMonth: number | null
  /** null = no limit. */
  maxEstimatesPerDay: number | null
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
}

export const tiers: Record<TierName, Entitlements> = {
  free: {
    maxEstimatesPerMonth: 10,
    maxEstimatesPerDay: 3,
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: false,
    pdfEnabled: true,
    priceBookEnabled: false,
    customDomainEnabled: false,
  },
  trial: {
    maxEstimatesPerMonth: null,  // unlimited during trial
    maxEstimatesPerDay: 20,
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  },
  pro: {
    maxEstimatesPerMonth: 200,
    maxEstimatesPerDay: 30,
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  },
  business: {
    maxEstimatesPerMonth: null,  // unlimited
    maxEstimatesPerDay: 100,
    maxPhotosPerEstimate: 50,
    maxAudioMinutesPerEstimate: 30,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: true,
  },
} as const satisfies Record<TierName, Entitlements>

/**
 * Resolve entitlements for a tier string from the DB.
 * Falls back to 'free' if tier value is unrecognized — defensive against future DB states.
 */
export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free
}
```

### database.types.ts: companies Extension

```typescript
// In types/database.types.ts — companies table
// Add these fields to Row, Insert, and Update interfaces

// Row (non-null for tier since DB column is NOT NULL):
tier: string
tier_trial_ends_at: string | null
stripe_customer_id: string | null
stripe_subscription_id: string | null
tier_renews_at: string | null
tier_cancelled_at: string | null

// Insert (all optional — tier has DB DEFAULT 'free', rest are nullable):
tier?: string
tier_trial_ends_at?: string | null
stripe_customer_id?: string | null
stripe_subscription_id?: string | null
tier_renews_at?: string | null
tier_cancelled_at?: string | null

// Update (same as Insert):
tier?: string
tier_trial_ends_at?: string | null
// ... (same pattern)
```

### createOrUpdateCompany() INSERT Branch Patch

```typescript
// lib/actions/company.ts — INSERT branch only (UPDATE branch unchanged)
// TIER-04: new companies get tier_trial_ends_at = now() + 14 days
// tier itself uses the DB DEFAULT 'free' — no need to pass it explicitly

const trialEndsAt = new Date()
trialEndsAt.setDate(trialEndsAt.getDate() + 14)

const { error } = await supabase.from('companies').insert({
  ...row,
  tier_trial_ends_at: trialEndsAt.toISOString(),
})
```

### Unit Test Structure for lib/entitlements.ts

```typescript
// tests/unit/entitlements.test.ts
// Wave 0 stub — wave 0 pattern: vi.mock target before implementation exists

import { describe, it, expect } from 'vitest'
import { getEntitlements, tiers, type TierName } from '@/lib/entitlements'

describe('entitlements', () => {
  it('free tier has correct limits', () => {
    expect(tiers.free.maxEstimatesPerMonth).toBe(10)
    expect(tiers.free.whatsappEnabled).toBe(false)
  })

  it('trial tier has unlimited monthly estimates (null)', () => {
    expect(tiers.trial.maxEstimatesPerMonth).toBeNull()
  })

  it('business tier has unlimited monthly estimates (null)', () => {
    expect(tiers.business.maxEstimatesPerMonth).toBeNull()
  })

  it('no tier has Infinity — must be null for JSON safety', () => {
    const tierNames: TierName[] = ['free', 'trial', 'pro', 'business']
    for (const name of tierNames) {
      const t = tiers[name]
      expect(t.maxEstimatesPerMonth).not.toBe(Infinity)
      expect(t.maxEstimatesPerDay).not.toBe(Infinity)
    }
  })

  it('getEntitlements falls back to free for unknown tier', () => {
    const result = getEntitlements('enterprise')
    expect(result).toEqual(tiers.free)
  })

  it('tiers are JSON-serializable (no Infinity)', () => {
    expect(() => JSON.stringify(tiers)).not.toThrow()
    const serialized = JSON.parse(JSON.stringify(tiers))
    // null survives round-trip
    expect(serialized.trial.maxEstimatesPerMonth).toBeNull()
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PostgreSQL backfill script for ADD COLUMN with DEFAULT | Postgres 11+: DEFAULT on ADD COLUMN is instant (metadata-only for volatile-free defaults) | PostgreSQL 11 (2018) | No migration downtime for adding `tier` column |
| `Infinity` sentinel for unlimited | `null` with `number \| null` union type | TypeScript ecosystem standard | JSON-safe; no silent corruption on stringify |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase PostgreSQL (remote) | Migration apply | Via DATABASE_URL env | Supabase managed | — |
| `bunx supabase db push` | Migration deployment | Established since Phase 01 | supabase CLI | — |
| Docker | Type regeneration | NOT available (Windows) | — | Manual types extension (Phase 19 pattern) |
| Node.js | TypeScript compilation | Available | Existing project | — |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing, configured) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/entitlements.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TIER-03 | `tiers` record has correct limits per tier | unit | `npx vitest run tests/unit/entitlements.test.ts` | Wave 0 |
| TIER-03 | `getEntitlements()` falls back to free for unknown | unit | `npx vitest run tests/unit/entitlements.test.ts` | Wave 0 |
| TIER-03 | No tier uses `Infinity` (JSON safety) | unit | `npx vitest run tests/unit/entitlements.test.ts` | Wave 0 |
| TIER-01 | Migration SQL syntax valid + columns present | smoke (manual: db push) | `bunx supabase db push --db-url $DATABASE_URL` | manual |
| TIER-02 | `usage_events` table exists with correct schema | smoke (manual: db push) | same | manual |
| TIER-04 | New company INSERT includes `tier_trial_ends_at` | unit (company.ts action) | `npx vitest run tests/unit/company-action.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/entitlements.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/entitlements.test.ts` — covers TIER-03 (tiers record, getEntitlements, JSON safety, Infinity guard)
- [ ] `tests/unit/company-action.test.ts` or extend existing — covers TIER-04 (INSERT branch sets tier_trial_ends_at, UPDATE branch does not)

Note: The existing `tests/unit/` directory has action tests following a mock-Supabase pattern. TIER-04 test should follow the same pattern as other action tests.

## Sources

### Primary (HIGH confidence)

- Codebase analysis — `lib/actions/company.ts` (SELECT-then-INSERT/UPDATE pattern confirmed), `supabase/migrations/` (ADD COLUMN pattern from Phase 38/24), `types/database.types.ts` (manual extension pattern), `lib/errors/codes.ts` (module structure analog)
- Migration precedents in project — Phase 38 (nullable ADD COLUMN), Phase 40 (service-role-only RLS), Phase 19 (TEXT+CHECK no enum, UUID PK pattern), Phase 24 (application-layer vs SQL DEFAULT)
- `lib/errors/codes.ts` — existing `tier_limit` error type already defined at HTTP 402, confirming STATUS code decision

### Secondary (MEDIUM confidence)

- SEED-013 documentation — entitlements structure, tier limits, open questions (Infinity vs null resolved as null)
- PostgreSQL documentation (confirmed in training) — ADD COLUMN with DEFAULT is instant in PostgreSQL 11+ for non-volatile defaults; `ALTER TABLE ... ADD COLUMN` acquires ACCESS EXCLUSIVE briefly

### Tertiary (LOW confidence)

- Chatbot reference at `C:\Users\Vanildo\Dev\chatbot\lib\ai\entitlements.ts` — confirmed accessible; uses simpler `maxMessagesPerHour` shape, not directly reusable but confirms the Record<TierName, Entitlements> pattern

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — entirely within existing project stack, no new dependencies
- Architecture patterns: HIGH — all patterns have direct precedents in the codebase
- Migration safety: HIGH — ADD COLUMN with DEFAULT is well-established PostgreSQL behavior; matches Phase 24/38/40 patterns
- Infinity/null decision: HIGH — JSON.stringify(Infinity) === null is verifiable behavior; `null` is the correct semantic choice
- Trial start placement: HIGH — INSERT branch is unambiguous given SELECT-then-INSERT/UPDATE architecture

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable PostgreSQL + TypeScript decisions)
