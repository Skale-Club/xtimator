# Phase 119: Super-Admin Industry KB Curation + Bulk Import - Research

**Researched:** 2026-06-24
**Domain:** Super-admin CRUD + CSV/markdown bulk import + embedding generation over `knowledge_entries` (industry scope)
**Confidence:** HIGH (entirely codebase-mirrored; the one external fact — OpenRouter batch embeddings — verified against OpenRouter docs)

## Summary

Phase 119 is almost pure pattern-mirroring of code that already exists in this repo. The schema (`knowledge_entries`, Phase 117) and the `embed()` building block (Phase 118) are done and dormant — this phase is the FIRST writer of `embedding` vectors. There is no new migration: the table, the scope CHECK, the HNSW index, and the dual RLS all exist. This phase adds (a) a super-admin route `app/admin/knowledge/` mirroring `app/admin/blog/`, (b) three server actions (create/update/delete) gated by `requireAdmin()` and writing via `requireServiceClient()` (industry rows are service-role-write by RLS design — there is intentionally NO industry write policy), (c) `embed(title + '\n\n' + body)` called on every save to populate `embedding vector(1536)`, and (d) a bulk-import surface mirroring the price-book CSV pattern (`lib/csv/price-book-import.ts` + `papaparse` + a server bulk-insert action).

The single fact requiring external verification — whether to batch embeddings — is answered: OpenRouter's `/embeddings` accepts an **array** `input` (OpenAI-compatible), returns a `data[]` with an `index` field preserving order, and most models cap at ~96 inputs/request. The current `lib/knowledge/embed.ts` only embeds a single string, so bulk import needs a small batched helper (or chunked sequential calls).

**Primary recommendation:** New route `app/admin/knowledge/` + `app/admin/knowledge/actions.ts` (mirror `app/admin/blog/`), a `lib/schemas/knowledge.ts` Zod schema, `embed(title + '\n\n' + body)` on save (embed-then-insert; on embed failure **block the save with a clear error** — see KCUR-02), a new bulk-import server action mirroring `importPriceBookItems` that adds a batched `embedMany()` helper to `lib/knowledge/embed.ts`, two new `AuditAction`s, and a nav entry. No migration. Admin copy stays English-only via `<T>`/`useTranslation` (admin pages already wrap copy but the locale is English).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KCUR-01 | Super-admin can create/edit/delete industry KB entries scoped to an industry, in the super-admin panel | Mirror `app/admin/blog/` (list page + form + 3 actions). Writes `scope='industry'`, `industry_id` set, `company_id=NULL` via `requireServiceClient()`. `requireAdmin()` gate FIRST. Industry select from `lib/industries.ts` (10 industries). |
| KCUR-02 | Saving/editing an entry (re)generates its embedding | Call `embed(title + '\n\n' + body)` (Phase 118 `lib/knowledge/embed.ts`) inside create/update; write `vector(1536)` to `embedding`. Recommend embed-then-insert; on embed failure block save with a clear error (an industry row with NULL embedding is invisible to `retrieve()`). |
| KCUR-03 | Bulk-import entries (markdown or CSV) to seed an industry's KB in one operation | Mirror `lib/csv/price-book-import.ts` (papaparse, two-stage pick→preview) + `importPriceBookItems` bulk insert. Recommend CSV `title,body,source` with industry chosen in the UI (one import = one industry). Batch embeddings via OpenRouter array input (new `embedMany()` helper). |
</phase_requirements>

## User Constraints (from REQUIREMENTS.md + SEED-033 locked decisions)

> No CONTEXT.md exists for this phase yet. These constraints are lifted from REQUIREMENTS.md v4.8 locked decisions and SEED-033 "Decisões travadas". Treat with the authority of locked decisions.

