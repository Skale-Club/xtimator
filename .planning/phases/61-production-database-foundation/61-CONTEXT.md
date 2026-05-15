# Phase 61: Production Database Foundation — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Source:** Inline decisions after RESEARCH.md review

<domain>
## Phase Boundary

Provision a fresh production Supabase project that mirrors the dev schema, bootstrap the first super-admin, and establish a verifiable RLS posture. **No application code changes.** Deliverables are: a live production database, a committed RLS audit query, a secrets manifest (stored out-of-git), and a runbook snippet for the bootstrap procedure.

</domain>

<decisions>
## Implementation Decisions

### Supabase Plan & Cost
- **Free tier** — no Pro plan, no PITR add-on for v3.1
- Total cost authorized: **$0/mo recurring** for the database
- Free tier provides automatic daily backups (2-day retention by default) — this is the v3.1 backup posture
- **PITR (PROD-DB-04) is DEFERRED** until paid tier upgrade — document the upgrade path but do not block go-live

### Region
- **us-east-1** (aligns with Vercel default free tier)
- Different from dev (us-west-2) — accepted tradeoff, latency between app and DB matters more than env-parity

### Super-Admin Bootstrap
- **Method: Dashboard invite + re-run seed**
  1. Supabase Dashboard → Auth → Users → "Invite user" → enter `skale.club@gmail.com`
  2. This creates a row in `auth.users` (no password set; user accepts via email link later)
  3. Re-run the existing seed migration `20260503000002_seed_platform_admin.sql` — the SELECT from `auth.users` now matches
  4. Verify with `SELECT email FROM platform_admins WHERE email = 'skale.club@gmail.com';`

### Translations Table RLS
- **Apply deny-all RLS** (service-role-only writes), consistent with Phase 12 platform-wide pattern
- Same posture as `platform_integrations`, `processed_stripe_events`, `usage_events`
- Reads via API route `/api/translate` (which uses authenticated client + dictionary table)

### pg_cron Extension
- **Must be enabled BEFORE `bunx supabase db push`** — three migrations depend on it (phase18_cleanup_cron, phase43_whatsapp_session_expiry, phase60_pg_cron_trial)
- Enable via Supabase Dashboard → Database → Extensions → `pg_cron` BEFORE running migrations

### Migration Application
- Tool: `bunx supabase db push --db-url <PROD_URL>` (Windows-friendly, no Docker)
- Ordering: enforced by Supabase via `supabase_migrations.schema_migrations` table
- No squashing — apply all 21 existing migrations in order
- **If a migration fails midway:** stop, investigate, fix the migration file or the DB state, re-run. Do NOT skip migrations.

### Secrets Manifest (storage location)
- Capture during provisioning: Project URL, anon key, service role key, JWT secret, DB password, full connection string
- Store in `.env.production` (gitignored) on the local machine for now — copied into Vercel env vars during Phase 62
- **NEVER commit any of these to git**

### Storage Buckets
- Recreate the same buckets that exist in dev: `logos`, `audio`, `photos`, `pdfs`, `platform_brand_assets`
- Apply same RLS as dev (each bucket has its own policy already in migrations)

### Type Generation
- Skip in this phase — types are generated against dev DB, prod schema is identical after migrations apply
- If needed later: use Supabase REST OpenAPI introspection (established Windows workaround, no Docker)

### Claude's Discretion
- Exact wording of `61-prod-rls-snapshot.txt` output format
- Whether to include extension verification (`SELECT * FROM pg_extension`) as part of the audit
- Folder structure for the runbook bootstrap snippet within `supabase/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Conventions
- `CLAUDE.md` — project guidelines, especially "Secret Handling (CRITICAL)" section
- `.planning/PROJECT.md` — current state, tech stack, what's live in dev
- `.planning/ROADMAP.md` — Phase 61 success criteria (5 criteria)
- `.planning/REQUIREMENTS.md` — PROD-DB-01..05 (note: PROD-DB-04 marked DEFERRED for free tier)

### Existing Migrations (must apply in order)
- `supabase/migrations/` — 21 files spanning Phase 1 → Phase 60
- Key migrations:
  - `20260503000002_seed_platform_admin.sql` — super-admin seed (chicken-and-egg)
  - `phase18_cleanup_cron.sql`, `phase43_whatsapp_session_expiry.sql`, `phase60_pg_cron_trial.sql` — require pg_cron enabled

### Existing Bootstrap Procedure
- `supabase/ADMIN-BOOTSTRAP.md` — original manual SQL procedure from Phase 8 (kept as reference; not used since we chose Dashboard invite)

### Research Output
- `.planning/phases/61-production-database-foundation/61-RESEARCH.md` — full domain research including Validation Architecture

</canonical_refs>

<specifics>
## Specific Verification Outputs (committed to repo)

1. **`supabase/audits/rls-audit.sql`** — SQL query JOINing `pg_class` + `pg_policies` returning posture (PASS/FAIL per table)
2. **`.planning/phases/61-production-database-foundation/61-prod-rls-snapshot.txt`** — saved output of running rls-audit.sql against production. Zero FAIL rows = pass.
3. **`supabase/PROD-BOOTSTRAP.md`** — concise runbook: dashboard invite steps + commands to re-run seed + verification query for the first super-admin

## Non-Goals (deliberately NOT in this phase)

- Vercel env var configuration → Phase 62
- Sentry/monitoring → Phase 64
- Type regeneration → not needed (dev types == prod schema after migrations)
- Stripe live mode setup → Phase 63
- PITR enablement → deferred until paid tier upgrade

</specifics>

<deferred>
## Deferred Ideas

- **PITR enablement** — needs ~$100/mo PITR add-on on top of Pro plan. Document in `.planning/runbook.md` (Phase 64) the upgrade procedure.
- **DR drill** — full restore exercise. Deferred to v3.2.
- **Multi-region replicas** — deferred indefinitely (US-only target market).

</deferred>

---

*Phase: 61-production-database-foundation*
*Context gathered: 2026-05-15 via inline post-research decision capture*
