---
phase: 120-company-kb-overlay-tenant
plan: 02
subsystem: knowledge
tags: [knowledge-base, company-overlay, settings-ui, tenant, rls, two-panel-rule, i18n]
requires:
  - "createCompanyEntry / updateCompanyEntry / deleteCompanyEntry + companyKnowledgeEntrySchema (Plan 120-01)"
  - "getAuthClaims (lib/queries/auth) + getActiveCompany (lib/queries/active-company)"
  - "authed createClient (lib/supabase/server) + Phase-117 company-overlay RLS"
  - "SubNav / settings-nav ITEMS pattern (components/settings/settings-nav.tsx)"
provides:
  - "/settings/knowledge tenant overlay panel (list + new + [id]/edit + delete)"
  - "industry-free EntryForm resolving companyKnowledgeEntrySchema"
  - "Knowledge entry in the settings nav"
affects:
  - "Phase 121 (the KB the WhatsApp KNOWLEDGE intent retrieves now has a tenant-facing curation surface)"
tech-stack:
  added: []
  patterns:
    - "standalone /settings/* page auth: getAuthClaims redirect → getActiveCompany redirect → authed createClient"
    - "tenant overlay = 1:1 mirror of app/admin/knowledge/ with tenant auth + authed RLS client + no industry select (the two-panel rule)"
    - "render-free route-surface test: readFileSync + forbidden-token / scope grep, plus a light RTL container render (no jest-dom)"
key-files:
  created:
    - "app/(app)/settings/knowledge/page.tsx"
    - "app/(app)/settings/knowledge/new/page.tsx"
    - "app/(app)/settings/knowledge/entry-form.tsx"
    - "app/(app)/settings/knowledge/entry-form-wrapper.tsx"
    - "app/(app)/settings/knowledge/entry-actions.tsx"
    - "app/(app)/settings/knowledge/[id]/page.tsx"
    - "app/(app)/settings/knowledge/[id]/edit-entry-wrapper.tsx"
    - "tests/unit/settings/knowledge-overlay-form.test.tsx"
  modified:
    - "components/settings/settings-nav.tsx"
decisions:
  - "Tenant auth + authed RLS client (getAuthClaims/getActiveCompany/createClient), NEVER requireAdmin/requireServiceClient — the Phase-117 company_members RLS isolates the tenant; the service client would bypass it"
  - "Form omits the industry Select and resolves companyKnowledgeEntrySchema — company rows carry industry_id NULL (Phase-117 scope CHECK)"
  - "Flat company-scoped list (no KnowledgeIndustryGroup) — a single company's overlay is one flat set, not industry-grouped"
  - "Added a UI test (knowledge-overlay-form.test.tsx) although the plan called it test-free — it cheaply locks the load-bearing divergence (no industry field) + the two-panel grep gate"
metrics:
  duration: ~10m
  completed: 2026-06-25
  tasks: 2
  commits: 2
  files_created: 8
  files_modified: 1
---

# Phase 120 Plan 02: Company KB Overlay (tenant settings UI) Summary

The owner-facing half of the company KB overlay: a `/settings/knowledge` sub-route — a 1:1 mirror of the Phase-119 super-admin `app/admin/knowledge/` surface with three security-substituted differences (tenant `getAuthClaims`+`getActiveCompany` auth, the RLS-bound authed `createClient()`, and a form that OMITS the industry `<Select>` resolving `companyKnowledgeEntrySchema`). It is a distinct surface from `/admin/knowledge` (the two-panel rule), a curation panel (add/edit/delete) NOT a KB reader, wired into the settings nav and calling the three Plan 120-01 actions.

## Continuation Context

A prior run was cut off mid-execution: it had created the three Task-1 files (`page.tsx`, `new/page.tsx`, `entry-form-wrapper.tsx`) and added the settings-nav entry, but committed NOTHING and left Task 2 (the form, the `[id]/edit` route, the delete action) undone — the `[id]/` directory existed but was empty. This run reconciled the partial files against the plan (they matched exactly — kept verbatim), finished Task 2, added the UI test, and committed the WHOLE plan as two atomic task commits.

