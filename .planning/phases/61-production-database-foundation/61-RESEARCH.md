# Phase 61: Production Database Foundation - Research

**Researched:** 2026-05-15
**Domain:** Supabase production provisioning, migration application, RLS verification, PITR backups, super-admin bootstrap
**Confidence:** HIGH

## Summary

Phase 61 is a **deployment/operations phase**, not a code-writing phase. The deliverable is a fully-configured production Supabase project — separate org/project from dev — with all 21 existing migrations applied, the first super-admin bootstrapped, PITR enabled, and an RLS posture audit confirming deny-all on platform tables and tenant-scoped policies on the 8 user-data tables. Almost every task is a CLI/dashboard action; the only repo artifacts produced are: (1) an RLS audit SQL query stored under `supabase/audits/`, (2) a documented production secrets manifest (in a secure store, NOT git), and (3) a phase-completion summary.

The work has three real risks: (1) **PITR is a paid add-on**, not a free Pro feature — PROD-DB-04 will require enabling Supabase Pro plan ($25/mo) + PITR add-on (~$100/mo for 7-day retention) OR documenting/accepting daily-snapshot-only resilience; (2) **migration ordering must hold** — the established Windows convention is `bunx supabase db push --db-url <PROD_URL>` and there is no Docker available locally, so we cannot pre-test against a shadow DB; (3) **storage bucket RLS** uses `(storage.foldername(name))[1]` policies that are already in the initial migration — they apply automatically when `db push` runs, but must be re-verified post-push.

**Primary recommendation:** Use `bunx supabase db push --db-url <PROD_POOLER_URL> --dry-run` first to preview, then `--include-all` to apply. Bootstrap the super-admin via the existing seeded migration (`20260503000002_seed_platform_admin.sql`) which already INSERTs `skale.club@gmail.com` from `auth.users` — but the user must sign in to prod once first so the `auth.users` row exists. Ship a single `supabase/audits/rls-audit.sql` query that returns one row per (table, policy) and asserts the expected RLS posture for every public.* table.

## User Constraints (from CONTEXT.md)

> No CONTEXT.md exists for this phase — research proceeded with no locked decisions from `/gsd:discuss-phase`. The phase brief, additional context, and ROADMAP success criteria serve as the constraints.

### Implicit Constraints (from phase brief + project state)

- Production Supabase project MUST be a **separate org/project** from dev (`prmqgcrnpuvpzruyzvuv` is dev only)
- Migration application MUST use `bunx supabase db push --db-url <PROD_URL>` (Docker NOT available on Windows — established convention since Phase 1)
- Super-admin email is `skale.club@gmail.com` — no other emails get platform_admins rows in this phase
- PITR retention must be **at least 7 days** (PROD-DB-04 floor)
- RLS posture must be auditable by **SQL query**, not by visual dashboard inspection
- NO real secret values in any committed file — placeholders only (CLAUDE.md "Secret Handling")
- No new application code in this phase — only schema (existing migrations) + operations

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROD-DB-01 | Production Supabase project provisioned (separate org/project from dev) | §Provisioning Procedure, §Standard Stack (Supabase Pro plan choice) |
| PROD-DB-02 | All migrations from phases 1-60 applied successfully to production database | §Migration Application Procedure, §Existing Migration Inventory, §Pitfalls (migration order, pg_cron extension) |
| PROD-DB-03 | First super-admin (skale.club@gmail.com) bootstrapped in `platform_admins` production table | §Super-admin Bootstrap Procedure (seeded migration already handles this) |
| PROD-DB-04 | PITR (Point-in-Time Recovery) enabled with 7-day retention minimum | §PITR Decision (paid add-on, ~$100/mo), §State of the Art |
| PROD-DB-05 | RLS policies verified active on all tables via automated check | §RLS Audit Query, §RLS Posture Map |

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Supabase CLI | `bunx supabase` latest (≥ 1.200) | Apply migrations to prod via `db push --db-url` | Already established convention since Phase 1; works on Windows without Docker |
| Supabase Pro plan | $25/mo per project | Hosts production database with daily backups | Required tier for production — Free tier has no automated backups |
| Supabase PITR add-on | ~$100/mo for 7-day retention | Point-in-time recovery beyond daily snapshots | Required by PROD-DB-04 — NOT included in Pro by default |
| PostgreSQL | 17 (matches `config.toml` major_version=17) | Production DB engine | Same major version as dev — schema migrations valid |
| Bun | latest | Runner for `bunx supabase` CLI | Project-wide standard (`bunx supabase db push`) |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| 1Password / Bitwarden / encrypted file | Store production secrets (connection string, anon key, service role key, JWT secret, DB password) | After provisioning — values must never enter git |
| Supabase Dashboard SQL Editor | Run RLS audit query, manual verification, ad-hoc fixes | Verification step; bootstrap fallback if seeded migration fails |
| `psql` (optional) | Direct DB connection for advanced verification | Only if Supabase Dashboard SQL Editor is insufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `supabase db push --db-url` | Apply each migration individually via Dashboard SQL Editor | Manual is error-prone for 21 migrations and loses migration-history tracking. Reject. |
| Squashing 21 migrations into one | `supabase migration squash` before push | Squashing loses per-phase audit trail and is risky if any migration has side effects (pg_cron, seed inserts). Reject — push as-is. |
| Supabase Free tier for prod | — | Free tier has NO automated backups (search result confirms). Fails PROD-DB-04 outright. Reject. |
| Skip PITR, document daily-snapshot-only | — | Violates the literal text of PROD-DB-04 (7-day retention minimum). Either pay for PITR or get user sign-off on the cost/scope tradeoff. |

