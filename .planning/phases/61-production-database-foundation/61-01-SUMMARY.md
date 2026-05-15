---
phase: 61-production-database-foundation
plan: "01"
subsystem: prod-readiness-audit
tags: [audit, rls, supabase, validation, ops]
dependency_graph:
  requires: []
  provides: [rls-audit-query, expected-posture-doc, prod-readiness-script]
  affects: [supabase/audits/]
tech_stack:
  added: [pg@8.x, dotenv@17.x]
  patterns: [Node.js audit runner (cross-platform Windows-compatible alternative to psql), pg_class + pg_policies JOIN for RLS posture]
key_files:
  created:
    - supabase/audits/rls-audit.sql
    - supabase/audits/EXPECTED-POSTURE.md
    - supabase/audits/run-audit.mjs
    - supabase/audits/run-prod-readiness.mjs
    - supabase/audits/run-prod-readiness.sh
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Cross-platform Node.js audit runner (run-audit.mjs) added because psql is not installed on Windows by default — pg library provides equivalent functionality"
  - "company_whatsapp moved into the deny-all set per Phase 40 migration intent (table is service-role-only by design — connectWhatsApp uses service role)"
  - "translations REMOVED from deny-all set — has 1 SELECT policy for client reads (legitimate, per Phase 12 'service-role-only writes' decision; reads are public)"
  - "run-prod-readiness.mjs counts migrations dynamically from supabase/migrations/ directory rather than hardcoding 21 — survives future migration additions"
metrics:
  duration_minutes: 25
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 2
  completed_date: "2026-05-15"
---

# Phase 61 Plan 01: RLS Audit Infrastructure (Wave 1)

**One-liner:** Cross-platform RLS posture audit infrastructure validated against dev with zero FAIL rows, ready for prod once provisioned.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write rls-audit.sql with PASS/FAIL posture column | d80865e | supabase/audits/rls-audit.sql |
| 2 | Validate audit against DEV and document EXPECTED-POSTURE.md | d80865e | supabase/audits/EXPECTED-POSTURE.md |
| 3 | Write run-prod-readiness composite check (mjs + sh) | d80865e | supabase/audits/run-prod-readiness.mjs, run-prod-readiness.sh, run-audit.mjs |

## Dev Baseline (captured 2026-05-15)

```
SUMMARY: TOTAL=26 OK=26 WARN=0 FAIL=0
```

26 tables across `public` (18) and `storage` (8) schemas. All posture checks pass.

## Audit Query Refinements During Wave 1

The first dev run flagged 1 FAIL + 1 WARN — both were classification bugs in the audit query, **not** production issues:

1. **`company_whatsapp` — flagged FAIL (TENANT TABLE HAS NO POLICIES)**
   - Investigated `supabase/migrations/20260510000002_phase40_whatsapp.sql`
   - Migration explicitly states: `-- No policies: deny-all for anon/authenticated. Service role bypasses RLS.`
   - Resolution: added `company_whatsapp` to the deny-all set in audit query

2. **`translations` — flagged WARN (DENY-ALL TABLE HAS POLICIES)**
   - Phase 12 decision: "service-role-only WRITES (no INSERT policy)" — but table has 1 public SELECT policy for client reads
   - Bespoke pattern: deny-all writes + public reads
   - Resolution: removed `translations` from deny-all set; documented separately in EXPECTED-POSTURE.md as bespoke

These refinements are exactly what Wave 1 was designed to catch — calibrating the audit tool against known-good dev state before pointing it at production.

## Cross-Platform Tooling Decision

**Plan called for psql.** Windows doesn't ship with psql, and installing it via winget adds a heavy dependency for a single use case. Solution:

- `supabase/audits/run-audit.mjs` — Node.js audit runner using `pg` library (works on Windows + Mac + Linux)
- `supabase/audits/run-prod-readiness.mjs` — Node.js readiness gate (composite check)
- `supabase/audits/run-prod-readiness.sh` — Bash equivalent kept for Unix users who prefer it

Both `pg@8.x` and `dotenv@17.x` added as devDependencies.

## Self-Check: PASSED

- `supabase/audits/rls-audit.sql` — EXISTS, contains CTE pattern, 7-table deny-all set
- `supabase/audits/EXPECTED-POSTURE.md` — EXISTS, documents bespoke + tenant + deny-all categories
- `supabase/audits/run-audit.mjs` — EXISTS, syntax valid (`node --check` passes)
- `supabase/audits/run-prod-readiness.mjs` — EXISTS, syntax valid, exits 0 only when all 4 checks pass
- `node supabase/audits/run-audit.mjs` — runs against DEV, returns SUMMARY: TOTAL=26 OK=26 WARN=0 FAIL=0
- No secrets in any committed file (gitleaks pattern grep returns 0)

## Ready for Wave 2

Plan 02 will provision the production Supabase project. Once the project URL + service role key are captured to `.env.production`, this plan's audit tooling can be re-run against production with `node supabase/audits/run-audit.mjs --prod` to confirm the same OK posture.