## What Shipped

- **`app/(app)/settings/knowledge/page.tsx`** — server component (`dynamic='force-dynamic'`), tenant auth (`getAuthClaims` → `/?auth=login`, `getActiveCompany` → `/onboarding`), authed `createClient()` SELECT scoped `.eq('scope','company').eq('company_id', company.id)` ordered by `created_at desc`. Renders the `space-y-8 p-6` header (`Knowledge base` + owner copy + a `New entry` button) and a glass Card: empty → EmptyState copy; else a FLAT table (Title / Source / Status / Created / Actions) — no `KnowledgeIndustryGroup`. Status badge: `embedding == null` → amber `Needs reindex`, else `Indexed`. Every string via `<T>`.
- **`app/(app)/settings/knowledge/new/page.tsx`** — tenant-auth create route rendering a glass `<Card><EntryFormWrapper/></Card>`.
- **`app/(app)/settings/knowledge/entry-form-wrapper.tsx`** (`'use client'`) — `useTransition`+`useRouter`+`toast`+`useTranslation`; `handleSave` → `createCompanyEntry({ ...data, source: data.source?.trim() || null })`; ok → toast + `router.push('/settings/knowledge')`.
- **`app/(app)/settings/knowledge/entry-form.tsx`** (`'use client'`) — RHF + `zodResolver(companyKnowledgeEntrySchema)`, `EntryFormInitial = { title, body, source }` (NO `industry_id`). Renders ONLY Title/Body/Source inputs + the Save button — the entire industry `<Select>` block and `INDUSTRIES` import removed.
- **`app/(app)/settings/knowledge/[id]/page.tsx`** — tenant-auth edit route loading the row `.eq('id', id).eq('scope','company').eq('company_id', company.id).maybeSingle()` → `notFound()` if absent; renders `<EditEntryWrapper entry={...}/>`.
- **`app/(app)/settings/knowledge/[id]/edit-entry-wrapper.tsx`** (`'use client'`) — `initial` from the row (no `industry_id`); `handleSave` → `updateCompanyEntry(entry.id, { ...data, source: trim||null })`; ok → toast + push back to the list.
- **`app/(app)/settings/knowledge/entry-actions.tsx`** (`'use client'`) — `confirm()` guard → `deleteCompanyEntry(id)`; ok → toast + `router.refresh()`.
- **`components/settings/settings-nav.tsx`** — ONE `{ value:'knowledge', label:'Knowledge', Icon: BookOpen, href:'/settings/knowledge' }` item after `domain`, before `integrations`; `BookOpen` added to the lucide import. No duplicate (verified the prior run added exactly one).
- **`tests/unit/settings/knowledge-overlay-form.test.tsx`** (new, 7 cases) — renders the `EntryForm` and asserts it exposes title/body/source and NO industry field (the load-bearing divergence); a `companyKnowledgeEntrySchema` gate (accepts `{title,body}`+optional source, rejects empty, drops a stray `industry_id`); and a route-surface grep gate (`readFileSync` over all 7 route files: none contain `requireAdmin`/`requireServiceClient`/`getIndustryLabel`/`INDUSTRIES`/`industry_id`; list+edit both scope `scope='company'`+`company.id`+`getActiveCompany`; the three wrappers wire `createCompanyEntry`/`updateCompanyEntry`/`deleteCompanyEntry`). Uses RTL `container` queries (this repo has no jest-dom).

## The Two-Panel Rule (the load-bearing invariant)

`/settings/knowledge` is the TENANT panel; `/admin/knowledge` is the super-admin platform-asset panel — distinct surfaces, distinct RLS. The tenant route imports NONE of `requireAdmin` / `requireServiceClient` / `getIndustryLabel` / `INDUSTRIES` / `industry_id` (grep gate green, asserted by the test). It reads/writes through the RLS-bound authed `createClient()` scoped to `scope='company'` + the active `company_id`, so a tenant only ever sees and edits their own overlay rows. No owner-facing KB browser — this is a curation surface only (add/edit/delete), consult via chat (Phase 121).

