---
phase: 120-company-kb-overlay-tenant
plan: 01
subsystem: knowledge
tags: [knowledge-base, company-overlay, server-actions, pgvector, embeddings, rls, multi-tenant]
requires:
  - "knowledge_entries table + company-overlay RLS (Phase 117)"
  - "embed() from lib/knowledge/embed.ts (Phase 118)"
  - "getActiveCompanyId() active-company context (Phase 79)"
  - "assertWritable() demo guard"
provides:
  - "companyKnowledgeEntrySchema + CompanyKnowledgeEntryInput (lib/schemas/knowledge.ts)"
  - "createCompanyEntry / updateCompanyEntry / deleteCompanyEntry (lib/actions/company-knowledge.ts)"
affects:
  - "120-02 (the company-overlay settings UI consumes these three actions)"
tech-stack:
  added: []
  patterns:
    - "tenant getAuthContext copied verbatim from estimate-template.ts (active-company gate)"
    - "embed-then-insert; re-embed only on title/body change; toVectorLiteral serialization"
    - "RLS-bound AUTHED client (NOT service client) for tenant writes"
key-files:
  created:
    - "lib/actions/company-knowledge.ts"
    - "tests/unit/settings/knowledge-overlay-actions.test.ts"
  modified:
    - "lib/schemas/knowledge.ts"
decisions:
  - "Authed client + tenant active-company auth (NOT requireServiceClient / requireAdmin) — the Phase-117 company_members RLS gates the write; the service client would bypass RLS (security mistake)"
  - "Separate file from Phase 119 (no shared helper) — three-axis divergence makes duplication the clarity-preserving choice (toVectorLiteral duplicated, not extracted)"
  - "No audit log on the tenant overlay (mirrors estimate-template, which logs nothing); audit is the admin surface's concern"
metrics:
  duration: ~5m
  completed: 2026-06-24
  tasks: 2
  commits: 2
  files_created: 2
  files_modified: 1
---

# Phase 120 Plan 01: Company KB Overlay (tenant overlay actions + schema) Summary

Tenant-scoped write half of the company KB overlay: a `companyKnowledgeEntrySchema` (no `industry_id`) plus three server actions (`createCompanyEntry` / `updateCompanyEntry` / `deleteCompanyEntry`) in a new `lib/actions/company-knowledge.ts`, all gated by tenant active-company auth and writing `scope='company'` rows through the RLS-bound AUTHED Supabase client — a security-substituted mirror of the Phase-119 super-admin curation actions.

## What Shipped

- **`companyKnowledgeEntrySchema`** (`lib/schemas/knowledge.ts`, appended) — `{ title, body, source? }`, deliberately NO `industry_id` (company rows carry `industry_id: null` per the Phase-117 scope CHECK). The existing `knowledgeEntrySchema` (Phase 119) is untouched.
- **`lib/actions/company-knowledge.ts`** (new, `'use server'`) — three actions returning `{ ok: true } | { ok: false; message }`:
  - `createCompanyEntry` — `getAuthContext()` gate → `safeParse` → `embed(title+'\n\n'+body)` BEFORE the write (KOVL-02; embed throw → `ok:false`, NO insert) → AUTHED `supabase.from('knowledge_entries').insert({ scope:'company', company_id, industry_id:null, ..., embedding: toVectorLiteral(...) })`.
  - `updateCompanyEntry` — fetches existing `title,body` scoped by `.eq('id').eq('company_id')` (defense-in-depth on top of RLS); re-embeds ONLY when title or body changed (source-only edits skip embed); `.update(payload).eq('id').eq('company_id')`; no `industry_id` key in the payload.
  - `deleteCompanyEntry` — `.delete().eq('id').eq('company_id')`.
- **`getAuthContext()`** copied verbatim from `lib/actions/estimate-template.ts`: `createClient().auth.getClaims()` → `getActiveCompanyId()` → `{ id: activeCompanyId }` (skips a redundant SELECT — membership already validated) → `assertWritable()` demo guard → `{ supabase, company }`.
- **`tests/unit/settings/knowledge-overlay-actions.test.ts`** (new, 10 cases) — retargets the Phase-119 curation test to the authed client + company scope. Mocks `@/lib/supabase/server` (authed `createClient` with `getClaims`+`from`), `@/lib/queries/active-company`, `@/lib/demo/guard`, `@/lib/knowledge/embed`, `next/cache`; mocks `requireServiceClient` to THROW as a never-called regression guard.

## Security Invariant (the load-bearing point)

The overlay write uses the RLS-bound AUTHED `createClient()` — the Phase-117 `knowledge_entries_company_insert/update/delete` policies (gated by `company_members`) enforce tenant isolation. The action imports NO `requireServiceClient` / `requireAdmin` / `logAdminAction`, writes `scope='company'` + the active `company_id` + `industry_id: null`, and the test proves `requireServiceClient` is NEVER called. Using the service client here would bypass RLS — explicitly avoided.

## Verification

- `npx vitest run tests/unit/settings/knowledge-overlay-actions.test.ts` → **10/10 GREEN**.
- `npx vitest run tests/unit/admin/knowledge-curation-actions.test.ts` → **10/10** (Phase 119 not regressed — separate file).
- `npx tsc --noEmit` → no errors in `lib/actions/company-knowledge.ts` or `lib/schemas/knowledge.ts`.
- Grep gates: `scope: 'company'` + `industry_id: null` + `getActiveCompanyId` + authed-client import + `assertWritable` all present; NO real import of `requireServiceClient` / `requireAdmin` / `logAdminAction` / `scope: 'industry'` (only doc-comment mentions).
- FULL `npx vitest run` → **312 files passed | 3 skipped, 2207 passed | 2 skipped | 33 todo** (baseline 119-02 310/2189; +2 files / +18). No regressions; the known parallel-only `mcp-route-contract.test.ts` flake did not surface.

## TDD Flow

- **RED** (Task 1, commit `ad408b33`): test authored, failed with module-not-found for `@/lib/actions/company-knowledge` (correct Wave-0 state).
- **GREEN** (Task 2, commit `3cae578`): schema + three actions; test fully green. No REFACTOR step needed.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The three actions are fully wired to the real authed client + embed; the consuming settings UI lands in 120-02.

## Self-Check: PASSED

- `lib/actions/company-knowledge.ts` — FOUND
- `tests/unit/settings/knowledge-overlay-actions.test.ts` — FOUND
- `lib/schemas/knowledge.ts` (companyKnowledgeEntrySchema) — FOUND
- Commit `ad408b33` (RED test) — FOUND
- Commit `3cae578` (GREEN schema + actions) — FOUND

## Requirements Satisfied

- **KOVL-01** — `createCompanyEntry` / `updateCompanyEntry` / `deleteCompanyEntry` exist, gated by tenant active-company auth, read/write `scope='company'` rows for the active company via the RLS-bound authed client.
- **KOVL-02** — every overlay write embeds `title + '\n\n' + body` BEFORE the insert, blocks the save on embed failure, re-embeds only when title/body changes, and serializes via `toVectorLiteral`.

## Next

`/gsd:execute-phase 120` (Plan 120-02 — the company-overlay settings UI calling these three actions). Phase 120 now 1/2 plans.
