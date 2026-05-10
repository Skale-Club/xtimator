---
phase: 40-webhook-infrastructure
plan: "01"
subsystem: whatsapp-infrastructure
tags: [whatsapp, webhook, meta-graph-api, database, migration, tdd]
dependency_graph:
  requires: []
  provides:
    - supabase/migrations/20260510000002_phase40_whatsapp.sql
    - lib/whatsapp/types.ts
    - lib/whatsapp/verify.ts
    - lib/whatsapp/client.ts
  affects:
    - app/api/webhooks/whatsapp/route.ts (Plan 02 — consumes all three lib/whatsapp/ modules)
tech_stack:
  added: []
  patterns:
    - HMAC-SHA256 webhook signature verification via node:crypto (no new packages)
    - Meta Graph API v21.0 via native fetch (no SDK)
    - RLS deny-all pattern (same as platform_integrations) for all three WhatsApp tables
    - pg_cron idempotent DO $do$ guard for purge job (same pattern as Phase 18)
    - TDD RED→GREEN: test files written before implementation, confirmed failing, then passing
key_files:
  created:
    - supabase/migrations/20260510000002_phase40_whatsapp.sql
    - lib/whatsapp/types.ts
    - lib/whatsapp/verify.ts
    - lib/whatsapp/client.ts
    - tests/unit/whatsapp/verify.test.ts
    - tests/unit/whatsapp/client.test.ts
  modified:
    - .env.example
decisions:
  - "verifyWebhookSignature catches timingSafeEqual exception for length mismatch — returns false instead of throwing (Pitfall 4 from PITFALLS.md)"
  - "client.ts reads META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID from process.env at call time (not module init) — consistent with getIntegrationKey() per-request pattern"
  - "whatsapp_processed_messages uses message_id TEXT PRIMARY KEY (not UUID) — primary key is the wamid from Meta (e.g., wamid.HBgL...)"
  - "whatsapp_sessions does not have UNIQUE(company_id, phone_number) in this migration — noted as Pitfall 9 mitigation for Plan 02/03 to add when session upsert logic is implemented"
metrics:
  duration: "~4 minutes"
  completed: "2026-05-10"
  tasks: 2
  files: 7
requirements_satisfied:
  - WA-01
  - WA-02
  - WA-03
---

# Phase 40 Plan 01: WhatsApp Webhook Infrastructure — DB + Library Modules Summary

**One-liner:** Three WhatsApp DB tables with RLS deny-all, HMAC-SHA256 signature verifier using node:crypto timingSafeEqual, and typed Meta Graph API v21.0 client wrappers — all infrastructure for Plan 02's webhook route.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DB migration — three WhatsApp tables + RLS + pg_cron purge | b753d7b | supabase/migrations/20260510000002_phase40_whatsapp.sql |
| 2 | lib/whatsapp/ modules — types, verify, client + unit tests | 1841c64 | lib/whatsapp/types.ts, lib/whatsapp/verify.ts, lib/whatsapp/client.ts, tests/unit/whatsapp/verify.test.ts, tests/unit/whatsapp/client.test.ts, .env.example |

## Verification Results

- Migration applied successfully: `Finished supabase db push.` (no errors)
- Unit tests: 7/7 passed (5 in verify.test.ts, 2 in client.test.ts)
- TypeScript: `npx tsc --noEmit` — zero errors in lib/whatsapp/
- .env.example: 5 META_WHATSAPP_* vars with comments

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all exported functions are fully implemented and tested.

## Self-Check: PASSED

- [x] supabase/migrations/20260510000002_phase40_whatsapp.sql — FOUND (committed b753d7b)
- [x] lib/whatsapp/types.ts — FOUND (committed 1841c64)
- [x] lib/whatsapp/verify.ts — FOUND (committed 1841c64)
- [x] lib/whatsapp/client.ts — FOUND (committed 1841c64)
- [x] tests/unit/whatsapp/verify.test.ts — FOUND (committed 1841c64)
- [x] tests/unit/whatsapp/client.test.ts — FOUND (committed 1841c64)
- [x] .env.example updated — FOUND (committed 1841c64)
- [x] 7/7 unit tests green
- [x] Zero TypeScript errors in lib/whatsapp/
