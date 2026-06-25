# Phase 120: Company KB Overlay (tenant settings) - Research

**Researched:** 2026-06-24
**Domain:** Multi-tenant CRUD + pgvector embeddings (Next.js App Router server actions, Supabase RLS)
**Confidence:** HIGH

## Summary

Phase 120 builds the **tenant-side** half of the v4.8 Knowledge Base: a company owner CRUDs their own private `knowledge_entries` rows (`scope='company'`, `company_id = active company`) in a **new tenant settings sub-page**, distinct from the super-admin `/admin/knowledge` panel built in Phase 119 (the locked two-panel rule). Everything this phase needs already exists: the table + dual RLS (Phase 117), the `embed()` helper (Phase 118), the `match_knowledge_entries` RPC that merges overlay into retrieval (Phase 118), and proven patterns for both the UI (`/settings/estimate-templates`, `/settings/custom-domain`) and the tenant-CRUD action shape (`lib/actions/estimate-template.ts`, `lib/actions/price-book.ts`).

The phase is almost entirely a **mirror-with-substitutions** of Phase 119's `app/admin/knowledge/` surface: swap `requireAdmin()` → tenant `getAuthContext()` (active-company), swap the service client → the **RLS-enforced authed client**, swap `scope:'industry'`/`industry_id` → `scope:'company'`/`company_id`. The embed-then-insert path (KOVL-02) is identical to KCUR-02. The overlay is **optional with zero special handling**: `retrieve()` forwards `companyId` to the RPC, so a company with no overlay rows simply contributes nothing to the merge — already wired, nothing to add.

**Primary recommendation:** Create `app/(app)/settings/knowledge/` as a standalone settings sub-route (list + new + `[id]` edit), a new `lib/actions/company-knowledge.ts` with tenant-scoped create/update/delete using the **normal RLS-bound authed supabase client** (not the service client), and a new `companyKnowledgeEntrySchema` (no `industry_id`). Keep it SEPARATE from Phase 119's admin actions — do NOT extract a shared helper (the auth/scope/client divergence makes a shared abstraction more costly than clarity-preserving duplication, consistent with the codebase's "duplicated `getAuthContext` per action file" convention).

## User Constraints (from locked decisions — no CONTEXT.md present)

No `*-CONTEXT.md` exists for this phase. The constraints below are the **locked decisions** from REQUIREMENTS.md + SEED-033 + STATE.md that bind this phase with the same authority as a CONTEXT.md.

### Locked Decisions
- **Two panels, two scopes (NON-NEGOTIABLE):** Company KB overlay = the tenant's OWN settings panel (optional, tenant-scoped RLS). It is a DISTINCT surface from the super-admin `/admin/knowledge`. The owner never touches the industry KB; the super-admin surface is not touched by this phase.
- **No owner-facing KB browser:** The overlay editor is a curation surface (add/edit/delete entries), NOT a navigable "read the KB as a document" viewer. The KB is consulted only conversationally (WhatsApp, Phase 121). A CRUD list/form is fine; a reader/search UI is out of scope.
- **Optional overlay:** A company with zero overlay entries uses only the industry KB. No empty-state special handling beyond the UI being opt-in.
- **pgvector + embeddings only in v1:** No reranker. Reuse `embed()` exactly as Phase 119 did.
- **Embeddings the same way (KOVL-02):** embed `title + '\n\n' + body`, block the save on embed failure (never write a NULL-embedding row), serialize as a pgvector literal.
- **Migrations:** NONE this phase — `knowledge_entries` + the company-overlay RLS already exist (Phase 117). Deploy posture is irrelevant (no SQL).
- **Secrets:** never in code/docs (CLAUDE.md). Not applicable to this phase's surface but holds.
- **i18n:** owner-facing copy goes through `<T>` / `useTranslation()` (every tenant settings page does this).

