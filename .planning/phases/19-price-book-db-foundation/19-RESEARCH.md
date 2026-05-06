# Phase 19: Price Book DB Foundation - Research

**Researched:** 2026-05-06
**Domain:** Supabase PostgreSQL schema migration, RLS policy authoring, TypeScript type generation
**Confidence:** HIGH

## Summary

Phase 19 is a pure database migration phase with zero UI work. It creates the `company_price_book` table, applies company-scoped RLS, and adds a `price_source` nullable TEXT column with a CHECK constraint to `estimate_items`. All patterns are directly observable in the project's existing migration history and STATE.md decisions — no external research is needed; every answer is locked by prior project decisions.

The migration file naming, RLS subquery form, CHECK constraint syntax, TypeScript type regeneration command, and test patterns are all established. The planner's primary job is sequencing two tasks correctly: (1) write and apply the migration SQL, (2) regenerate the TypeScript types so the build passes.

**Primary recommendation:** Copy the exact RLS subquery pattern from `20260409000001_initial_schema.sql` (line 178) and the CHECK constraint pattern from `20260422000001_theme_preference.sql` (line 4). Name the migration file `20260506000001_phase19_price_book.sql`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| Infrastructure prereq | Creates `company_price_book` table + RLS; adds `price_source` to `estimate_items` | All patterns present in existing migrations; enables PB-01–PB-07, AIPRICE-03, EDITPRICE-01, EDITPRICE-02 |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase CLI (bunx supabase) | via npx/bunx | Applying migrations via `db push` | Locked by [Phase 01-foundation-auth 01-03] |
| PostgreSQL (Supabase hosted) | 15.x | Schema host | Project-wide database |
| @supabase/supabase-js | ^2.103.0 | TypeScript queries + RLS enforcement | Already in package.json |
| vitest | ^4.1.4 | Unit + integration tests | Already in package.json |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase codegen | bundled in CLI | Regenerate `types/database.types.ts` from live schema | After every migration that changes public table shape |

**Migration command (from STATE.md locked decision):**
```bash
bunx supabase db push --db-url "$DATABASE_URL"
```

**Type generation command (standard Supabase CLI):**
```bash
bunx supabase gen types typescript --db-url "$DATABASE_URL" > types/database.types.ts
```

---

## Architecture Patterns

### Migration File Naming Convention

From `ls supabase/migrations/`:
```
20260409000001_initial_schema.sql        ← YYYYMMDDNNNNNN_slug.sql
20260419000001_platform_admin.sql
20260422000001_theme_preference.sql
20260424000001_add_translations_table.sql
20260503000001_phase15_admin_panel.sql
20260503000002_seed_platform_admin.sql
20260505000001_phase18_cleanup_cron.sql
```

Pattern: `YYYYMMDDNNNNNN_descriptive_slug.sql` where `NNNNNN` is a 6-digit sequence (000001 for first migration on a date).

**New file name:** `20260506000001_phase19_price_book.sql`

### RLS Subquery Pattern (LOCKED — Phase 01-foundation-auth)

From STATE.md decision:
> RLS subquery pattern: `company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))`

From `20260409000001_initial_schema.sql` lines 177-185 (clients table example — identical pattern for all company-scoped tables):

```sql
CREATE POLICY "clients_select" ON clients FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "clients_insert" ON clients FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "clients_update" ON clients FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "clients_delete" ON clients FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
```

Every company-scoped table (clients, projects, recordings, photos, estimates, estimate_sections, estimate_items, estimate_activity) uses this identical four-policy pattern.

### CHECK Constraint Pattern for Constrained TEXT Columns

From `20260422000001_theme_preference.sql`:

```sql
ALTER TABLE companies
  ADD COLUMN theme_preference TEXT
  CHECK (theme_preference IS NULL OR theme_preference IN ('dark','light','system'));
```

From `20260503000001_phase15_admin_panel.sql` (blog_posts.status):

```sql
status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
```

The project uses inline `CHECK` constraints on TEXT columns — not Postgres enums. Both nullable (allow NULL with `IS NULL OR`) and non-nullable (omit the NULL escape) variants are present.

For `price_source` (nullable, constrained): use the theme_preference pattern:

```sql
ALTER TABLE estimate_items
  ADD COLUMN price_source TEXT
  CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate'));
```

### No Postgres Enums

The project has zero enums in any migration. All constrained text columns use CHECK constraints. Do not introduce enums for `price_source`.

### Table Schema Pattern