**Provisioning entry point:** https://supabase.com/dashboard (sign in as `skale.club@gmail.com` → "New Project" → separate from existing `prmqgcrnpuvpzruyzvuv` project).

**Version verification:**
```bash
bunx supabase --version    # confirm CLI version current
# Latest stable CLI as of 2026-05: 1.x branch (see https://github.com/supabase/cli/releases)
```

## Architecture Patterns

### Recommended Approach: 4-Wave Sequential Execution

This phase has **strict ordering** — each step's success unblocks the next, and several steps can only be verified after execution.

```
Wave 0: Provision + Configure
  ├─ Create new Supabase project (separate org)
  ├─ Choose region (us-east-1 — matches "US-only target market" + Vercel default)
  ├─ Choose plan: Pro + PITR add-on (or accept reduced retention)
  ├─ Generate DB password, record connection string
  └─ Enable required extensions: pg_cron (used by phases 43 + 60)

Wave 1: Apply Migrations
  ├─ `bunx supabase db push --db-url <PROD_URL> --dry-run` (preview)
  ├─ `bunx supabase db push --db-url <PROD_URL>` (apply 21 migrations)
  └─ Verify: `bunx supabase migration list --db-url <PROD_URL>` shows 0 pending

Wave 2: Bootstrap Admin + Storage
  ├─ User signs in to deployed app ONCE so auth.users row exists for skale.club@gmail.com
  │  (Chicken-and-egg: app isn't deployed yet in Phase 61 — see §Pitfalls)
  ├─ Alternative: Insert auth.users row via dashboard "Invite user" → user accepts → email confirmed
  ├─ Confirm seeded migration `20260503000002_seed_platform_admin.sql` populated platform_admins
  │  (If empty: manually INSERT via SQL Editor per ADMIN-BOOTSTRAP.md procedure)
  ├─ Verify storage buckets exist: audio, photos, pdfs, logos, platform-brand (auto-created by migrations)
  └─ Confirm storage policies attached

Wave 3: Enable PITR + Audit
  ├─ Dashboard → Project Settings → Database → Backups → Enable PITR (7-day)
  ├─ Run RLS audit query → save output as `supabase/audits/61-prod-rls-snapshot.txt`
  └─ Run schema-parity check vs dev (optional but recommended)
```

### Migration Application Pattern

**Established convention (locked in Phase 1, used through Phase 60):**

```bash
# From repo root, with .env.local NOT pointing at prod (prevent accidents):
bunx supabase db push --db-url "postgresql://postgres.<PROD_REF>:<PROD_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres"
```

**Why the pooler URL (port 6543) and not direct (port 5432):** Pooler tolerates Windows IPv6 quirks and Supabase docs recommend it for one-shot migration runs. Direct port 5432 works but has occasionally hung from Windows clients (anecdotal — flag for verification at execution time).

**Migration ordering** (Supabase enforces via `supabase_migrations.schema_migrations` table — applied in timestamp order):

```
20260409000001  initial_schema                       (8 tenant tables + storage buckets)
20260419000001  platform_admin                       (platform_admins, platform_integrations, platform_branding, platform-brand bucket)
20260422000001  theme_preference                     (companies.theme_preference column)
20260424000001  add_translations_table               (translations cache table)
20260503000001  phase15_admin_panel                  (blog_posts + extended branding)
20260503000002  seed_platform_admin                  (INSERT skale.club@gmail.com)
20260505000001  phase18_cleanup_cron                 (uses pg_cron — extension dependency)
20260506000001  phase19_price_book                   (company_price_book table)
20260508000001  phase24_estimate_templates           (4 companies columns)
20260508000002  phase27_nullable_storage_path        (recordings.storage_path nullable + projects.client_id nullable)
20260510000001  phase38_custom_domain                (companies.custom_domain)
20260510000002  phase40_whatsapp                     (3 WhatsApp tables)
20260510000003  phase43_whatsapp_session_expiry_cron (pg_cron job)
20260510000004  phase44_delivery_format              (delivery_format column on company_whatsapp)
20260511000001  phase50_whatsapp_otp                 (verification_code, attempts, expires)
20260511000002  phase52_estimate_language            (estimates.language + clients.preferred_language + companies.default_estimate_language)
20260511000003  phase53_pdf_attachment               (extends delivery_format CHECK to include pdf_attachment)
20260513000001  phase55_subscription_tiers           (6 companies tier columns + usage_events table)
20260513000002  phase56_usage_idempotency            (likely unique constraint or index on usage_events idempotency_key)
20260514000001  phase58_stripe_processed_events      (processed_stripe_events table)
20260514000002  phase60_pg_cron_trial                (pg_cron jobs for trial automation)
```