## Verification

- `npx tsc --noEmit` → no errors in any of the 8 touched source files.
- Grep gate over `app/(app)/settings/knowledge/` → NONE of `requireAdmin` / `requireServiceClient` / `getIndustryLabel` / `INDUSTRIES` / `industry_id`.
- `npx vitest run tests/unit/settings/knowledge-overlay-form.test.tsx` → 7/7 GREEN.
- FULL `npx vitest run` → **312 files passed | 1 failed | 3 skipped, 2213 passed | 2 skipped | 33 todo**. The single fail is the KNOWN parallel-only `mcp-route-contract.test.ts` GET-405 timeout flake — re-confirmed **8/8 GREEN in isolation** (touches no Phase-120 file; out-of-scope, pre-existing). Baseline 120-01 was 312 files / 2207 passed; this plan adds +1 test file / +6 tests. No regressions.
- Manual route trace: `/settings/knowledge` (list) → `New entry` → `/settings/knowledge/new` (create→createCompanyEntry) → `/settings/knowledge/[id]` (edit→updateCompanyEntry) → delete from the list (deleteCompanyEntry). Every action resolves to a `lib/actions/company-knowledge.ts` export.

## Deviations from Plan

**1. [Added a UI test]** — the plan's verification said "no test changes (UI only)", but the objective for this run called for "the UI test". Added `tests/unit/settings/knowledge-overlay-form.test.tsx` (7 cases) to cheaply lock the two load-bearing risks of this plan: that the form has NO industry field, and that the route surface imports none of the admin/industry primitives (the two-panel grep gate). It is purely additive (new file, no existing test touched) and green. No source behavior changed as a result.

No other deviations — the partial Task-1 files matched the plan verbatim and were kept; Task 2 was implemented exactly as specified.

## Known Stubs

None. All three actions are wired to the real Plan 120-01 server actions; the empty list is an intentional EmptyState (the overlay is optional — no overlay = industry KB only), not a stub.

## Self-Check: PASSED

- `app/(app)/settings/knowledge/page.tsx` — FOUND
- `app/(app)/settings/knowledge/new/page.tsx` — FOUND
- `app/(app)/settings/knowledge/entry-form.tsx` — FOUND
- `app/(app)/settings/knowledge/entry-form-wrapper.tsx` — FOUND
- `app/(app)/settings/knowledge/entry-actions.tsx` — FOUND
- `app/(app)/settings/knowledge/[id]/page.tsx` — FOUND
- `app/(app)/settings/knowledge/[id]/edit-entry-wrapper.tsx` — FOUND
- `tests/unit/settings/knowledge-overlay-form.test.tsx` — FOUND
- `components/settings/settings-nav.tsx` (Knowledge entry) — FOUND
- Commit `a49d9ba` (Task 1: list + new + nav) — FOUND
- Commit `75f8aaff` (Task 2: form + edit + delete + test) — FOUND

## Requirements Satisfied

- **KOVL-01** (UI half) — the company owner has a distinct `/settings/knowledge` panel (linked from settings-nav) to add/edit/delete private overlay entries; the list shows only this company's `scope='company'` rows (RLS + explicit `company_id`); the form has no industry select; the surface is separate from `/admin/knowledge` (the two-panel rule); curation only, no KB reader.

## Next

Phase 120 now **2/2 plans — COMPLETE** (the LAST plan). KOVL-01/02 fully shipped (write half 120-01 + UI half 120-02). Next: `/gsd:verify-work 120`, then Phase 121 (WhatsApp KNOWLEDGE intent — the consumer that proves the module end-to-end). NOTE: `phase complete` mis-points next at stale 999.1 — the real next phase after 120 is **121**.