### Locked Decisions
- **Two panels, two scopes (NON-NEGOTIABLE):** Industry KB = SUPER-ADMIN panel (platform asset, neutral/shared, service-role-write RLS like `price_research_cache`). The company overlay (Phase 120) is the tenant's OWN settings panel — a **DISTINCT surface**. The owner NEVER curates the industry KB. **This phase touches ONLY the super-admin surface.**
- **Industry rows are service-role-write by design.** Phase 117 deliberately created NO write policy for `scope='industry'`; the service role bypasses RLS. All writes here go through `requireServiceClient()` behind a `requireAdmin()` gate.
- **Embedding model is pinned** to `openai/text-embedding-3-small` / `vector(1536)` (Phase 117/118 const in `lib/knowledge/embed.ts`). Do not change it.
- **KB content is curated in English** (US market); the app translates answers downstream. No multilingual KB content (REQUIREMENTS "Out of Scope").
- **No owner-facing KB browser** — KB is a conversational retrieval surface only. This is the super-admin curation surface (allowed); do NOT build any owner-facing KB viewer.

### Claude's Discretion
- Route shape: a standalone `app/admin/knowledge/` route (recommended) vs. a category under `integrations-providers`. (Recommended: standalone route — see Architecture.)
- Bulk-import format: CSV vs. markdown vs. both (recommended: CSV first, with industry selected in the UI — see KCUR-03).
- Embed-failure handling: block-the-save vs. save-with-null + reindex affordance (recommended: block-the-save — see KCUR-02).
- List-view grouping/filtering by industry.

### Deferred Ideas (OUT OF SCOPE for Phase 119)
- **Company KB overlay (KOVL-01/02) — Phase 120.** The tenant settings surface. OUT.
- **WhatsApp KNOWLEDGE intent (WAKB-01/02) — Phase 121.** OUT.
- **Cohere reranker, chunk-by-paragraph, web chat, MCP tool.** v2 / separate milestones. OUT.

## Standard Stack

### Core (all already in the repo — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `papaparse` | already installed (`lib/csv/price-book-import.ts`) | CSV parse for bulk import | Existing, battle-tested import path; mirror it exactly |
| `react-hook-form` + `@hookform/resolvers/zod` | installed | The admin entry form | Every admin form (`post-form.tsx`) uses this |
| `zod` | installed | Entry + import-row validation | All admin schemas live in `lib/schemas/` |
| `@supabase/supabase-js` (service client) | installed | Service-role writes | `requireServiceClient()` — the industry-write path |
| shadcn/ui `Select`, `Input`, `Textarea`, `Button`, `Card`, `Badge`, `Dialog`/`AlertDialog` | installed | Form + list + import wizard UI | All present in `components/ui/` and used by blog/price-book |

### Supporting (existing functions to reuse — DO NOT rebuild)
| Function | Location | Purpose |
|----------|----------|---------|
| `embed(text)` | `lib/knowledge/embed.ts` | Single-string → `number[1536]` via OpenRouter `/embeddings`. KCUR-02 calls this. |
| `requireAdmin()` | `lib/auth/admin-context.ts` | Super-admin gate — call FIRST in every action and page |
| `requireServiceClient()` | `lib/supabase/service.ts` | Service-role client (bypasses RLS) — the only way to write industry rows |
| `logAdminAction()` | `lib/admin/audit-log.ts` | Append audit row — add two new `AuditAction`s |
| `INDUSTRIES` / `getIndustryLabel()` | `lib/industries.ts` | The 10 industry select options + label resolution |
| `parsePriceBookCsv()` (pattern) | `lib/csv/price-book-import.ts` | The CSV parse + per-row validation template to mirror |
| `importPriceBookItems()` (pattern) | `lib/actions/price-book.ts:308` | The server-side bulk-insert template to mirror |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Standalone `app/admin/knowledge/` route | A category under `integrations-providers.ts` | Integrations categories are for API-key cards (`platform_integrations`), not row CRUD. KB curation is CRUD-over-a-table → mirror `app/admin/blog/`, NOT integrations. Recommend standalone route. |
| CSV bulk import | Markdown-file-per-entry import | Markdown adds a frontmatter parser + per-file UX for marginal benefit. CSV reuses the entire price-book pipeline. Recommend CSV; markdown is a deferrable nice-to-have. |
| Batched `embedMany()` for import | N sequential `embed()` calls | Sequential is simplest and correct but slow for large seeds; OpenRouter accepts array input (verified). Recommend a small `embedMany()` chunked at ≤96/request. |

