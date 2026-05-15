# Expected RLS Posture — Xtimator Production

> Baseline classification of every table in `public` and `storage` schemas.
> The `rls-audit.sql` query MUST return zero rows where `posture LIKE 'FAIL%'` against production.

## Tenant tables (RLS enabled, scoped by company_id → auth.uid())

| Table | Schema | Min policy count | Pattern |
|-------|--------|------------------|---------|
| companies | public | 4 | `user_id = (SELECT auth.uid())` |
| clients | public | 4 | tenant via companies |
| projects | public | 4 | tenant via companies |
| recordings | public | 4 | tenant via companies |
| photos | public | 4 | tenant via companies |
| estimates | public | 4 | tenant via companies (+ optional public share_token select) |
| estimate_sections | public | 4 | tenant via companies |
| estimate_items | public | 4 | tenant via companies |
| estimate_activity | public | 3 | tenant via companies |
| company_price_book | public | 4 | tenant via companies |
| company_whatsapp | public | 4 | tenant via companies |
| blog_posts | public | (verify on dev) | (likely public read + admin write) |
| platform_admins | public | 3 | self-referential admin-only (technically not pure tenant) |

## Deny-all tables (RLS enabled, ZERO policies — service-role-only access)

| Table | Schema | Expected policy count | Reason |
|-------|--------|----------------------|--------|
| platform_integrations | public | 0 | Encrypted secrets — admin UI uses service role |
| platform_branding | public | 0 | Admin-only write via service role |
| usage_events | public | 0 | Append-only event log — service role only |
| company_whatsapp | public | 0 | Per-Phase 40: deny-all by design (connectWhatsApp uses service role) |
| whatsapp_sessions | public | 0 | Webhook-managed only |
| whatsapp_processed_messages | public | 0 | Dedup log — webhook-managed only |
| processed_stripe_events | public | 0 | Webhook dedup — service role only |

## Tables with bespoke policy patterns (NOT in tenant or deny-all set)

| Table | Schema | Policy count | Pattern |
|-------|--------|--------------|---------|
| translations | public | 1 | Public SELECT for client reads; service-role writes only (per Phase 12) |
| blog_posts | public | 1 | Public SELECT; admin-only write |

## Storage buckets (storage.objects)

| Bucket | Expected ownership pattern | Policy count |
|--------|---------------------------|--------------|
| audio | `(storage.foldername(name))[1]` = company_id | 3 |
| photos | `(storage.foldername(name))[1]` = company_id | 3 |
| pdfs | `(storage.foldername(name))[1]` = company_id | 3 |
| logos | `(storage.foldername(name))[1]` = company_id | 3 |
| platform_brand_assets | admin-only write, bucket public=true | 3 |

## Dev baseline (captured 2026-05-15)

Running `node supabase/audits/run-audit.mjs` against DEV returned:

- **Total rows:** 26 (18 public + 8 storage)
- **OK rows:** 26
- **WARN rows:** 0
- **FAIL rows:** 0

## Known deviations

None — dev baseline is clean.

**Audit query refinements made during Wave 1 validation (2026-05-15):**

1. Initial run flagged `company_whatsapp` as FAIL (0 policies, classified as tenant table). Investigation of `supabase/migrations/20260510000002_phase40_whatsapp.sql` confirmed deny-all is intentional (`-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.`). Audit query updated to include `company_whatsapp` in the deny-all set.

2. Initial run flagged `translations` as WARN (1 policy, classified as deny-all). Investigation confirmed this is bespoke: deny-all WRITES (per Phase 12) but public SELECT for client reads. Audit query updated to remove `translations` from deny-all set; documented separately as bespoke pattern.

These are query refinements based on real codebase intent — no production policy changes needed.

## How to run

```bash
# Dev (uses DATABASE_URL from .env.local)
node supabase/audits/run-audit.mjs

# Production (uses PROD_DB_URL from .env.production)
node supabase/audits/run-audit.mjs --prod

# Save snapshot to file
node supabase/audits/run-audit.mjs --prod --snapshot=.planning/phases/61-production-database-foundation/61-prod-rls-snapshot.txt
```