**21 migrations total.** No squashing — push as-is.

### Bootstrap Pattern (existing, just needs verification)

The migration `20260503000002_seed_platform_admin.sql` already contains:

```sql
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'skale.club@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
```

**Critical:** This will INSERT zero rows on a fresh prod DB because `auth.users` is empty. The migration runs successfully (no error — the SELECT just returns no rows), but `platform_admins` stays empty. The user must:

1. EITHER sign in to the deployed app once via `/auth/sign-up` or Google OAuth (creates the `auth.users` row), then re-run the seed manually OR
2. Use Supabase Dashboard "Authentication → Users → Invite user" to create the row before running migrations OR
3. After signup, run the bootstrap procedure from `supabase/ADMIN-BOOTSTRAP.md` (manual SQL insert via Dashboard SQL Editor)

Since Phase 62 (Vercel deployment) is the next phase and depends on this one, option 2 (Dashboard invite or admin-created user) is the cleanest sequence. **The seeded migration is best-effort, not authoritative.**

### Anti-Patterns to Avoid

- **Pointing `.env.local` at production** during this phase — risk of running dev test scripts against prod. Keep `.env.local` on dev; export prod connection string to a separate `.env.production` (gitignored) or in-memory only.
- **Hand-editing production schema via Dashboard table editor** — Phase 8 D-23 locked migration files as the single source of truth. Even fixes must go through a new migration file.
- **Skipping `--dry-run`** — 21 migrations is enough surface area that "preview" is cheap insurance.
- **Disabling RLS to "test connectivity"** — RLS is on every tenant table by design; an unconfigured connection means service role usage, not disabled RLS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration application | Custom psql runner / sequential `\i` scripts | `bunx supabase db push` | Tracks applied migrations in `supabase_migrations.schema_migrations`; idempotent re-runs; same tool used in every prior phase |
| Schema diff vs dev | Manual table-by-table comparison | `supabase db diff --db-url <PROD_URL>` (against linked dev) | Reports any drift in one shot |
| RLS audit | Per-table SELECT statements in shell loop | Single SQL query against `pg_policies` + `pg_tables` (see §RLS Audit Query) | One query, one result set, easy to commit as `supabase/audits/*.sql` |
| Super-admin bootstrap | Build admin-creation UI in this phase | Existing seeded migration + dashboard SQL Editor fallback (`ADMIN-BOOTSTRAP.md`) | Already shipped in Phase 8 |
| Backup setup | Custom pg_dump cron | Supabase PITR add-on + daily snapshots | Managed, restorable to any point in last 7 days |
| Secrets storage | `.env.prod` in git / config file | 1Password vault / Bitwarden / Vercel env vars (Phase 62) | CLAUDE.md "Secret Handling" rule + pre-commit gitleaks hook |