**Installation:** None. Zero new dependencies.

**Version verification:** No new packages to verify. `papaparse`, `zod`, `react-hook-form` are already pinned in `package.json` and used by the mirrored code paths.

## Architecture Patterns

### Recommended Route Structure (mirror `app/admin/blog/`)
```
app/admin/knowledge/
├── page.tsx                    # list view (requireAdmin FIRST; service client read; filter by industry)
├── loading.tsx                 # mirror app/admin/blog/loading.tsx
├── actions.ts                  # createEntry / updateEntry / deleteEntry + bulkImportEntries (server actions)
├── new/page.tsx                # create form (or a Dialog-based create on the list page)
├── [id]/page.tsx               # edit form
└── (client components: entry-form.tsx, entry-actions.tsx, import-wizard or import-card)

lib/schemas/knowledge.ts        # NEW: knowledgeEntrySchema (industry_id, title, body, source)
lib/csv/knowledge-import.ts     # NEW: parseKnowledgeCsv() mirroring price-book-import.ts
lib/knowledge/embed.ts          # ADD: embedMany(texts: string[]) batched helper (KCUR-03)
lib/admin/audit-log.ts          # ADD: 'knowledge_entry.save' | 'knowledge_entry.delete' to AuditAction
components/admin/admin-nav.tsx  # ADD: nav entry { href: '/admin/knowledge', label: 'Knowledge', Icon: BookOpen }
```

### Pattern 1: Super-admin action shape (mirror `app/admin/blog/actions.ts`)
**What:** Every action: `requireAdmin()` FIRST → `zod.safeParse` → `requireServiceClient()` write → `revalidatePath` → `void logAdminAction(...)` → `{ ok: true }`.
**When to use:** All three CRUD actions + the bulk-import action.
**Example (the proven shape, from `app/admin/blog/actions.ts`):**
```typescript
// Source: app/admin/blog/actions.ts (createPost) — mirror verbatim for createEntry
export async function createEntry(data: KnowledgeEntryInput): Promise<KnowledgeActionResult> {
  const ctx = await requireAdmin()                       // gate FIRST (service client bypasses RLS)
  const parsed = knowledgeEntrySchema.safeParse(data)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }

  // KCUR-02: (re)generate embedding before insert
  let embedding: number[]
  try {
    embedding = await embed(`${parsed.data.title}\n\n${parsed.data.body}`)
  } catch (e) {
    return { ok: false, message: 'Could not generate embedding — entry not saved. Try again.' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('knowledge_entries').insert({
    scope: 'industry',
    industry_id: parsed.data.industry_id,
    company_id: null,                                     // industry rows: company_id NULL (scope CHECK)
    title: parsed.data.title,
    body: parsed.data.body,
    source: parsed.data.source ?? null,
    embedding,                                            // first writer of the vector column
  })
  if (error) return { ok: false, message: error.message }
  revalidatePath('/admin/knowledge')
  void logAdminAction({ actorId: ctx.userId, actorEmail: ctx.email, action: 'knowledge_entry.save',
    targetType: 'knowledge_entry', targetId: parsed.data.industry_id, metadata: { scope: 'industry' } })
  return { ok: true }
}
```
**Note on pgvector insert format:** Supabase-js sends the `number[]` as JSON. pgvector accepts the `[1,2,3]` literal; the Phase-118 RPC already round-trips vectors, so a plain array on `.insert({ embedding })` is the established path. If supabase-js serializes the array in a form pgvector rejects, the fallback is `embedding: JSON.stringify(vec)` (a `'[...]'` string literal, which pgvector parses). **Open question — verify on first insert.**

### Pattern 2: Admin form (mirror `app/admin/blog/post-form.tsx`)
**What:** `useForm` + `zodResolver`, fields wired with `register`, a shadcn `Select` for `industry_id` driven by `INDUSTRIES`, submit calls the server action inside `useTransition`.
**Example (industry select options):**
```tsx
// Source: lib/industries.ts INDUSTRIES + app/admin/blog/post-form.tsx Select pattern
<Select value={industryId} onValueChange={(v) => setValue('industry_id', v)}>
  <SelectTrigger><SelectValue placeholder={t('Select industry')} /></SelectTrigger>
  <SelectContent>
    {INDUSTRIES.map((ind) => (
      <SelectItem key={ind.id} value={ind.id}>{ind.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```
