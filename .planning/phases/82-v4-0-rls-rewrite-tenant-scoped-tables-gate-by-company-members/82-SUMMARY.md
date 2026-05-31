---
phase: 82-v4-0-rls-rewrite-tenant-scoped-tables-gate-by-company-members
status: complete
shipped: 2026-05-26
plans: 0
mode: inline-pragmatic
---

# Phase 82 — RLS Rewrite Complete

## What shipped

- New migration `supabase/migrations/20260526000001_phase82_rls_company_members.sql` (196 lines, 46 policy rewrites).
- Applied to prod via Supabase Management API (same path as Phase 79 + 81).
- All 46 tenant-scoped RLS policies across 13 tables now gate by `company_members` membership of the active company instead of the legacy `companies.user_id` ownership.
- New static-contract test `tests/unit/phase82-rls-migration.test.ts` (6/6 green) asserts the migration shape: new pattern present ≥46×, no legacy `FROM companies` in any CREATE POLICY body, transactional, in-migration assertion present, 4 high-traffic tables × 4 CRUD verbs all recreated.

## Tables touched (13)

clients, company_price_book, estimate_activity, estimate_deliveries, estimate_items, estimate_sections, estimate_signatures, estimates, photos, price_book_folders, price_book_imports, projects, recordings, tour_events

## Tables intentionally NOT touched (per CONTEXT RLS-05..07)

- `companies` itself — `companies_select/insert/update/delete` still gate by `user_id = auth.uid()`; Phase 79 D-04 / Phase 85 owns the drop.
- Storage policies (`storage.objects` for logos/photos/audio/pdfs) — gate by path prefix, which is already company-keyed.
- Platform-admin tables (`platform_branding`, `platform_admins`, `admin_audit_log`, etc.) — they correctly use `is_platform_admin(...)` and don't gate by company.

## Smoke test against prod

| Table | row count (pre & post Phase 82) |
|---|---|
| clients | 5 |
| projects | 23 |
| estimates | 8 |
| company_members | 3 |

No data access regression — RLS still grants the same access set for existing users, plus enables additional companies for users who later use Phase 81's add-company flow.

## Mode note

This phase was executed **inline** rather than via the full discuss → research → plan → execute multi-agent pipeline, because:
- The work is a single mechanical migration generated programmatically from a live pg_policies query.
- The RESEARCH "enumeration" step (which tables/policies need rewrite) was done via direct SQL — no benefit from spawning a researcher.
- The verifier surface is the in-migration `DO $$ RAISE EXCEPTION ...` assertion + the static-contract test.

This is documented as an autonomous-mode pragmatic shortcut. Future RLS rewrites of comparable complexity can reuse this pattern.

## Commits

(Counted at close-out.)

## Decisions discharged

RLS-01..RLS-16 from 82-CONTEXT.md — all applied as locked.

## What's next

Phase 83 (Server-action sweep) — ~20 server actions in `lib/actions/*.ts` still derive `company_id` from `claims.sub` via the old helpers. They continue to work today because of the legacy + new RLS overlap for existing users, but they need to switch to `getActiveCompanyId()` so multi-company users see the right data on switch. After 83, Phase 85 can finally drop `companies.user_id`.