**Key insight:** Almost every part of this phase is "use the tool, verify the result" — there is no app code to write. The temptation to script things (e.g. a bash wrapper around `db push`) should be resisted; one-shot CLI commands with explicit human verification at each step are the right granularity for a phase that creates the production database.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Empty production Supabase DB (new project, no rows). Dev DB has rows but this phase MUST NOT migrate dev rows to prod. | No data migration. Production starts empty. |
| Live service config | New Supabase project must be configured at provisioning time: region, plan, PITR. Auth providers (Google OAuth) and SMTP defaults are project-scoped — configured separately, NOT in git migrations. | Manual dashboard config in Wave 0. Document in summary. |
| OS-registered state | None — no Windows tasks, launchd plists, or cron entries reference the prod DB. pg_cron jobs (phase18, phase43, phase60 migrations) DO embed schedules in the new DB, but they're applied via migration, not OS. | Verify pg_cron extension enabled (Wave 0) before applying migrations that depend on it. |
| Secrets/env vars | Production needs **new values** for: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`), `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`), `DATABASE_URL`. JWT secret is internal to Supabase and not consumed by app code. `APP_ENCRYPTION_KEY` (for AES-256-GCM `platform_integrations`) must be REGENERATED for production — distinct from dev. Stripe `STRIPE_WEBHOOK_SECRET` stays as a Phase 63 concern. | Provision Phase 61: record secrets to vault. Apply Phase 62: paste into Vercel env. Apply Phase 63: register Stripe live mode. |
| Build artifacts | None — no compiled binaries, egg-info, or registry-published packages embed the dev DB URL. The TypeScript types under `lib/supabase/types.gen.ts` (if any) are generated from dev OpenAPI — they describe schema shape, not connection. Type regeneration via REST OpenAPI introspection (established convention) can target prod after migrations apply, but is OPTIONAL since prod schema = dev schema. | No action — types already shipped match the schema migrations applied to prod. |

**The canonical question — "After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?"** — N/A for this phase. Nothing is being renamed; a wholly new project is being created.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun (`bunx`) | `bunx supabase db push` (migration application) | ✓ (project convention) | ≥ 1.x | npx supabase (slower, npm-resolved) |
| Supabase CLI | All migration + introspection commands | ✓ via `bunx supabase` | ≥ 1.200 (verify at exec time) | Dashboard SQL Editor + manual per-migration paste — last resort |
| Supabase Pro plan account | PITR add-on, no-Free-tier backups | ✗ (must be enabled at provisioning) | — | Document risk + degraded resilience if user declines Pro+PITR cost |
| Internet connectivity to AWS pooler | `db push --db-url ... pooler.supabase.com:6543` | Assumed | — | Direct port 5432 if pooler unreachable |
| Docker | NOT required for `db push --db-url` flow | N/A (not available on Windows host) | — | — (the whole point of `--db-url` is no local Supabase stack) |
| Browser access to Supabase Dashboard | PITR enablement, manual SQL fallback, invite user | ✓ | — | None — required step |
| Access to email `skale.club@gmail.com` | Receive Supabase project invitation + confirm signup | ✓ (project owner) | — | None — required step |

**Missing dependencies with no fallback:**
- Supabase Pro plan billing — requires payment method on file and explicit user authorization for ~$125/mo recurring cost ($25 Pro + ~$100 PITR for 7-day retention)

**Missing dependencies with fallback:**
- None in the technical stack — Docker absence is by design, not a gap

## Common Pitfalls

### Pitfall 1: Empty `platform_admins` After Seed Migration
**What goes wrong:** `20260503000002_seed_platform_admin.sql` SELECTs the user ID from `auth.users WHERE email = 'skale.club@gmail.com'`. On a fresh prod DB, that table is empty — the INSERT inserts zero rows. The migration "succeeds" silently. When the app deploys and the user tries to visit `/admin`, requireAdmin throws notFound() because no row matches.
**Why it happens:** The seed migration was designed for dev where the user had already signed up locally. It's a no-op on a virgin prod DB.
**How to avoid:** Either invite the user via Supabase Dashboard Authentication → Users BEFORE the seed migration runs, OR manually run the bootstrap SQL after the first signup (see `supabase/ADMIN-BOOTSTRAP.md`). Verification query: `SELECT count(*) FROM platform_admins;` after Wave 2 — MUST equal 1, not 0.
**Warning signs:** Migration list shows 0 pending but `/admin` returns 404 after deploy. `platform_admins` table is empty in dashboard.

### Pitfall 2: pg_cron Extension Not Enabled Before Migrations Run
**What goes wrong:** Migrations `20260505000001_phase18_cleanup_cron.sql`, `20260510000003_phase43_whatsapp_session_expiry_cron.sql`, and `20260514000002_phase60_pg_cron_trial.sql` call `cron.schedule(...)`. If the `pg_cron` extension is not enabled on the new project, these migrations fail with `schema "cron" does not exist`.
**Why it happens:** pg_cron is opt-in per Supabase project. Dev had it enabled at some point (likely Phase 18); prod won't have it by default.
**How to avoid:** Before `db push`, navigate to Database → Extensions → enable `pg_cron`. Also enable `pg_net` if any HTTP webhook is invoked from cron (none currently, but verify).
**Warning signs:** `db push` fails partway through with `schema "cron" does not exist` — migration history table will show the last successful migration as `20260503000002`. Re-run after enabling extension; idempotent.

### Pitfall 3: PITR Conflated with "Backups" in the Dashboard
**What goes wrong:** Pro plan includes daily snapshots with 7-day retention by default. The dashboard "Backups" page shows daily snapshots — easy to mistake "I see backups" for "PITR is enabled." PROD-DB-04 specifically requires PITR, which is a separate paid add-on (~$100/mo) and shows a different UI element (granular timestamp slider).
**Why it happens:** Supabase UI/naming evolved; "backup" historically meant both daily snapshot and PITR.
**How to avoid:** Confirm under Project Settings → Database → Backups the line "Point-in-Time Recovery: Enabled — 7-day retention" is visibly present. Daily snapshots alone do not satisfy PROD-DB-04.
**Warning signs:** Backups page shows only daily snapshot list, no per-second/per-minute restore slider. PITR add-on not on invoice.

### Pitfall 4: Service Role Key Pasted into NEXT_PUBLIC_ Variable
**What goes wrong:** Production secret `SUPABASE_SERVICE_ROLE_KEY` (or new naming `SUPABASE_SECRET_KEY`) accidentally pasted into a `NEXT_PUBLIC_*` env var → exposed to browser → all RLS bypassed by any attacker.
**Why it happens:** Vercel env var UI doesn't visually distinguish public vs server-only — only the prefix matters.
**How to avoid:** When recording secrets in Phase 61 documentation (for Phase 62), explicitly label each value as PUBLIC or SECRET. STATE.md decision (`SUPABASE_SERVICE_ROLE_KEY declared without NEXT_PUBLIC_ prefix (SEC-03)`) — same rule applies to `SUPABASE_SECRET_KEY` per the new naming in `.env.local`.
**Warning signs:** Any anon/unauthenticated query in production returns rows from any company.

### Pitfall 5: `(SELECT auth.uid())` RLS Policies Returning NULL Under Service Role
**What goes wrong:** All tenant tables use `company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))`. Under service role, `auth.uid()` is NULL, the subquery returns no rows, and the policy denies all rows. In production this is correct — but if a server action accidentally uses the SSR (authenticated) client where it needed service-role (e.g. for cron handlers reading usage_events), queries return empty silently.
**Why it happens:** Live traffic exercises code paths dev tests didn't (cron handlers, webhook handlers, service-role-only tables like `platform_integrations` + `usage_events` + `processed_stripe_events`).
**How to avoid:** Phase 61 itself doesn't run app code — but the Phase 62 deploy will. Add a checklist item to Phase 61 summary: "Service-role-only tables (`platform_integrations`, `platform_branding`, `platform_admins` writes, `usage_events`, `whatsapp_*`, `processed_stripe_events`) must be read/written through `requireServiceClient()` per Phase 59 decision."
**Warning signs:** After Phase 62 deploy: `/admin/integrations` shows no integrations; `/settings/billing` shows zero usage; WhatsApp webhook silently no-ops.

### Pitfall 6: `db push` Times Out on Long-Running Migration
**What goes wrong:** A migration that runs `cron.schedule(...)` or creates a large table sometimes exceeds the pooler statement timeout (default 60s) when run via 6543. Migration fails partway, history shows partial application.
**Why it happens:** Pooler is optimized for short transactions; long DDL benefits from direct port 5432.
**How to avoid:** If `db push` to 6543 fails with timeout, retry against direct port 5432 (replace `:6543` with `:5432` and remove `.pooler.` from hostname — direct hostname is `db.<PROJECT_REF>.supabase.co:5432`). Document in summary.
**Warning signs:** `db push` output shows transaction abort; `migration list --db-url` shows partial application.

### Pitfall 7: Storage Buckets Exist But Without RLS Policies
**What goes wrong:** Storage buckets are created by `INSERT INTO storage.buckets ...` in migrations 1 and 4. RLS policies on `storage.objects` are created in the same migrations. If a future migration drops/recreates a bucket WITHOUT re-creating policies (none currently do, but verify), an authenticated user could upload to a bucket they don't own.
**Why it happens:** Bucket-vs-policy separation in Supabase Storage is a common source of bugs.
**How to avoid:** After `db push`, run the RLS audit query (§RLS Audit Query) — it includes `storage.objects` policies too. Confirm 5 buckets exist: `audio`, `photos`, `pdfs`, `logos`, `platform-brand`.
**Warning signs:** Storage section of dashboard shows bucket exists but RLS policies list is empty.

## RLS Posture Map

| Table | Schema | RLS Policy Pattern | Expected Policy Count |
|-------|--------|---------------------|----------------------|
| `companies` | public | `user_id = (SELECT auth.uid())` | 4 (SELECT/INSERT/UPDATE/DELETE) |
| `clients` | public | `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` | 4 |
| `projects` | public | same tenant pattern | 4 |
| `recordings` | public | same tenant pattern | 4 |
| `photos` | public | same tenant pattern | 4 |
| `estimates` | public | same tenant pattern (+ public share_token select) | 5 (including public share read) |
| `estimate_sections` | public | same tenant pattern | 4 |
| `estimate_items` | public | same tenant pattern | 4 |
| `estimate_activity` | public | same tenant pattern | 3 (select/insert/delete; no update) |
| `translations` | public | (verify pattern — likely service-role-only or authenticated read) | varies |
| `blog_posts` | public | (verify — likely public select, admin write) | varies |
| `company_price_book` | public | tenant pattern | 4 |
| `company_whatsapp` | public | tenant pattern | 4 |
| `whatsapp_sessions` | public | (verify — service-role-only) | 0 expected (deny-all) |
| `whatsapp_processed_messages` | public | (verify — service-role-only) | 0 expected (deny-all) |
| `usage_events` | public | RLS enabled, NO policies = deny-all | 0 expected |
| `processed_stripe_events` | public | RLS enabled, NO policies = deny-all | 0 expected |
| `platform_admins` | public | self-referential admin-only | 3 (SELECT/INSERT/DELETE; no UPDATE) |
| `platform_integrations` | public | RLS enabled, NO policies = deny-all | 0 expected |
| `platform_branding` | public | RLS enabled, NO policies = deny-all | 0 expected |
| `storage.objects` (audio) | storage | `(storage.foldername(name))[1] IN tenant company IDs` | 3 (INSERT/SELECT/DELETE) |
| `storage.objects` (photos) | storage | same | 3 |
| `storage.objects` (pdfs) | storage | same | 3 |
| `storage.objects` (logos) | storage | same | 3 |
| `storage.objects` (platform-brand) | storage | admin-only write, public read (bucket public=true) | 3 (INSERT/UPDATE/DELETE — SELECT omitted because bucket is public) |

**Total expected policies (lower bound):** ~70 policies across 20+ tables. The audit query must return non-zero for each tenant-scoped table and exactly zero (with RLS enabled) for each deny-all platform table.

## RLS Audit Query

Single SQL query — commit output as `supabase/audits/61-prod-rls-snapshot.txt`:

```sql
-- supabase/audits/rls-audit.sql
-- Returns one row per (schema, table) with RLS status + policy count.
-- Run via: bunx supabase db execute --db-url <PROD_URL> --file supabase/audits/rls-audit.sql
--    OR: paste into Dashboard SQL Editor
-- Expected (for PROD-DB-05 to pass):
--   * Every public.* tenant table: rls_enabled=true, policy_count >= 3
--   * Every public.* platform table (platform_*, usage_events, whatsapp_sessions,
--     whatsapp_processed_messages, processed_stripe_events): rls_enabled=true, policy_count=0
--   * storage.objects: policy_count >= 15 (3 per bucket × 5 buckets)