Form fields: `industry_id` (Select), `title` (Input), `body` (Textarea, `min-h-[300px]`), `source` (Input, optional).

### Pattern 3: List view (mirror `app/admin/blog/page.tsx`)
**What:** `requireAdmin()` → service-client `select('*').order('created_at', desc)` → table in a `Card`. Add an industry filter (a `Select` or per-industry section headers — the curator works one industry at a time). Show a `Badge` warning when `embedding IS NULL` (a "needs reindex" signal — only reachable if a prior save partially failed; with embed-then-insert it should never happen, but the badge is cheap insurance).

### Pattern 4: Bulk import (mirror price-book wizard, simplified)
**What:** Two-stage pick→preview. The price-book wizard is a 4-step dialog (`components/price-book/import-wizard/`) with column-mapping and dedupe. For KB the columns are fixed (`title,body,source`) and there's no folder/locale complexity — so a **simplified 2-step** (upload+preview) is sufficient: industry chosen in the UI, file parsed by `parseKnowledgeCsv()`, preview shows valid/invalid counts, confirm calls `bulkImportEntries(industryId, rows)`.
**Server action (mirror `importPriceBookItems` `lib/actions/price-book.ts:308`):** validate each row server-side → batch-embed all valid rows → single `.insert(rows.map(...))`.