### Claude's Discretion
- Exact route name under `/settings/` (recommend `knowledge`).
- Whether the editor is full-page routes (`new` + `[id]/edit`, mirroring admin) or inline dialog (mirroring price-book). Recommend full-page routes — a 1:1 mirror of Phase 119's proven shape, lowest risk.
- The exact settings-nav label/icon.
- Schema reuse vs. a new dedicated schema (recommend a NEW `companyKnowledgeEntrySchema` without `industry_id`).

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp KNOWLEDGE consumer (Phase 121 — WAKB-01/02).
- Bulk import for the overlay (Phase 119's KCUR-03 was admin-only; not in KOVL-01/02).
- Web-chat + MCP consumers (separate milestones SEED-034 / SEED-030).
- Any change to the super-admin surface (119) or the neutral module (118) beyond *reusing* `embed`.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KOVL-01 | A company owner can add/edit/delete private KB entries in the company's OWN settings panel (distinct from super-admin); optional. | New `app/(app)/settings/knowledge/` sub-route mirroring `/settings/estimate-templates` + `/settings/custom-domain`; new `lib/actions/company-knowledge.ts` with tenant `getAuthContext()` (active-company) writing `scope='company'`, `company_id`, `industry_id=null` via the **RLS-bound authed client**. Two-panel rule satisfied by a separate surface. |
| KOVL-02 | Company overlay entries generate embeddings the same way, scoped to the owning company. | Reuse `embed()` from `lib/knowledge/embed.ts` (unchanged). Embed-then-insert exactly as `app/admin/knowledge/actions.ts` (`embed(title+'\n\n'+body)` → block on failure → `toVectorLiteral`). Optional-overlay works automatically: `retrieve()` already forwards `companyId` to `match_knowledge_entries`; empty overlay contributes nothing. |

## Standard Stack

No new libraries. Everything is already installed and in active use.

### Core (all existing)
| Library | Purpose | Why Standard (in-repo) |
|---------|---------|------------------------|
| Next.js App Router server actions | tenant CRUD mutations | every `lib/actions/*.ts` uses `'use server'` + `revalidatePath` |
| `react-hook-form` + `@hookform/resolvers/zod` + `zod` | the entry form | `app/admin/knowledge/entry-form.tsx` is the exact template |
| `@/lib/knowledge/embed` (`embed`) | KOVL-02 embedding | Phase 118 helper, reused verbatim by Phase 119 |
| `@/lib/queries/active-company` (`getActiveCompanyId` / `getActiveCompany`) | tenant scoping | the canonical multi-tenant resolver (Phase 79) |
| `@/lib/supabase/server` (`createClient`) | RLS-bound authed client | the company-overlay RLS gates writes by `company_members` — the authed client is correctly scoped |
| shadcn/ui (`Card`, `Input`, `Textarea`, `Button`, `Label`, `Select`) | form + list | already imported in `app/admin/knowledge/*` |
| `sonner` (`toast`) | client feedback | used in every admin/tenant client wrapper |
| `@/components/i18n/t` (`<T>`) + `@/lib/i18n/use-translation` (`useTranslation`) | i18n | every settings page + the admin knowledge form |
| `@/lib/demo/guard` (`assertWritable`) | demo read-only guard | price-book/estimate-template tenant actions gate writes with it |

### Installation
None. `npm install` not required.

**Version verification:** N/A — zero dependency changes. Do not add any package.

## Architecture Patterns

### Recommended Route Structure (mirror `/settings/estimate-templates` + `/admin/knowledge`)
```
app/(app)/settings/knowledge/
├── page.tsx                  # list overlay entries (server component, getActiveCompany + authed SELECT)
├── new/page.tsx              # create form page
├── [id]/
│   ├── page.tsx              # edit form page (load the row by id, RLS-scoped)
│   └── edit-entry-wrapper.tsx# 'use client' wrapper calling updateCompanyEntry
├── entry-form.tsx            # 'use client' RHF form (NO industry select)
├── entry-form-wrapper.tsx    # 'use client' create wrapper
└── entry-actions.tsx         # 'use client' delete button

lib/actions/company-knowledge.ts   # 'use server' createCompanyEntry / updateCompanyEntry / deleteCompanyEntry
lib/schemas/knowledge.ts           # ADD companyKnowledgeEntrySchema (no industry_id)
components/settings/settings-nav.tsx  # ADD a nav item
```
**Why standalone sub-routes, not the `(tabs)` group:** `/settings/estimate-templates`, `/settings/custom-domain`, `/settings/integrations`, `/settings/payments`, `/settings/billing` are all **standalone** `/settings/*` routes (outside the `(tabs)` route group, which only holds general/company/defaults/etc.). Each is linked from `settings-nav.tsx`. Mirror that: `/settings/knowledge` is a standalone sub-route, added as a `settings-nav.tsx` item.

### Pattern 1: Tenant-scoped CRUD auth context (the CLEANER variant)
**What:** Resolve the active company once; use the **RLS-bound authed client** for the write. The company-overlay RLS (`knowledge_entries_company_insert/update/delete`) gates by `company_members` membership, so the authed client is correctly scoped without service-role bypass.
**When to use:** every overlay action.
**Example — the cleaner active-company context (no redundant companies SELECT):**
```typescript
// Source: lib/actions/estimate-template.ts (in-repo, the leanest tenant-CRUD context)
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  // getActiveCompanyId() already validated company_members membership,
  // so the company provably exists — skip a redundant SELECT.
  const company = { id: activeCompanyId }

  const denied = await assertWritable()   // demo read-only guard
  if (denied) return denied

  return { supabase, company }
}
```

### Pattern 2: Embed-then-insert with the RLS-bound client (KOVL-02)
**What:** Identical to `app/admin/knowledge/actions.ts` createEntry/updateEntry, except: tenant auth, authed (RLS) client, `scope:'company'`, `company_id`, `industry_id:null`.
**Example:**
```typescript
// Source: app/admin/knowledge/actions.ts (adapted: tenant + company scope + RLS client)
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { embed } from '@/lib/knowledge/embed'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { companyKnowledgeEntrySchema, type CompanyKnowledgeEntryInput } from '@/lib/schemas/knowledge'

function toVectorLiteral(vec: number[]): string { return JSON.stringify(vec) } // pgvector literal (Pitfall 2)

export async function createCompanyEntry(data: CompanyKnowledgeEntryInput) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { ok: false as const, message: ctx.error }
  const { supabase, company } = ctx

  const parsed = companyKnowledgeEntrySchema.safeParse(data)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? 'Validation failed' }

  // KOVL-02: embed BEFORE the write; block the save on failure (no NULL-embedding row).
  let embedding: number[]
  try { embedding = await embed(`${parsed.data.title}\n\n${parsed.data.body}`) }
  catch { return { ok: false as const, message: 'Could not generate embedding — entry not saved. Try again.' } }

  // RLS-bound authed client — the company_insert policy gates by company_members.
  const { error } = await supabase.from('knowledge_entries').insert({
    scope: 'company',
    company_id: company.id,   // tenant's active company
    industry_id: null,        // company rows: industry_id NULL (scope CHECK)
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source ?? null,
    embedding: toVectorLiteral(embedding),
  })
  if (error) return { ok: false as const, message: 'Failed to save entry. Please try again.' }
  revalidatePath('/settings/knowledge')
  return { ok: true as const }
}
```
`updateCompanyEntry`: fetch existing `title, body` (RLS-scoped `.eq('id', id)`), re-embed only when changed (Pitfall 5), `.update(...).eq('id', id)` — RLS restricts the row to the owning company, no extra `.eq('company_id')` is required but adding it is harmless defense-in-depth. `deleteCompanyEntry`: `.delete().eq('id', id)` (RLS-scoped).

### Pattern 3: List page (server component, RLS SELECT)
```typescript
// Source: app/(app)/price-book/page.tsx + app/admin/knowledge/page.tsx (adapted)
const claims = await getAuthClaims(); if (!claims) redirect('/?auth=login')
const company = await getActiveCompany(); if (!company) redirect('/onboarding')
const supabase = await createClient()
const { data } = await supabase
  .from('knowledge_entries')
  .select('id, title, source, embedding, created_at')
  .eq('scope', 'company')
  .eq('company_id', company.id)        // explicit + RLS both scope it
  .order('created_at', { ascending: false })
```
Optional-overlay empty state: render `<T>No entries yet…</T>` exactly like the admin page does for zero rows. No other handling.

### Pattern 4: Client form WITHOUT the industry select
The admin `entry-form.tsx` has an Industry `<Select>`; the overlay form **omits it entirely** (company rows have `industry_id = NULL`). Keep title / body / source fields, RHF + `zodResolver(companyKnowledgeEntrySchema)`, `useTranslation()` for all copy.

### Anti-Patterns to Avoid
- **Using `requireServiceClient()` for overlay writes.** That bypasses RLS and the tenant isolation the company policies provide. Use the authed client; the RLS was purpose-built (Phase 117) for exactly this tenant write. (Industry rows used the service client *because* Phase 117 created NO industry write policy — the opposite situation.)
- **Using `requireAdmin()`.** This is the owner's panel, not the super-admin's. Auth = the normal tenant session via active-company.
- **Adding an `industry_id` field/column to company rows.** The scope CHECK (`scope='company' and company_id is not null`) and the existing `industry_id:null` convention forbid it.
- **Extracting a shared CRUD helper across 119 and 120.** See "Don't Hand-Roll / DRY note" below — keep them separate.
- **Building a KB reader/search UI.** Locked decision: no owner-facing KB browser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Generating embeddings | a new embedding fetch | `embed()` from `lib/knowledge/embed.ts` | Phase 118 helper; 1536-dim validated; model pinned; throws on bad shape (the block-the-save signal) |
| pgvector literal serialization | raw `number[]` write | `JSON.stringify(vec)` (`toVectorLiteral`) | the unambiguous vector literal pattern proven in Phase 119 (Pitfall 2) |
| Tenant scoping | manual user→company joins | `getActiveCompanyId()` / `getActiveCompany()` | the canonical Phase-79 resolver; already validates `company_members` |
| Write authorization | manual ownership checks | the `knowledge_entries_company_*` RLS + authed client | the policy already gates by `company_members`; the authed client enforces it |
| Demo read-only guard | new check | `assertWritable()` | every tenant write action uses it |
| Overlay merge into retrieval | any new retrieval code | nothing — already done | `retrieve()` forwards `companyId` to `match_knowledge_entries`; overlay merges in the RPC WHERE |

**DRY-vs-clarity note (the shared-helper question):** Phase 119's `createEntry/updateEntry/deleteEntry` and this phase's actions differ on **three axes simultaneously** — auth (`requireAdmin` vs tenant active-company), scope (`industry`/`industry_id` vs `company`/`company_id`), and client (service-role-bypass vs RLS-bound). A shared helper would need all three injected as parameters, obscuring the security-critical differences and coupling the super-admin surface to the tenant surface (a coupling the two-panel rule explicitly wants kept apart). The codebase's own convention is the opposite of DRY here: `getAuthContext` is *intentionally duplicated per action file* ("established codebase convention, STATE.md Phase 20"). **Recommendation: keep `lib/actions/company-knowledge.ts` fully separate from `app/admin/knowledge/actions.ts`.** The only genuinely shared, already-extracted pieces are `embed()` and the trivial `toVectorLiteral` (duplicate the 2-line helper or lift it to `lib/knowledge/` if preferred — low stakes).

## Common Pitfalls

### Pitfall 1: Wrong client → tenant isolation hole or a write that silently fails
**What goes wrong:** Using `requireServiceClient()` (bypasses RLS — wrong trust posture) OR using the authed client but forgetting that the RLS `WITH CHECK` requires `scope='company'` AND a `company_id` the user is a member of.
**Why it happens:** Copy-pasting Phase 119 (which deliberately used the service client because industry rows have no write policy).
**How to avoid:** Use `createClient()` (authed). Always insert `scope:'company'` + `company_id: <active company>`. The `knowledge_entries_company_insert` policy's `with check` passes only when both hold.
**Warning signs:** an insert returning a `new row violates row-level security policy` error → the payload's `scope`/`company_id` don't satisfy the policy.

### Pitfall 2: NULL-embedding row invisible to retrieval (KOVL-02)
**What goes wrong:** Writing a row before/without the embedding → the HNSW KNN can't rank it → the entry is silently never retrieved.
**How to avoid:** embed FIRST; on `embed()` throw return `ok:false` with NO write (exactly Phase 119's KCUR-02 behavior).
**Warning signs:** an entry "saved" but never surfaced in answers; an `embedding IS NULL` row in the table.

### Pitfall 3: pgvector first-write ambiguity
**What goes wrong:** the column expects a vector literal; a raw array *may* be accepted by supabase-js but is format-ambiguous.
**How to avoid:** serialize with `JSON.stringify(vec)` (`toVectorLiteral`) — the proven Phase-119 pattern.

### Pitfall 4: Needless re-embed on a source-only edit
**What goes wrong:** every `updateCompanyEntry` re-embeds even when only `source` changed — wasted API calls.
**How to avoid:** fetch existing `title, body`; compute `needsEmbed = title !== new.title || body !== new.body`; omit `embedding` from the update payload when unchanged (Phase 119 Pitfall 5).

### Pitfall 5: Scope leakage in the edit/list path
**What goes wrong:** loading or updating a row by `id` alone could (without RLS) touch another company's row, or an industry row.
**How to avoid:** the authed client + RLS already scope SELECT/UPDATE/DELETE to the owning company's `scope='company'` rows. Add `.eq('scope','company').eq('company_id', company.id)` on the list query for clarity; rely on RLS for the single-row edit/delete (optionally add `.eq('company_id', company.id)` as defense-in-depth).

## Runtime State Inventory

> Greenfield-additive phase (new UI + new tenant actions over an existing table). No rename/refactor/migration. Section included only to confirm nothing is missed.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `knowledge_entries` exists; overlay rows are *new* writes, no existing data to migrate. Verified by reading the Phase-117 migration. | None |
| Live service config | None — no external service holds overlay config. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None new — `embed()` reuses the existing OpenRouter key via `getORKey()` (Phase 118). | None |
| Build artifacts | None — no package/binary rename. | None |

## Environment Availability

> The only external dependency is the embeddings provider, already wired and used by Phase 119 in this same repo.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenRouter `/embeddings` (`text-embedding-3-small`) | KOVL-02 embedding | ✓ (via `getORKey()` / `lib/knowledge/embed.ts`) | n/a (runtime key) | embed throws → save blocked (by design — Pitfall 2) |
| `knowledge_entries` table + company RLS | KOVL-01 writes | ✓ (Phase 117 migration in repo) | — | — |
| `match_knowledge_entries` RPC | optional-overlay retrieval merge | ✓ (Phase 118) | — | — |

**Missing dependencies:** None. No new install, no new migration, no new env var.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Industry rows: service-role write (no RLS write policy) | Company rows: RLS-bound authed write via `company_members` policy | Phase 117 (table) + this phase (first writer) | This phase is the FIRST tenant writer of `scope='company'` rows; use the authed client, not the service client |

**Deprecated/outdated:** none relevant.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in config.json — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (in-repo; `npx vitest run`) |
| Config file | repo vitest config (existing; tests live under `tests/unit/**`) |
| Quick run command | `npx vitest run tests/unit/actions/company-knowledge.test.ts` (new file) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KOVL-01 | tenant auth gate first; unauth/no-company → error, no write | unit | `npx vitest run tests/unit/actions/company-knowledge.test.ts` | ❌ Wave 0 |
| KOVL-01 | insert pins `scope='company'`, `company_id=active`, `industry_id=null`; uses the AUTHED client (not service) | unit | same file | ❌ Wave 0 |
| KOVL-01 | delete/update are RLS-scoped (`.eq('id', …)`); demo guard blocks writes | unit | same file | ❌ Wave 0 |
| KOVL-02 | embed `title+'\n\n'+body` BEFORE insert; embed throw → `ok:false`, NO write | unit | same file | ❌ Wave 0 |
| KOVL-02 | re-embed only when title/body changed (source-only edit skips embed) | unit | same file | ❌ Wave 0 |
| KOVL-01 (optional) | a company with zero overlay rows still works — no special handling | covered by Phase 118 retrieve tests (overlay merge) + the list page empty-state render | n/a (assert via existing retrieve test fixtures if a guard is wanted) | existing |

Mirror Phase 119's `tests/unit/admin/knowledge-curation-actions.test.ts` (10 cases) — the same assertions, retargeted: assert the **authed** `createClient` mock is used (not `requireServiceClient`), `scope:'company'`/`company_id`/`industry_id:null` invariants, embed-then-insert, embed-failure-blocks-save, re-embed-only-on-change, the demo guard short-circuit.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/actions/company-knowledge.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/actions tests/unit/knowledge`
- **Phase gate:** `npx vitest run` (full suite) green + `npx tsc --noEmit` clean on touched files, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/actions/company-knowledge.test.ts` — covers KOVL-01 + KOVL-02 (mirror the Phase-119 curation-actions test, retargeted to authed client + company scope)
- [ ] (optional) a render test for `app/(app)/settings/knowledge/page.tsx` empty-state (mirrors admin page render expectations) — low priority; the existing admin page test pattern shows the shape
- Framework install: none — Vitest already present.

## Open Questions

1. **Full-page edit routes vs. inline dialog for the editor UI.**
   - What we know: admin knowledge uses full-page `new` + `[id]/edit`; price-book uses an inline dialog.
   - What's unclear: which the user prefers for the overlay.
   - Recommendation: full-page routes — a 1:1 mirror of Phase 119's proven, already-tested shape (lowest risk, fastest plan). The planner can downgrade to a dialog if the user wants tighter UX.

2. **Whether to lift `toVectorLiteral` into `lib/knowledge/`.**
   - What we know: it's a 1-line `JSON.stringify`; currently a private fn in the admin actions file.
   - Recommendation: duplicate it (trivial) OR lift to `lib/knowledge/embed.ts` as a tiny export. Either is fine; do not over-engineer.

3. **Settings-nav placement/label.**
   - Recommendation: add `{ value: 'knowledge', label: 'Knowledge', Icon: <a lucide icon e.g. BookOpen/Brain>, href: '/settings/knowledge' }` to `components/settings/settings-nav.tsx`. Discretionary.

## Sources

### Primary (HIGH confidence — all in-repo, read directly)
- `.planning/REQUIREMENTS.md` — KOVL-01/02, locked two-panel decision, out-of-scope table
- `.planning/seeds/SEED-033-*.md` — the company-overlay section (decision #1), optional-overlay, no-browser rule
- `.planning/STATE.md` — current status, dependency spine (119 ∥ 120), locked guardrails
- `.planning/phases/119-.../119-01-SUMMARY.md` — the mirror target (CRUD + embed patterns, pitfalls)
- `app/admin/knowledge/actions.ts` — the exact create/update/delete + embed-then-insert shape to retarget
- `app/admin/knowledge/{page,entry-form,entry-actions,entry-form-wrapper}.tsx` + `[id]/{page,edit-entry-wrapper}.tsx` — the UI to mirror
- `supabase/migrations/20260625000001_phase117_knowledge_entries.sql` — the company-overlay RLS (insert/update/delete by `company_members`), scope CHECK
- `lib/queries/active-company.ts` — `getActiveCompanyId` / `getActiveCompany`
- `lib/knowledge/embed.ts` — the `embed()` to reuse
- `lib/knowledge/retrieve.ts` — confirms overlay merge is already wired (forwards `companyId` to `match_knowledge_entries`)
- `lib/actions/estimate-template.ts` — the leanest tenant-CRUD `getAuthContext()` (active-company, no redundant SELECT)
- `lib/actions/price-book.ts` — the fuller tenant-CRUD action pattern + demo guard usage
- `app/(app)/settings/{estimate-templates,custom-domain}/page.tsx` + `components/settings/settings-nav.tsx` — standalone settings sub-route + nav pattern to mirror
- `lib/schemas/knowledge.ts` — the existing schema to extend with `companyKnowledgeEntrySchema`
- `lib/demo/guard.ts` — `assertWritable()`
- `.planning/config.json` — `nyquist_validation: true`
- `CLAUDE.md` — project constraints

### Secondary / Tertiary
None needed — the phase is a pure in-repo mirror; no external docs or web search required.

## Project Constraints (from CLAUDE.md)
- **Tech stack:** Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui, react-hook-form + zod — all satisfied by mirroring existing surfaces.
- **Security:** service role key never in the browser; all AI calls server-side. The overlay's `embed()` runs inside a `'use server'` action — compliant. Use the AUTHED (not service) client for overlay writes.
- **No secrets in code/docs** — no secret material in this phase.
- **GSD workflow enforcement** — file edits happen via the planned phase execution.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; every pattern is a read-verified in-repo file.
- Architecture: HIGH — direct mirror of Phase 119 (just shipped) + the established tenant-CRUD convention.
- Pitfalls: HIGH — lifted from the Phase-119 summary's documented pitfall resolutions (same table, same embed path).
- RLS/client choice: HIGH — confirmed against the Phase-117 migration's `knowledge_entries_company_*` policies and the active-company resolver.

**Research date:** 2026-06-24
**Valid until:** ~30 days (stable — internal patterns, no fast-moving external deps)