WITH table_rls AS (
  SELECT
    n.nspname AS schemaname,
    c.relname AS tablename,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname IN ('public', 'storage')
    AND c.relname NOT LIKE 'pg_%'
),
policy_counts AS (
  SELECT schemaname, tablename, COUNT(*) AS policy_count
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
  GROUP BY schemaname, tablename
)
SELECT
  t.schemaname,
  t.tablename,
  t.rls_enabled,
  COALESCE(p.policy_count, 0) AS policy_count,
  CASE
    WHEN NOT t.rls_enabled THEN 'FAIL — RLS DISABLED'
    WHEN t.tablename IN (
      'platform_integrations',
      'platform_branding',
      'usage_events',
      'whatsapp_sessions',
      'whatsapp_processed_messages',
      'processed_stripe_events',
      'translations'  -- verify intent; remove from this list if translations should be readable
    ) AND COALESCE(p.policy_count, 0) > 0 THEN 'WARN — DENY-ALL TABLE HAS POLICIES'
    WHEN t.tablename NOT IN (
      'platform_integrations',
      'platform_branding',
      'usage_events',
      'whatsapp_sessions',
      'whatsapp_processed_messages',
      'processed_stripe_events'
    ) AND t.schemaname = 'public' AND COALESCE(p.policy_count, 0) = 0 THEN 'FAIL — TENANT TABLE HAS NO POLICIES'
    ELSE 'OK'
  END AS posture
