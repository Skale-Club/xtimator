# Production Database Bootstrap Runbook

> Establishes the production database, super-admin, and verification gates.

**Phase 61 decision (2026-05-15):** v3.1 uses a **single-environment** setup — the existing Supabase project (`prmqgcrnpuvpzruyzvuv`) serves both dev and prod. Separate prod project deferred until customer base grows.

---

## Quick verification (run anytime)

```bash
# Confirm DB is in expected state
node supabase/audits/run-prod-readiness.mjs
```

Reads `.env.production` for `PROD_DB_URL` (currently same as dev `DATABASE_URL`).

Pass criterion: all 4 checks return OK.
- [1/4] RLS audit: zero FAIL rows
- [2/4] Migration count: matches `supabase/migrations/` file count (currently 21)
- [3/4] Storage buckets: 5 expected buckets present (`audio`, `photos`, `pdfs`, `logos`, `platform-brand`)
- [4/4] Super-admin bootstrap: `skale.club@gmail.com` present

---

## Provisioning a separate prod project (when ready to split dev/prod)

When customer base grows enough to justify separation, follow this procedure:

### 1. Create new Supabase project

1. Go to https://supabase.com/dashboard → "New project"
2. Settings:
   - **Name:** `xtimator-prod`
   - **Region:** `us-east-1` (aligns with Vercel default)
   - **Plan:** `Free` (or upgrade to Pro if PITR is needed — see "PITR Upgrade Path" below)
   - **DB Password:** generate strong password, **save to password manager immediately**
3. Wait ~2 min for provisioning

### 2. Enable pg_cron BEFORE migrations

**Critical:** 3 migrations depend on pg_cron extension. Without it, `db push` aborts midway.

1. Dashboard → Database → Extensions
2. Search `pg_cron` → toggle ON
3. Verify via SQL Editor: `SELECT extname FROM pg_extension WHERE extname='pg_cron';` returns 1 row

### 3. Capture secrets to .env.production (gitignored)

From Dashboard → Settings → API:
```bash
# .env.production (NEVER commit)
PROD_DB_URL=postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 4. Apply migrations

```bash
npx -y supabase db push --db-url "$PROD_DB_URL"
```

Should apply all 21 migrations in order. If any fails, investigate (likely pg_cron not enabled).

### 5. Bootstrap super-admin (chicken-and-egg solution)

The `20260503000002_seed_platform_admin.sql` migration runs `INSERT INTO platform_admins SELECT id FROM auth.users WHERE email = 'skale.club@gmail.com'`. On a fresh DB, `auth.users` is empty, so the seed inserts 0 rows.

**Fix in 2 steps:**

1. Dashboard → Authentication → Users → "Invite user" → enter `skale.club@gmail.com` → click "Send invitation"
2. Re-run the seed manually in SQL Editor:
   ```sql
   INSERT INTO platform_admins (user_id)
   SELECT id FROM auth.users WHERE email = 'skale.club@gmail.com'
   ON CONFLICT (user_id) DO NOTHING;
   ```

Verify:
```sql
SELECT u.email FROM platform_admins pa
  JOIN auth.users u ON u.id = pa.user_id;
```
Should return 1 row.

### 6. Run readiness gate

```bash
node supabase/audits/run-prod-readiness.mjs
```

All 4 checks must pass before proceeding to Phase 62 (deploy).

---

## PITR Upgrade Path (when paid tier is justified)

Free tier provides automatic daily backups (2-day retention). For PITR (Point-in-Time Recovery):

1. Upgrade to Supabase Pro plan ($25/mo)
2. Enable PITR add-on (~$100/mo for 7-day retention)
3. Total: ~$125/mo recurring
4. Verify PITR is active in Dashboard → Database → Backups

Cost-justified when:
- 50+ active customers (data loss risk material)
- Compliance requirements (e.g., contractual SLA)
- Expanding beyond solo dev (need ability to restore after team-mate mistakes)

Until then, free-tier daily backups are sufficient given low traffic and ability to replay from migrations.

---

## Common Recovery Operations

### Re-apply a single migration

```bash
# Mark a migration as needing re-apply (rare — usually unintended)
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260513000001';

# Then push will re-run it
npx -y supabase db push --db-url "$PROD_DB_URL"
```

### Restore from backup (free tier — manual)

1. Dashboard → Database → Backups → select date
2. "Restore" — creates a new project (does NOT overwrite current)
3. Update `.env.production` with new project credentials
4. Update Vercel env vars

### Rotate DB password

1. Dashboard → Settings → Database → Reset database password
2. Save new password to password manager
3. Update `PROD_DB_URL` in `.env.production` and Vercel env vars
4. Re-deploy app to pick up new connection string

### Add second super-admin

```sql
-- After the user has signed up (auth.users row exists)
INSERT INTO platform_admins (user_id, notes)
SELECT id, 'added 2026-XX-XX as backup admin' FROM auth.users WHERE email = 'newadmin@example.com'
ON CONFLICT (user_id) DO NOTHING;
```

---

## Audit Files Reference

| File | Purpose |
|------|---------|
| `supabase/audits/rls-audit.sql` | SQL query: PASS/FAIL posture per table |
| `supabase/audits/run-audit.mjs` | Cross-platform audit runner (no psql needed) |
| `supabase/audits/run-prod-readiness.mjs` | Composite 4-check gate (RLS + migrations + buckets + super-admin) |
| `supabase/audits/run-prod-readiness.sh` | Bash equivalent for unix users |
| `supabase/audits/EXPECTED-POSTURE.md` | Documented baseline of expected RLS posture per table |
| `supabase/audits/compare-migrations.mjs` | Diagnostic: which on-disk migrations are missing from DB |
| `supabase/audits/check-tables.mjs` | Diagnostic: verify specific tables/columns exist |
| `supabase/audits/check-buckets-and-admin.mjs` | Diagnostic: list buckets and super-admins |