### Anti-Patterns to Avoid
- **Writing industry rows through the anon/server (RLS) client.** There is no industry write policy — the write silently fails or errors. ALWAYS `requireServiceClient()`.
- **Skipping `requireAdmin()` or calling it after the service write.** The gate is the ONLY access control (service client bypasses RLS). Call it FIRST.
- **Attaching KB curation as an `integrations-providers` category.** That catalog is API-key cards over `platform_integrations`, not table CRUD. Wrong surface.
- **Inserting a row with NULL embedding silently.** A NULL-embedding industry row is invisible to `retrieve()` (the HNSW KNN can't rank it) — it's dead content. Block the save instead (see KCUR-02).
- **Re-embedding on update when title/body unchanged.** On update, only call `embed()` if `title` or `body` changed (source-only edits don't need a re-embed) — cheap optimization, avoids burning OpenRouter calls.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embedding generation | A new OpenRouter fetch | `embed()` in `lib/knowledge/embed.ts` | Already handles key, base URL, 1536-shape validation, error throwing |
| CSV parsing | Manual split/quote handling | `papaparse` via a `parseKnowledgeCsv()` mirroring `price-book-import.ts` | Quoting, BOM, header normalization, size/row caps all solved |
| Admin auth | A custom admin check | `requireAdmin()` | Memoized per-request, queries `platform_admins`, `notFound()` on miss |
| Audit logging | Custom insert | `logAdminAction()` | Best-effort, captures IP/UA, never throws, secret-safe |
| Service-role client | `createClient(...)` ad hoc | `requireServiceClient()` | Centralized env-var handling + clear error |
| Industry list | Hardcoding industry strings | `INDUSTRIES` from `lib/industries.ts` | Single source of truth (10 industries); `getIndustryLabel()` for display |

**Key insight:** This phase introduces essentially zero novel logic. Every primitive — embedding, CSV, auth, audit, service writes, the form, the list — already exists. The work is wiring, not invention. The only NEW code with real logic is `embedMany()` (batched embeddings) and `parseKnowledgeCsv()` (a near-copy of `parsePriceBookCsv`).

## Common Pitfalls

### Pitfall 1: NULL embedding = invisible content
**What goes wrong:** A KB entry saved without an embedding never appears in retrieval — the HNSW KNN ranks by `embedding <=> query`, and a NULL embedding can't be ranked.
**Why it happens:** Embed-after-insert with a swallowed embed error, or save-with-null "for later reindex" that never happens.
**How to avoid:** Embed FIRST, insert SECOND, in one action. If `embed()` throws, return an error and DON'T insert. (Recommended embed-failure handling — see KCUR-02.)
**Warning signs:** Curated entries that never surface in `answer()` output; rows where `embedding IS NULL`.

### Pitfall 2: pgvector array serialization on insert
**What goes wrong:** `.insert({ embedding: number[] })` may serialize as a JSON array that pgvector rejects (it expects the `'[1,2,3]'` vector literal).
**Why it happens:** This phase is the FIRST code to WRITE the `embedding` column (Phase 118 only READ via an RPC). The write format is unproven.
**How to avoid:** Test the first real insert. If a plain `number[]` fails, use `embedding: JSON.stringify(vec)` (pgvector parses the `[...]` string into a vector). The Nyquist test for KCUR-02 should assert a successful insert + non-null embedding.
**Warning signs:** Postgres error `invalid input syntax for type vector` on insert.

### Pitfall 3: papaparse `worker:true`
**What goes wrong:** `worker:true` breaks in the Next.js bundle.
**How to avoid:** Mirror `price-book-import.ts` exactly — it explicitly does NOT use `worker:true` (commented "Pitfall 4"). Keep the same.

### Pitfall 4: Batch embedding partial failure
**What goes wrong:** One bad row in a 96-input batch fails the whole `/embeddings` request, aborting the import.
**Why it happens:** OpenRouter embeds the array atomically per request.
**How to avoid:** Validate/trim rows BEFORE embedding (empty title/body → reject in preview). On a batch failure, surface a clear error and import nothing (transactional feel) rather than partial. Chunk at ≤96 and fail the whole import on any chunk error.
**Warning signs:** Import reports fewer rows than the file, or a 400 from `/embeddings`.

### Pitfall 5: Re-embedding cost on every update
**What goes wrong:** Editing only the `source` field re-embeds title+body needlessly.
**How to avoid:** In `updateEntry`, fetch existing title/body; only call `embed()` if either changed. (Cheap optimization.)

## Code Examples

### Batched embedding helper (NEW — add to `lib/knowledge/embed.ts`)
```typescript
// Source: OpenRouter /embeddings array input (verified — see Sources). Mirrors the
// existing embed() fetch in lib/knowledge/embed.ts; same key/base/headers.
// Returns vectors in INPUT ORDER (data[].index preserves position).
export async function embedMany(texts: string[]): Promise<number[][]> {
  const apiKey = await getORKey()
  const out: number[][] = []
  const BATCH = 96 // OpenRouter/OpenAI typical max inputs per request
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH)
    const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xtimator.com', 'X-Title': 'Xtimator' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: chunk }),
    })
    if (!res.ok) throw new Error(`OpenRouter embeddings failed (${res.status})`)
    const json = (await res.json()) as { data?: Array<{ embedding?: number[]; index?: number }> }
    const sorted = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    for (const d of sorted) {
      if (!d.embedding || d.embedding.length !== 1536) throw new Error('Unexpected embedding shape')
      out.push(d.embedding)
    }
  }
  return out
}
```
> Note: `EMBEDDING_MODEL` is currently a module-private const in `embed.ts`; `embedMany` lives in the same file so it's in scope. Keep `embed()` as the single-row path (used by KCUR-02 create/update); `embedMany()` is the import path (KCUR-03).

### CSV format (recommended for KCUR-03)
```
title,body,source
"Pet odor pre-treatment","Apply enzymatic cleaner to the affected area, dwell 10–15 min before extraction…","ICAN best-practices"
```
Industry is chosen in the import UI (one import = one industry → one `industry_id` applied to every row). This keeps the CSV simple and prevents a bad `industry_id` string in the file. (Mirror `REQUIRED_HEADERS`, `MAX_ROWS`, `MAX_BYTES` caps from `price-book-import.ts`.)

### AuditAction additions (`lib/admin/audit-log.ts`)
```typescript
// add to the AuditAction union:
  | 'knowledge_entry.save'    // create OR update (mirror blog.create/update granularity if you prefer two)
  | 'knowledge_entry.delete'
// (KCUR-03 bulk import can log 'knowledge_entry.save' with metadata: { imported: N, industry_id })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Embed-per-row sequential | OpenRouter array `input` (batch ≤96) | OpenAI-compatible; stable | Faster/cheaper bulk seed; one fetch per 96 rows |
| Single `embed()` only | Add `embedMany()` for import | This phase | KCUR-03 needs batching; KCUR-02 keeps single `embed()` |

**Deprecated/outdated:** None relevant. The embedding model and vector dimension are pinned and current.

## Runtime State Inventory

> This is a feature-add phase (new admin surface), NOT a rename/refactor. Inventory included for completeness; nothing migratory.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `knowledge_entries` table exists (Phase 117), ships DORMANT — `embedding` column currently all NULL (no writer yet). This phase is the first writer. | None migratory — new rows only. |
| Live service config | None — no external service config in this phase. OpenRouter key already configured (Phase 118). | None — verified by `embed.ts` reusing `getORKey`. |
| OS-registered state | None — no scheduled tasks/processes. | None. |
| Secrets/env vars | OpenRouter key (existing, unchanged); `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (existing). No new secrets. | None — verified by `service.ts` + `embed.ts`. |
| Build artifacts | None — no package rename, no compiled artifacts. | None. |

## Common Pitfalls cross-check: scope fence

**This phase touches ONLY the super-admin surface.** Confirmed against REQUIREMENTS.md + SEED-033:
- Company KB overlay (KOVL-01/02) = Phase 120, tenant settings panel. **OUT.**
- WhatsApp KNOWLEDGE intent (WAKB-01/02) = Phase 121. **OUT.**
- The two panels are DISTINCT surfaces with DISTINCT RLS (industry = service-role-write; overlay = tenant `company_members`-gated). Do not build any tenant/overlay code here.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenRouter `/embeddings` | KCUR-02/03 embedding generation | ✓ (configured Phase 118) | `openai/text-embedding-3-small` (1536-dim) | — (no fallback; embed failure blocks save by design) |
| `knowledge_entries` table + HNSW index | All three | ✓ (Phase 117 migration, authored) | — | — |
| `papaparse` | KCUR-03 CSV parse | ✓ (used by price-book) | installed | — |
| Supabase service role | All writes | ✓ | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

> Operational note (NOT this phase's task): Phase 117/118 migrations are authored-only and deploy via CI→GHCR→Coolify (never built on the VPS — see project memory). The `knowledge_entries` table + RPC land in remote DB through that pipeline. Confirm the migrations are deployed to the target env before the new actions write to the table; otherwise inserts hit a missing table. **Open question — verify migration deploy status before execution.**

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (e2e) — both in repo |
| Config file | `vitest.config.ts` (root); Playwright `tests/e2e/` |
| Quick run command | `npx vitest run tests/unit/knowledge` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KCUR-01 | createEntry/updateEntry/deleteEntry write `scope='industry'`, `company_id=NULL`, via service client behind `requireAdmin()`; reject unauthenticated | unit | `npx vitest run tests/unit/knowledge/curation-actions.test.ts` | ❌ Wave 0 |
| KCUR-02 | Save calls `embed(title+body)` and persists a non-null `vector(1536)`; embed failure blocks the insert and returns an error | unit | `npx vitest run tests/unit/knowledge/curation-embed.test.ts` | ❌ Wave 0 |
| KCUR-03 | `parseKnowledgeCsv` classifies valid/invalid rows; `bulkImportEntries` batch-embeds + bulk-inserts; rejects oversize/too-many-rows | unit | `npx vitest run tests/unit/csv/knowledge-import.test.ts` + `tests/unit/knowledge/bulk-import-action.test.ts` | ❌ Wave 0 |
| KCUR-01 | end-to-end: admin creates an entry, sees it in the list, deletes it | e2e (optional) | `npx playwright test tests/e2e/admin-knowledge-curation.spec.ts` | ❌ Wave 0 (optional) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/knowledge tests/unit/csv/knowledge-import.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full vitest suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/knowledge/curation-actions.test.ts` — covers KCUR-01 (auth gate, service-client write, scope/company_id invariants)
- [ ] `tests/unit/knowledge/curation-embed.test.ts` — covers KCUR-02 (embed-then-insert, embed-failure-blocks-save, non-null vector)
- [ ] `tests/unit/csv/knowledge-import.test.ts` — covers KCUR-03 parse (mirror `tests/unit/csv/price-book-import.test.ts`)
- [ ] `tests/unit/knowledge/bulk-import-action.test.ts` — covers KCUR-03 bulk insert + batched embed (mock `embedMany`)
- [ ] `lib/schemas/knowledge.ts` — `knowledgeEntrySchema` (a dependency of the action tests)

*(Framework already present — no install needed.)*

## Open Questions

1. **pgvector insert serialization** — Does supabase-js `.insert({ embedding: number[] })` write a pgvector-valid literal, or is `JSON.stringify(vec)` needed?
   - What we know: Phase 118 round-trips vectors via an RPC (read path proven). This phase is the first WRITE.
   - Recommendation: Test the first insert; if it errors, use `JSON.stringify(vec)`. Encode the answer in the KCUR-02 Nyquist test.

2. **Migration deploy status** — Are the Phase 117/118 migrations applied to the target env yet?
   - What we know: Both are authored-only; deploy is CI→GHCR→Coolify (per project memory, never on VPS).
   - Recommendation: Verify the table/RPC exist in the target env before the new actions run; otherwise inserts fail on a missing table. This is an operational pre-req, not a phase task.

3. **Create UX: route vs. dialog** — `app/admin/blog/new/page.tsx` uses a dedicated route; price-book uses a dialog wizard.
   - Recommendation: A dedicated `new/page.tsx` + `[id]/page.tsx` for single-entry CRUD (mirrors blog, cleanest), and a Dialog/Card for the bulk-import flow on the list page.

4. **Markdown import** — REQUIREMENTS says "markdown OR CSV." 
   - Recommendation: Ship CSV first (full price-book reuse). Markdown-file-per-entry is a thin add (one file = title from first `#` heading, body = rest) and can be a second plan or deferred. Flag for the planner to decide scope.

## Sources

### Primary (HIGH confidence)
- `app/admin/blog/actions.ts`, `app/admin/blog/page.tsx`, `app/admin/blog/post-form.tsx` — the CRUD pattern to mirror
- `lib/admin/audit-log.ts` — `AuditAction` union + `logAdminAction`
- `lib/auth/admin-context.ts` — `requireAdmin()` gate
- `lib/supabase/service.ts` — `requireServiceClient()`
- `lib/knowledge/embed.ts` — `embed()` building block (single-string only today)
- `lib/industries.ts` — `INDUSTRIES` (10 industries) + `getIndustryLabel()`
- `lib/csv/price-book-import.ts` + `lib/actions/price-book.ts:308` (`importPriceBookItems`) — the CSV parse + bulk-insert pattern
- `.planning/phases/117-*/117-01-SUMMARY.md` — `knowledge_entries` schema, scope CHECK, HNSW, dual RLS (industry = service-role-write)
- `.planning/phases/118-*/118-01-SUMMARY.md` — `embed()`, `match_knowledge_entries` RPC
- `.planning/REQUIREMENTS.md` v4.8 + `seeds/SEED-033-*` — locked decisions, scope fences
- `components/admin/admin-nav.tsx` — nav entry to add

### Secondary (MEDIUM confidence)
- OpenRouter Embeddings API docs — `input` accepts string OR array; response `data[].index` preserves order; ~96 inputs/request typical max: https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings , https://openrouter.ai/docs/api/reference/embeddings
- OpenRouter embedding models guide — https://www.codewords.ai/blog/openrouter-embedding-models

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive already exists and is in active use in the repo
- Architecture: HIGH — direct mirror of `app/admin/blog/` (CRUD) + price-book import (bulk)
- Pitfalls: HIGH — pgvector-insert and NULL-embedding pitfalls are concrete; batch-embedding verified against OpenRouter docs
- Bulk-import batching: MEDIUM — array input verified by OpenRouter docs (not Context7); exact max-per-request (~96) is a documented community/docs figure, conservatively chunked

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable — internal codebase patterns; only OpenRouter embeddings API is external and stable)