FROM table_rls t
LEFT JOIN policy_counts p USING (schemaname, tablename)
ORDER BY t.schemaname, t.tablename;
```

**Pass criterion:** zero rows where `posture LIKE 'FAIL%'`. Warnings flag deny-all-intent tables that accidentally received policies — investigate but don't block.

## Code / Command Examples

### Wave 0: Provision Project

Manual dashboard action (no CLI equivalent):

1. https://supabase.com/dashboard → "New project"
2. Organization: NEW (separate from dev org) — name e.g. `xtimator-prod`
3. Project name: `xtimator` (or `xtimator-production`)
4. Region: `us-east-1` (closest to target market; matches Vercel default)
5. DB password: generate via `openssl rand -base64 24` — STORE in vault
6. Plan: Pro ($25/mo). Then Settings → Add-ons → enable Point-in-Time Recovery (7-day retention)
7. Database → Extensions → enable `pg_cron`

### Wave 0: Record Connection String

Construct from dashboard values (do NOT commit):

```bash
# Format (placeholder — values from dashboard):
PROD_REF="<your-prod-project-ref>"               # e.g. abc123xyz789
PROD_PASSWORD="<generated-db-password>"
PROD_REGION="aws-0-us-east-1"                    # pooler hostname segment

# Pooler URL (preferred for migrations):
PROD_DB_URL="postgresql://postgres.${PROD_REF}:${PROD_PASSWORD}@${PROD_REGION}.pooler.supabase.com:6543/postgres"

# Direct URL (fallback if pooler times out):
PROD_DB_URL_DIRECT="postgresql://postgres:${PROD_PASSWORD}@db.${PROD_REF}.supabase.co:5432/postgres"
```

### Wave 1: Apply Migrations

```bash
# Preview (zero side effects):
bunx supabase db push --db-url "$PROD_DB_URL" --dry-run

# Apply:
bunx supabase db push --db-url "$PROD_DB_URL"

# Verify:
bunx supabase migration list --db-url "$PROD_DB_URL"
# Expected: 21 rows, all marked applied; zero pending.
```

### Wave 2: Verify Super-Admin

```sql
-- Via Dashboard SQL Editor:
SELECT pa.user_id, u.email, pa.created_at
FROM platform_admins pa
JOIN auth.users u ON u.id = pa.user_id;