From `20260409000001_initial_schema.sql` — all tables follow:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE` (for company-scoped tables)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- No `deleted_at` — hard-delete only (decision D-08)
- No `updated_at` required unless the table has mutable fields (recordings, photos do NOT have `updated_at`)

### Full Migration Template for Phase 19

```sql
-- Phase 19: Price Book DB Foundation
-- Creates company_price_book table and adds price_source to estimate_items

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE public.company_price_book (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,
  name         TEXT NOT NULL,
  unit         TEXT,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.company_price_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_price_book_select" ON company_price_book FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_price_book_insert" ON company_price_book FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_price_book_update" ON company_price_book FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "company_price_book_delete" ON company_price_book FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ============================================================
-- ALTER estimate_items: add price_source
-- ============================================================

ALTER TABLE estimate_items
  ADD COLUMN price_source TEXT
  CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate'));

COMMENT ON COLUMN estimate_items.price_source IS
  'Origin of the unit_price. NULL = pre-v1.3 (no badge). price_book = matched company price. ai_estimate = AI-generated price.';
```

### TypeScript Types Strategy

The project does NOT have a checked-in `types/database.types.ts` file (confirmed: `types/` only contains `env.d.ts`). This means:

1. Either types are inlined/hand-maintained somewhere, or
2. They are generated on demand and not committed.

**Action required in the plan:** After applying the migration, run:
```bash
bunx supabase gen types typescript --db-url "$DATABASE_URL" > types/database.types.ts
```

Then import and use `Database` from `types/database.types.ts` in any new query files for Phase 20+. The build (`next build`) will validate TypeScript correctness.

**Success criterion 4** ("The build passes with TypeScript types regenerated") requires:
- The codegen command runs without error
- `next build` passes (checked via `npm run build` or `bun run build`)

### Anti-Patterns to Avoid

- **Postgres enums:** Don't use `CREATE TYPE price_source_enum AS ENUM (...)`. The project uses TEXT + CHECK throughout.
- **Soft deletes:** Don't add `deleted_at`. Decision D-08 mandates hard-delete only.
- **Omitting `updated_at`:** `company_price_book` doesn't need `updated_at` — the existing pattern omits it on append-mostly tables (recordings, photos, estimate_activity all lack `updated_at`). Phase 20 can always add it if UPDATE operations require tracking.
- **Skipping `COMMENT ON COLUMN`:** The Phase 9 migration uses COMMENT. Use it for the nullable `price_source` column to communicate the null-means-pre-v1.3 semantics clearly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RLS enforcement | Custom auth check in server action | Postgres RLS policies (existing pattern) | Server action queries still go through RLS; service role bypasses cleanly for admin use |
| Type safety for new table | Manual TypeScript interface | Supabase codegen output (`types/database.types.ts`) | Codegen catches column name typos at compile time |
| CHECK constraint validation | Zod schema on the server action | Postgres CHECK constraint in SQL | Database is the source of truth; validation should happen at both layers but DB constraint is the backstop |

---

## Common Pitfalls

### Pitfall 1: Forgetting `ENABLE ROW LEVEL SECURITY`

**What goes wrong:** Table is created, policies are written, but `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is missing. RLS is silently not enforced — all authenticated users can read all company rows.

**Why it happens:** Easy to miss when copy-pasting the table definition separately from the policy block.

**How to avoid:** Always immediately follow `CREATE TABLE` with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` in the same migration, before the `CREATE POLICY` statements.

**Warning signs:** Integration test that uses an anon/wrong-company client to SELECT returns rows (should return empty).

### Pitfall 2: Missing `WITH CHECK` on UPDATE Policy

**What goes wrong:** UPDATE policy has `USING` but no `WITH CHECK`. User can update existing rows but could change `company_id` to another company's ID.

**Why it happens:** `USING` gates which rows you can see/act on; `WITH CHECK` gates what values the new row state can have. Forgetting `WITH CHECK` on UPDATE is a common RLS vulnerability.

**How to avoid:** All UPDATE policies in this codebase include both `USING` and `WITH CHECK` with the same subquery. Mirror this pattern exactly.

### Pitfall 3: CHECK Constraint Allows NULL Without Explicit `IS NULL OR`

**What goes wrong:** `CHECK (price_source IN ('price_book', 'ai_estimate'))` — this silently rejects NULL on some Postgres versions. Postgres CHECK constraints treat NULL as "unknown" and pass, but the intent is to be explicit.

**Why it happens:** Postgres actually passes NULL through a CHECK unless NOT NULL is also set. However, the codebase pattern (theme_preference migration) explicitly includes `IS NULL OR` for clarity and defensive correctness.

**How to avoid:** Use `CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate'))` to make intent unambiguous.

### Pitfall 4: Applying Migration With Wrong DATABASE_URL

**What goes wrong:** `bunx supabase db push --db-url $DATABASE_URL` runs against the wrong environment (e.g., production when intending staging, or vice versa).

**How to avoid:** Verify `DATABASE_URL` env var value before running push. This is always a manual verification step.

### Pitfall 5: Running `gen types` Before Migration Is Applied

**What goes wrong:** Codegen runs against the schema state before the migration was applied. Generated types don't include `company_price_book` or `price_source`. Build passes but types are stale.

**How to avoid:** Migration apply → then codegen → then TypeScript build check. This is the mandatory sequence.

---

## Code Examples

### Integration Test Pattern for RLS (from `tests/integration/platform-brand-rls.test.ts`)

```typescript
// Source: tests/integration/platform-brand-rls.test.ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY)
const d = hasEnv ? describe : describe.skip

d('company_price_book RLS', () => {
  it('rejects cross-company SELECT (anon client)', async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.from('company_price_book').select('*')
    // RLS with no session → empty or error, never another company's rows
    expect(data ?? []).toHaveLength(0)
  })
})
```

### Unit Test Pattern for Server Actions (mock-based, from `tests/unit/branding-actions.test.ts` style)

```typescript
// Wave 0 scaffold: vi.mock target module + expect.fail() for Nyquist compliance
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('server-only', () => ({}))

describe('price book server action (Wave 0 scaffold)', () => {
  it.todo('getPriceBookItems returns only company-scoped items')
  it.todo('addPriceBookItem inserts with correct company_id')
})
```

### Checking Migration Was Applied (smoke integration test)

```typescript
// Pattern from tests/integration/cleanup-orphan-projects.test.ts
import { createServiceClient } from '@/lib/supabase/service'

const supabase = createServiceClient()

it('company_price_book table exists and is accessible via service role', async () => {
  const { error } = await supabase.from('company_price_book').select('id').limit(0)
  expect(error).toBeNull()
})
```

---

## Runtime State Inventory

> This is a schema migration phase, not a rename/refactor. No runtime state categories apply.

- **Stored data:** None — `company_price_book` is a new table (no existing data). `estimate_items.price_source` column defaults to NULL, so existing rows are unaffected.
- **Live service config:** None — no n8n workflows, Datadog, or external services depend on the new columns.
- **OS-registered state:** None.
- **Secrets/env vars:** None — migration uses the existing `DATABASE_URL`. No new env vars required.
- **Build artifacts:** `types/database.types.ts` must be regenerated post-migration (this is a task in the plan, not a migration artifact problem).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (bunx supabase) | `db push`, `gen types` | Assumed ✓ | Via bunx (no local install needed) | — |
| DATABASE_URL env var | Migration apply | Must be set | — | Block — cannot apply without it |
| Node.js / bun | CLI runner | ✓ | bun.lock present | — |
| `next build` | TypeScript validation | ✓ | Next 16.2.3 | — |

**Missing dependencies with no fallback:**
- `DATABASE_URL` must be configured in the execution environment before running `db push`. If missing, the migration step is blocked.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | `company_price_book` table exists + migration applied without error | integration (smoke) | `npm run test` | ❌ Wave 0 |
| SC-2 | RLS isolates rows by company — cross-company SELECT returns empty | integration | `npm run test` | ❌ Wave 0 |
| SC-3 | `estimate_items.price_source` nullable + CHECK constraint accepted | integration (smoke) | `npm run test` | ❌ Wave 0 |
| SC-4 | TypeScript build passes after codegen | build check | `npm run build` | N/A (cmd) |

### Sampling Rate

- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green + build green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/integration/price-book-rls.test.ts` — covers SC-1, SC-2, SC-3 (table existence smoke + RLS isolation)
- [ ] Framework config: already exists (`vitest.config.ts` includes `tests/integration/**/*.test.ts`)

---

## Open Questions

1. **Does `types/database.types.ts` already exist in the repo?**
   - What we know: `ls types/` shows only `env.d.ts`. No `database.types.ts` found.
   - What's unclear: Some projects maintain types inline in action files rather than generating a central `database.types.ts`. Check if any action file imports from a `types/database` path.
   - Recommendation: Search for `Database` type import in lib/supabase/*.ts before the plan assumes codegen output goes to `types/database.types.ts`. If types are hand-maintained, the plan's "regenerate types" task needs to adapt.

2. **Is `unit_price` NUMERIC(12,2) the right precision for price book?**
   - What we know: All monetary columns in `estimate_items` use `NUMERIC(12,2)`. `unit_price` on `estimate_items` is `NUMERIC(12,2) NOT NULL DEFAULT 0`.
   - Recommendation: Match `estimate_items.unit_price` exactly → `NUMERIC(12,2) NOT NULL DEFAULT 0`.

---

## Sources

### Primary (HIGH confidence)

- `supabase/migrations/20260409000001_initial_schema.sql` — exact RLS policy pattern, table structure conventions, CHECK not used (no constrained TEXT in initial schema)
- `supabase/migrations/20260422000001_theme_preference.sql` — nullable TEXT CHECK constraint pattern
- `supabase/migrations/20260503000001_phase15_admin_panel.sql` — non-nullable TEXT CHECK constraint pattern (`status IN ('draft', 'published')`)
- `.planning/STATE.md` (Decisions section) — locked: RLS subquery form, migration apply command, no Postgres enums inferred from absence
- `vitest.config.ts` + `tests/integration/` — test framework config and integration test patterns

### Secondary (MEDIUM confidence)

- Supabase documentation on RLS + `(SELECT auth.uid())` wrapping pattern — consistent with project usage (wrapping in SELECT avoids repeated evaluation per row)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools confirmed present in package.json and migration history
- Architecture (RLS, CHECK, naming): HIGH — directly read from migration source files
- TypeScript codegen: MEDIUM — `types/database.types.ts` not found in repo; codegen command is standard Supabase CLI but output destination needs verification
- Pitfalls: HIGH — all pitfalls sourced from project patterns and standard Postgres RLS behavior

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (stable domain — Postgres/Supabase RLS patterns don't change)