-- Expected after deploy + first signup: 1 row, email = skale.club@gmail.com
-- If 0 rows: re-run the seed insert manually after user signs up.
```

### Wave 2: Manual Bootstrap Fallback (if seed migration was a no-op)

```sql
-- Per supabase/ADMIN-BOOTSTRAP.md:
INSERT INTO platform_admins (user_id, notes)
SELECT id, 'First platform admin — Phase 61 bootstrap'
FROM auth.users
WHERE email = 'skale.club@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
```

### Wave 3: PITR Verification

PITR cannot be verified via SQL (it's a platform-level feature). Verification:

1. Dashboard → Project Settings → Database → Backups
2. Screenshot the "Point in Time Recovery: Enabled" status + retention window
3. Save screenshot to `supabase/audits/61-pitr-enabled.png` (small image, OK to commit)

Verification command (best available):

```bash
# Confirm pg_cron is healthy (a working pg_cron extension is a proxy for "DB is fully provisioned")
# Via Dashboard SQL Editor:
SELECT * FROM cron.job ORDER BY jobid;
-- Expected: 3 jobs — orphan-cleanup (phase 18), purge-expired-whatsapp-sessions (phase 43), expire-trials + trial-warning-emails (phase 60). Some may be no-op placeholder bodies.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `supabase db push` linked-project flow (`supabase link` first) | `--db-url` direct flag | Stable since CLI 1.100+ | Works on Windows without Docker; matches established project convention |
| Free tier with manual `pg_dump` cron | Pro plan + PITR add-on | PITR GA'd 2022, paid add-on since | Real production posture; daily snapshots alone insufficient for 7-day RPO target |
| Bootstrap admin via env-var allowlist | Bootstrap admin via seeded SQL migration | Phase 8 decision D-06 | Forge-proof; requires DB access to escalate; matches Supabase's auth model |
| Inline AES key in code | `APP_ENCRYPTION_KEY` env var rotated per environment | Phase 8 decision | Dev and prod use different keys; rotation documented in ADMIN-BOOTSTRAP.md |

**Deprecated/outdated patterns:**
- `supabase migration up --db-url ...` (older syntax — replaced by `db push`)
- Pasting migrations into Dashboard SQL Editor one-by-one (works as fallback, but loses `schema_migrations` history)

## Open Questions

1. **PITR cost authorization** — Pro plan ($25/mo) + PITR add-on (~$100/mo for 7-day retention) = ~$125/mo recurring. Has the user authorized this spend?
   - What we know: PROD-DB-04 literally requires 7-day PITR retention.
   - What's unclear: Whether the user has budgeted for $125/mo or expected PITR to be included in Pro.
   - Recommendation: Phase 61 plan must include an explicit "user authorizes PITR add-on cost" checkpoint task before Wave 0 starts. If declined, document the reduced-retention posture (daily snapshots only, 7-day retention) and amend PROD-DB-04 wording with user sign-off.

2. **First-admin chicken-and-egg** — `platform_admins` needs an `auth.users` row to FK to, but the user can't sign in until Phase 62 deploys the app to a URL.
   - What we know: The seeded migration runs in Phase 61 and INSERTs zero rows because `auth.users` is empty.
   - What's unclear: Whether to insert the row via Dashboard "Invite user" (creates auth.users immediately, user later sets password) or defer admin bootstrap to a post-Phase-62 step.
   - Recommendation: Use Dashboard "Invite user" with `skale.club@gmail.com` in Wave 2. User receives invite email, sets password, and the `auth.users` row exists by the time `db push` re-applies the seed (or run the seed insert manually after invite acceptance). PROD-DB-03 is then verifiable in Phase 61.

3. **Database region** — `us-east-1` is the recommended default (matches Vercel default + US market), but Supabase dev project is on `us-west-2` (from `.env.local` pooler URL `aws-0-us-west-2`).
   - What we know: Cross-region writes work but add ~70ms RTT per query.
   - What's unclear: Whether prod should match dev region (`us-west-2`) or align with Vercel (`us-east-1`).
   - Recommendation: Prefer `us-east-1` for production (lower latency to East Coast US service businesses; matches Vercel Edge default). Dev's `us-west-2` was a historical choice and not load-bearing.

4. **Translations table RLS posture** — `translations` is a cache table (used by `/api/translate`). Should authenticated users be able to read?
   - What we know: Phase 12 created it; STATE.md doesn't specify posture.
   - What's unclear: Whether `SELECT` is open to authenticated, or service-role-only with cache reads going through an RPC.
   - Recommendation: Inspect `20260424000001_add_translations_table.sql` and document actual posture. If currently deny-all (no policies), the cache works only via service role — confirm with `/api/translate` implementation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (already in `package.json`) — used only for repo-side unit tests of audit query parsing if applicable |
| Config file | `vitest.config.ts` (existing, tests dir `tests/unit/**`) |
| Quick run command | `bun run test` (vitest run) |
| Full suite command | `bun run test` (no separate suites needed for ops phase) |

**Note:** Phase 61 is an operations phase, NOT a code phase. Most "tests" are CLI verification commands and SQL queries, not Vitest tests. The `nyquist_validation` toggle is enabled, so this section documents how to translate operational verification into the VALIDATION.md format.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROD-DB-01 | Production Supabase project exists and is reachable | smoke | `bunx supabase migration list --db-url "$PROD_DB_URL"` returns non-error exit code | N/A (CLI command) |
| PROD-DB-02 | All 21 migrations applied | smoke | `bunx supabase migration list --db-url "$PROD_DB_URL" \| grep -c "Applied"` returns `21` | N/A (CLI command) |
| PROD-DB-03 | Super-admin row exists for skale.club@gmail.com | smoke | SQL: `SELECT count(*) FROM platform_admins pa JOIN auth.users u ON u.id=pa.user_id WHERE u.email='skale.club@gmail.com'` returns `1` | N/A (SQL via dashboard or `supabase db execute`) |
| PROD-DB-04 | PITR enabled with ≥7-day retention | manual-only | Dashboard screenshot (no API exposes PITR config) | ❌ Wave 0 — `supabase/audits/61-pitr-enabled.png` |
| PROD-DB-05 | RLS posture audit passes | automated SQL | Run `supabase/audits/rls-audit.sql`; zero rows where `posture LIKE 'FAIL%'` | ❌ Wave 0 — `supabase/audits/rls-audit.sql` + `61-prod-rls-snapshot.txt` |

### Sampling Rate
- **Per task commit:** No per-task tests — each Wave is one-shot manual operation; verification command runs at end of Wave
- **Per wave merge:** Run the wave's verification command (e.g. `migration list` after Wave 1)
- **Phase gate:** All 5 verification commands above must pass before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `supabase/audits/rls-audit.sql` — committed query that validates PROD-DB-05 (per §RLS Audit Query above)
- [ ] `supabase/audits/61-prod-rls-snapshot.txt` — saved output of the audit query against prod DB
- [ ] `supabase/audits/61-pitr-enabled.png` — screenshot evidence for PROD-DB-04 (PITR has no programmatic check)
- [ ] (Optional) `supabase/audits/61-migration-list.txt` — saved output of `migration list --db-url` for audit trail
- [ ] No new Vitest test files needed — operational phase

## Project Constraints (from CLAUDE.md)

- **NEVER commit secrets, API keys, or signing secrets to git** — including in markdown, comments, examples, or planning docs (`.planning/`, seeds, summaries). All Phase 61 documentation MUST use placeholders (`<prod-db-password>`, `<service-role-key>`, etc.).
- **Pre-commit hook (`gitleaks`)** blocks patterns: `whsec_*`, `sk_(test|live)_*`, `rk_(test|live)_*`, `sb_secret_*`, `sk-ant-*`, `sk-proj-*`, `re_*`. Production keys WILL match `sb_secret_*` and `sb_publishable_*` patterns — must stay out of git.
- **GSD Workflow Enforcement** — this phase is executed via `/gsd:execute-phase`, not direct edits.
- **Tech Stack constraint** — Supabase PostgreSQL with RLS on all tables (PROD-DB-05 directly verifies this).
- **Security** — Service role key never exposed to browser; all AI calls server-side. Phase 61 records the prod service role key into vault, NOT into a public env var.
- **Service role naming** — `SUPABASE_SERVICE_ROLE_KEY` declared WITHOUT `NEXT_PUBLIC_` prefix (STATE.md SEC-03). Prod values follow the same convention.

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260409000001_initial_schema.sql` — schema baseline (8 tenant tables + 4 storage buckets + ~36 RLS policies)
- `supabase/migrations/20260419000001_platform_admin.sql` — platform tables (deny-all by omission pattern)
- `supabase/migrations/20260503000002_seed_platform_admin.sql` — bootstrap pattern (looks up by email)
- `supabase/ADMIN-BOOTSTRAP.md` — first-admin manual procedure (existing project doc)
- `supabase/config.toml` — Postgres major_version=17, project_id=xtimator
- `.planning/STATE.md` — established conventions: `bunx supabase db push --db-url`, service role naming, deny-all RLS pattern (D-13)
- `.planning/REQUIREMENTS.md` — exact text of PROD-DB-01..05
- `.planning/ROADMAP.md` lines 156-167 — Phase 61 goal and success criteria
- [Supabase CLI db push reference](https://supabase.com/docs/reference/cli/supabase-db-push) — `--db-url` flag, dry-run, migration history
- [Supabase Database Migrations guide](https://supabase.com/docs/guides/deployment/database-migrations) — recommended workflow
- [Supabase Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod) — go-live posture

### Secondary (MEDIUM confidence, verified)
- [Supabase PITR docs](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery) — Pro plan required + add-on pricing
- [Supabase Backups overview](https://supabase.com/docs/guides/platform/backups) — daily snapshots vs PITR distinction
- [Supabase Pricing](https://supabase.com/pricing) — Pro plan $25/mo; PITR add-on extra
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — pg_policies query patterns
- [PITR GA blog post](https://supabase.com/blog/postgres-point-in-time-recovery) — Pro-tier add-on confirmation

### Tertiary (LOW confidence)
- Anecdotal pooler-vs-direct-port behavior on Windows (Pitfall 6) — verify at execution time
- `translations` table RLS posture (Open Question 4) — not directly inspected in this research pass; verify in plan

## Metadata

**Confidence breakdown:**
- Migration application procedure: HIGH — established convention used in every prior phase; CLI behavior documented
- Super-admin bootstrap: HIGH — existing migration + existing ADMIN-BOOTSTRAP.md
- PITR cost/availability: HIGH — confirmed via Supabase docs and pricing page
- RLS audit query: HIGH — straightforward `pg_policies` / `pg_class` JOIN; auditable on dev DB before prod runs
- Region selection: MEDIUM — recommendation based on industry default + Vercel alignment; user may prefer matching dev
- pg_cron extension dependency: HIGH — directly observed in 3 migration files
- Storage bucket policies: HIGH — directly observed in initial schema migration
- Translations table posture: LOW — not inspected; planner should verify

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days — Supabase pricing/PITR availability is stable; CLI behavior is stable)
