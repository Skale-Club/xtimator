# Phase 93: Super Admin Event Log - Research

**Researched:** 2026-05-30
**Domain:** Read-only Super-Admin observability UI over an append-only Postgres event store (Next.js 14 App Router Server Components + Supabase service client + shadcn/ui)
**Confidence:** HIGH (every architectural claim is grounded in a cited repo file; the one net-new SQL artifact — a Postgres view — has no in-repo precedent and is flagged LOW/MEDIUM where relevant)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The list is **attempt-grouped**, not raw per-step rows. One row per `attempt_id` with derived columns: first/last timestamp, user/company, project/estimate, `input_type`, step reached (latest step), terminal status (failed > started/in-progress > succeeded precedence), total duration, retry indicator. The per-attempt **detail view** (D-07) renders the raw step rows.
- **D-02:** Aggregation seam — **prefer a read-only Postgres view** `pipeline_attempts` (or RPC) in a small Phase 93 migration, defined with `security_invoker = on` so the existing `pipeline_events` super-admin SELECT RLS is enforced through it. GROUPs BY `attempt_id`, exposes D-01 derived columns + fields for search/filter/counts, enabling attempt-level pagination + counts in SQL. **Fallback:** TS aggregation from a bounded service-client read. Planner picks; view is recommended. **No new writable tables, no change to `pipeline_events`.**
- **D-03:** Reads run **server-side** in a Server Component via `requireServiceClient()` (RLS-bypassing), mirroring `app/admin/admins/page.tsx` and `app/admin/companies/page.tsx`. Gated by `requireAdmin()` at the route/layout. Because the service client bypasses RLS, `requireAdmin()` is the load-bearing authorization — it MUST wrap every read.
- **D-04:** **Server-side pagination**, newest first (`created_at DESC` — index exists). Offset/limit via URL search params (`?page=N`, page size ~50). Do NOT use the client-side `components/ui/data-table.tsx` fetch-all pattern for the main list.
- **D-05:** **Server-side search** via URL search param, matching `attempt_id`, `project_id`, `estimate_id`, `user_id` (UUID exact/prefix/contains) and `error_message`/`error_code` (ILIKE). "Search by user" resolves email → user_id via service auth admin lookup (same `svc.auth.admin` capability as `app/admin/admins/page.tsx`); matching by `user_id` is the minimum, email-join is Claude's discretion.
- **D-06:** **Filters** for `status` (succeeded / failed / in-progress[=started]), `input_type` (recording / photo / manual_text), `step` (save_recording / transcribe / analyze / generate_estimate / preview_redirect), as **URL search params** using shadcn `Select`/Button-chip patterns. **Counts:** success / failure (and in-progress) totals computed server-side, reflecting current filter+search set. **Manual refresh:** button that re-runs the server query (`router.refresh()` / `revalidatePath`).
- **D-07:** A **dedicated detail page** at `app/admin/events/[attemptId]/page.tsx` (deep-linkable, consistent with `app/admin/companies/[id]/page.tsx`), NOT a drawer. Fetches all `pipeline_events` rows for `attempt_id` ordered `created_at ASC` and renders a net-new vertical step-timeline: per step — name, status (color-coded), timestamp, `duration_ms`, `error_code` + `error_message` (when failed), `provider`, `retry_count`, safe metadata. Header shows attempt-level summary.
- **D-08:** Render **only the known safe `pipeline_events` columns** (id, attempt_id, project_id, estimate_id, user_id, company_id, input_type, step, status, error_message, error_code, provider, duration_ms, retry_count, created_at). Table has no raw-payload column by Phase 92 design → guard is structural. **Never** add a fetch/render of audio bytes, full transcripts, or API keys. A whitelist of rendered fields (not a blocklist) enforces this.
- **D-09:** New route group under `app/admin/events/` — `page.tsx` (list) + `[attemptId]/page.tsx` (detail). Add an "Event Log" entry to the Super Admin nav (`components/admin/admin-nav.tsx` `NAV_ITEMS`).
- **D-10:** Established admin i18n pattern: `<T>…</T>` (`@/components/i18n/t`) in Server Components, `useTranslation()` (`@/lib/i18n/use-translation`) in Client Components, for all labels, headers, filter options, status text, empty states (EN/PT-BR/ES).

### Claude's Discretion

View-vs-TS aggregation final call (D-02); exact page size; email→user_id resolution depth (D-05); timeline component visual treatment; whether counts are global vs filter-scoped (recommend filter-scoped); chips vs Select for filters; whether to reuse `components/ui/data-table.tsx` for presentation only (client search/sort over the server-fetched page) while keeping pagination server-side.

### Deferred Ideas (OUT OF SCOPE)

- CSV/JSON export of attempts.
- Charts / failure-rate-over-time analytics (counts only).
- Retention / TTL / archival of `pipeline_events`.
- Alerting on failure spikes, external APM/Sentry export.
- Real-time live updates / auto-refresh — manual refresh only (ADMINLOG-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **ADMINLOG-01** | Recent attempts list — Generations-style columns (timestamp, user/company, project/estimate, input type, step reached, status, duration); newest first; paginated | Attempt-aggregation seam (§Pattern 1 — `pipeline_attempts` view + SQL) drives the grouped rows; server-side `.range()` pagination (§Pattern 3); server `Table` mirrors `companies/page.tsx:52-100` |
| **ADMINLOG-02** | Search by user, project, estimate, attempt id, and error text | `.or()` PostgREST filter (§Pattern 4) — precedent `lib/mcp/tools/read.ts:200,311`, `lib/notifications/queries.ts:61`; email→user_id via `svc.auth.admin` (§Pattern 5) — precedent `app/admin/admins/actions.ts:35` |
| **ADMINLOG-03** | Filters (status / input type / step); success/failure counts; manual refresh | URL searchParams → `.eq()` filters (§Pattern 4); counts via `{ count: 'exact', head: true }` (§Pattern 6) — precedent `lib/actions/recording.ts:142`; refresh via `router.refresh()` (§Pattern 7) |
| **ADMINLOG-04** | Per-attempt detail — step timeline (timestamp, status, message, error code, safe metadata, duration) | Detail route + `EventStepTimeline` (§Pattern 8); raw rows ordered `created_at ASC`; status precedence + duration formatting (§Code Examples) |
| **ADMINLOG-05** | No raw sensitive payloads — only safe summarized metadata | Structural guard: `pipeline_events` has NO payload column (`types/database.types.ts:966-1027`); render whitelist of the 15 safe columns (§Don't Hand-Roll, §Validation) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack (locked):** Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui, react-hook-form + zod (no form here — read-only UI), Supabase Postgres with RLS on all tables.
- **Security:** Service role key never exposed to browser. All privileged reads server-side. Here that means: every `requireServiceClient()` call MUST be in a Server Component / server module, never imported into a `'use client'` file, and MUST be preceded by `requireAdmin()`.
- **Secret handling:** Never commit secrets, including in `.planning/` docs and migrations. The Phase 93 migration contains only DDL — no secrets. `gitleaks` pre-commit hook is active.
- **GSD workflow:** All edits go through a GSD command. (Planner/executor concern.)

## Summary

Phase 93 is a **read-only observability UI** — there is zero new write surface, zero pipeline change. The entire phase is a composition of patterns the repo has already shipped in `app/admin/*`: a Server Component that calls `requireAdmin()` then `requireServiceClient()`, queries via the supabase-js v2 builder, and hands data to small client controls. The only genuinely net-new artifacts are (1) a tiny Postgres **view** (`pipeline_attempts`) that the project has never used before — there is **no existing `CREATE VIEW` or `security_invoker` precedent anywhere in `supabase/migrations/`** — and (2) the `EventStepTimeline` component (no timeline/activity-feed exists in admin).

The load-bearing design decision is the **attempt-aggregation seam** (D-01/D-02). `pipeline_events` is append-only one-row-per-step (Phase 92 D-01), but the list is attempt-grouped. A `security_invoker = on` view that `GROUP BY attempt_id` lets pagination, status/input_type/step filtering, and success/failure counts all run correctly in SQL against attempt-level rows — which a TypeScript fetch-then-group approach cannot do without fetching the whole table (the exact unbounded-growth trap D-04 forbids). **Recommendation: build the view.** It is a small, well-bounded migration applied with the established one-off `pg` applier (`scripts/apply-migration-92-00.mjs` precedent), since `supabase db push` is blocked by remote migration-history drift (documented in that script's header and in 92's notes).

The security model is subtle and must be called out: the super-admin SELECT RLS policy on `pipeline_events` (`20260529000001_phase92_pipeline_events.sql:36-40`) is **NOT enforced** when reading through the service client (service role bypasses RLS). So `requireAdmin()` is the only thing standing between this UI and a cross-tenant data leak — it MUST wrap every read on both the list and detail routes, in addition to the layout gate.

**Primary recommendation:** Create a `security_invoker = on` Postgres view `pipeline_attempts` (Phase 93 migration via the `pg` applier); build list + detail Server Components that call `requireAdmin()` → `requireServiceClient()`; do server-side `.range()` pagination + `.or()` search + `.eq()` URL-param filters + `{count:'exact',head:true}` counts; render a whitelist-only `EventStepTimeline`; reuse all shadcn primitives and the admin i18n/`<T>` pattern.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 14+ App Router (`searchParams` async prop) | Server Components, server-side pagination, `router.refresh()` | Project standard; every admin page is a Server Component |
| `@supabase/supabase-js` | `^2.103.0` (verified in `package.json:29`) | `.from().select().or().eq().order().range()`; `{count:'exact',head:true}`; `svc.auth.admin.listUsers` | Already the only DB client; `.or()`/`count`/`range` all used in-repo |
| `shadcn/ui` (project-local) | vendored in `components/ui/*` | `Table`, `Select`, `Card`, `Badge`, `Button`, `Input` | No registry init; all primitives present (UI-SPEC reuse inventory) |
| `lucide-react` | (admin standard) | `ScrollText` (nav), `RefreshCw`, `ChevronLeft`, `Search` | Already the admin icon set (`admin-nav.tsx:6`) |
| `pg` | (devDependency, used by `scripts/apply-migration-*.mjs`) | One-off migration applier for the view | Established precedent — `db push` blocked by remote drift |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/components/i18n/t` (`<T>`) | repo | Server-component label translation | All static strings in Server Components |
| `@/lib/i18n/use-translation` (`useTranslation`) | repo | Client-component label translation | All strings in `'use client'` controls |
| `@/components/dashboard/empty-state` (`EmptyState`) | repo | Empty + no-results states | Both states (UI-SPEC copy) |
| `vitest` | `^4.1.4` (`package.json:77`) | Unit tests | All Wave-0/validation tests; `npm test` = `vitest run` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pipeline_attempts` SQL view | TypeScript aggregation from a bounded `pipeline_events` read | TS cannot paginate/count at attempt granularity without fetching the whole table (violates D-04 unbounded-growth guard). Only viable if event volume is tiny AND a hard `.limit()` cap is acceptable. View is strongly recommended. |
| Postgres view | Postgres RPC (`SECURITY INVOKER` function returning a set) | RPC allows parameterized filters in SQL but is harder to compose with PostgREST `.or()`/`.range()`; a view is filterable like a table via the supabase-js builder. View wins for this read pattern. |
| `svc.auth.admin.listUsers({perPage:1000})` for email→user_id | `getUserById` per row | Phase 72 (STATE.md:421) replaced `listUsers(1000)` with `getUserById` per-row for the *admins* page because that table has 1–5 rows. For **search** here you have a single email→one user_id lookup, so a bounded `listUsers` filter or a single `getUserById` (if you already have the id) is fine — see §Pattern 5 cost note. |

**Installation:** None. All dependencies already in `package.json`. No `npm install` for this phase.

**Version verification:** `@supabase/supabase-js ^2.103.0` and `vitest ^4.1.4` read directly from `package.json` (lines 29, 77) — current as of this repo. `.or()`, `count`, and `range` are stable supabase-js v2 APIs already exercised in-repo (`lib/mcp/tools/read.ts:200,311`, `lib/notifications/queries.ts:61`, `lib/actions/recording.ts:142`), so no external version check is needed.

## Architecture Patterns

### Recommended File Structure
```
app/admin/events/
├── page.tsx                    # List Server Component: requireAdmin → service client → pipeline_attempts query (paginated/filtered/searched) + counts; renders server Table + client controls
├── events-controls.tsx         # 'use client': search Input + status/input_type/step Selects + Refresh button; pushes URL searchParams (router.replace) + router.refresh()
├── events-pagination.tsx       # 'use client' (or server links): Previous/Next using ?page=N
└── [attemptId]/
    └── page.tsx                # Detail Server Component: requireAdmin → service client → raw pipeline_events rows (created_at ASC) → <EventStepTimeline>

components/admin/
└── event-step-timeline.tsx     # Net-new: vertical timeline (whitelist props only — ADMINLOG-05)

supabase/migrations/
└── 20260530XXXXXX_phase93_pipeline_attempts_view.sql   # security_invoker view

scripts/
└── apply-migration-93-00.mjs   # one-off pg applier (mirror of apply-migration-92-00.mjs)

tests/unit/admin/
├── pipeline-attempts-query.test.ts   # search .or construction, filter param→query mapping, count queries
├── event-step-timeline.test.ts       # whitelist guard, status precedence, duration formatting
└── events-route-gate.test.ts         # static source assert: requireAdmin present on both routes
```

### Pattern 1: `pipeline_attempts` view (the aggregation seam — D-01/D-02) [Confidence: MEDIUM]

**What:** A read-only view grouping `pipeline_events` by `attempt_id`, exposing the D-01 derived columns. `security_invoker = on` means the view executes with the *querying role's* permissions, so the `pipeline_events` super-admin SELECT RLS policy is enforced through it (relevant only when read with a non-service role; the service client bypasses RLS regardless — see Pitfall 1).

**When to use:** This is the recommended path. Build it unless event volume is provably trivial.

**Why MEDIUM not HIGH:** The project has **no existing `CREATE VIEW` and no `security_invoker` precedent** (`grep` of `supabase/migrations/` returns nothing). `security_invoker = on` requires Postgres 15+ (Supabase remote is 15+, HIGH). The terminal-status precedence and "latest step" logic below are correct standard SQL but unverified against live data — the planner should keep an integration smoke check (apply-script verifies the view exists; manual query confirms shape).

**The SQL (recommended starting point — planner may refine column list):**
```sql
-- supabase/migrations/20260530XXXXXX_phase93_pipeline_attempts_view.sql
-- Phase 93: read-only attempt-grouped view over append-only pipeline_events.
-- security_invoker=on → pipeline_events super-admin SELECT RLS is enforced through the view.
-- No new table, no writes. Applied via scripts/apply-migration-93-00.mjs (db push blocked by remote drift).

CREATE OR REPLACE VIEW public.pipeline_attempts
WITH (security_invoker = on) AS
SELECT
  pe.attempt_id,
  MIN(pe.created_at)                                   AS first_at,
  MAX(pe.created_at)                                   AS last_at,
  -- lineage: take the non-null value seen on any row for the attempt
  MAX(pe.user_id::text)::uuid                          AS user_id,
  MAX(pe.company_id::text)::uuid                        AS company_id,
  MAX(pe.project_id::text)::uuid                        AS project_id,
  MAX(pe.estimate_id::text)::uuid                       AS estimate_id,
  MAX(pe.input_type)                                   AS input_type,
  -- step reached = step of the latest row by created_at
  (ARRAY_AGG(pe.step ORDER BY pe.created_at DESC))[1]  AS step_reached,
  -- terminal status precedence: failed > started > succeeded
  CASE
    WHEN BOOL_OR(pe.status = 'failed')    THEN 'failed'
    WHEN BOOL_OR(pe.status = 'started')   THEN 'started'
    ELSE 'succeeded'
  END                                                  AS terminal_status,
  SUM(COALESCE(pe.duration_ms, 0))                     AS total_duration_ms,
  MAX(pe.retry_count) > 0                              AS has_retry,
  MAX(pe.retry_count)                                  AS max_retry_count,
  COUNT(*)                                             AS event_count
FROM public.pipeline_events pe
GROUP BY pe.attempt_id;

COMMENT ON VIEW public.pipeline_attempts IS
  'Phase 93: attempt-grouped read-only view over pipeline_events. security_invoker=on; no writes.';
```

**Pagination + filtering against the view** (via supabase-js, in the Server Component):
```typescript
// Source: composes count pattern (lib/actions/recording.ts:142) + .or (lib/mcp/tools/read.ts:200)
const PAGE = 50
let q = svc.from('pipeline_attempts').select('*', { count: 'exact' })
if (status)    q = q.eq('terminal_status', status)       // succeeded|failed|started
if (inputType) q = q.eq('input_type', inputType)
if (step)      q = q.eq('step_reached', step)
if (search)    q = q.or(buildSearchOr(search))           // see Pattern 4
const from = (page - 1) * PAGE
const { data, count } = await q.order('last_at', { ascending: false }).range(from, from + PAGE - 1)
```
`step` filter caveat: `.eq('step_reached', step)` filters by the *latest* step. If the requirement intent is "any attempt that touched this step," that needs a different predicate (an `EXISTS` against the base table or a separate column) — recommend `step_reached` (latest) for v1 and note the nuance for the planner.

### Pattern 2: Server-side gate (D-03) — the load-bearing authz [Confidence: HIGH]
**What:** `requireAdmin()` (`lib/auth/admin-context.ts:39-43`, throws `notFound()` for non-admins, 60s-cached check) MUST run before `requireServiceClient()` (`lib/supabase/service.ts:25-34`) on every read.
**Why:** `requireServiceClient()` returns a service-role client that bypasses RLS — the Phase 92 super-admin SELECT policy is inert for it. The layout already gates (`app/admin/layout.tsx:16-17` calls `getAdminContext()` → `notFound()`), but defense-in-depth + the admins/companies precedent is to also call `requireAdmin()` in each page (see `app/admin/companies/[id]/page.tsx:18`, `app/admin/admins/page.tsx:9`).
```typescript
// Source: app/admin/companies/page.tsx:17-25
export const dynamic = 'force-dynamic'
export default async function EventLogPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  await requireAdmin()                       // ← load-bearing; do NOT remove
  const svc = requireServiceClient()
  const sp = await searchParams              // Next 14: searchParams is a Promise
  // ...query pipeline_attempts...
}
```

### Pattern 3: Server-side offset pagination + searchParams (D-04) [Confidence: HIGH]
- `searchParams` is an **async prop** in this Next version — `await searchParams` (mirrors `params: Promise<{id}>` at `app/admin/companies/[id]/page.tsx:14-19`). Read `?page`, `?status`, `?input_type`, `?step`, `?q`.
- Use supabase-js `.range(from, to)` (0-indexed, inclusive) for offset pagination; `{ count: 'exact' }` on the same query yields `count` for "Page n of m".
- `export const dynamic = 'force-dynamic'` (present on `companies/page.tsx:8`) so searchParams don't get statically cached.
- Pagination controls: render `Previous`/`Next` as `<Link href={?page=n±1}>` (server, no JS) OR a small client component using `useRouter().replace()`. Either is fine; links are simpler and SSR-friendly.

### Pattern 4: Multi-field search via `.or()` (D-05 / ADMINLOG-02) [Confidence: HIGH]
**What:** PostgREST `.or()` takes a comma-joined filter string. Precedents: `lib/mcp/tools/read.ts:200` (`created_at.lt.X,and(...)`) and `:311` (`name.ilike.%${term}%,email.ilike.%${term}%`), `lib/notifications/queries.ts:61` (`user_id.is.null,user_id.eq.${id}`).
```typescript
// Source: lib/mcp/tools/read.ts:311 (ilike .or pattern)
function buildSearchOr(term: string): string {
  const esc = term.replace(/[%,()]/g, '')            // strip PostgREST meta-chars (injection guard)
  const clauses = [
    `error_message.ilike.%${esc}%`,
    `error_code.ilike.%${esc}%`,
  ]
  if (isUuid(esc)) {                                  // exact id match only when it parses as a UUID
    clauses.push(`attempt_id.eq.${esc}`, `project_id.eq.${esc}`, `estimate_id.eq.${esc}`, `user_id.eq.${esc}`)
  }
  return clauses.join(',')
}
```
**Important:** `attempt_id`/`project_id`/`estimate_id`/`user_id` are `uuid` columns — `ilike` on a uuid column errors in Postgres. Gate id-matching behind a UUID-shape check and use `.eq` (exact). ILIKE/`contains` is only valid for the TEXT columns (`error_message`, `error_code`). "UUID prefix/contains" from CONTEXT is NOT directly possible on a uuid column without casting (`attempt_id::text`) — if prefix search is desired, the view should expose `attempt_id::text AS attempt_id_text` and ILIKE that. Recommend exact-uuid match for v1 (simplest, correct).

### Pattern 5: email → user_id resolution (D-05) [Confidence: HIGH]
**What:** `svc.auth.admin.listUsers({ perPage: 1000 })` then `.find(u => u.email === email)` — exact precedent `app/admin/admins/actions.ts:35-36`.
**Cost/limits:** `listUsers` returns up to 1000 users/page and is a paginated admin API; for a *single* search term it's one round-trip but loads up to 1000 user records. Recommendation: only call it when the search term **looks like an email** (`includes('@')`); for everything else use the `.or()` id/text matching. This keeps the common path cheap. If the user base grows beyond 1000, `listUsers` paging would miss users — note as a known v1 limitation (acceptable: this is an internal diagnostic search, not a guarantee).

### Pattern 6: Filter-scoped counts (D-06 / ADMINLOG-03) [Confidence: HIGH]
**What:** Run the same filtered/searched query three times with `{ count: 'exact', head: true }` (no rows fetched, just the count), once per terminal status — or one base count + per-status. Precedent: `lib/actions/recording.ts:142`, `lib/actions/photo.ts:62`, and the v3.0 billing MRR counts (`60-02-PLAN.md:328-329` — three parallel `count:'exact',head:true` queries).
```typescript
// Source: 60-02-PLAN.md:328 — parallel head-count queries
const baseFilters = (qb) => { /* apply status-agnostic search + input_type + step */ return qb }
const [succeeded, failed, started] = await Promise.all(
  (['succeeded','failed','started'] as const).map(s =>
    baseFilters(svc.from('pipeline_attempts').select('attempt_id', { count:'exact', head:true })).eq('terminal_status', s)
  )
).then(rs => rs.map(r => r.count ?? 0))
```
Counts are **filter-scoped** (reflect search + input_type + step but NOT the status filter itself, so all three numbers always show) — matches the UI-SPEC "{n} succeeded · {n} failed · {n} in progress" line and the Discretion resolution #2.

### Pattern 7: Manual refresh (D-06) [Confidence: HIGH]
**What:** A `'use client'` button calling `useRouter().refresh()` (re-runs the Server Component query without full reload). Precedent across the repo for close-then-refresh (STATE.md Phase 20/21 entries). `revalidatePath('/admin/events')` from a server action is the alternative; `router.refresh()` is simpler for a pure-read surface. UI-SPEC: `Button variant="outline" size="sm"` + `RefreshCw`, `ml-auto`.

### Pattern 8: Detail page + `EventStepTimeline` (D-07 / ADMINLOG-04) [Confidence: HIGH]
**What:** `app/admin/events/[attemptId]/page.tsx` mirrors `app/admin/companies/[id]/page.tsx` exactly (back-link `ChevronLeft` + `<T>All attempts</T>`, glass `Card` header, `notFound()` when no rows). Fetch:
```typescript
// Source: app/admin/companies/[id]/page.tsx:21-28 (detail fetch + notFound)
const { id: attemptId } = await params
const { data: rows } = await svc.from('pipeline_events')
  .select('id,attempt_id,project_id,estimate_id,user_id,company_id,input_type,step,status,error_message,error_code,provider,duration_ms,retry_count,created_at')
  .eq('attempt_id', attemptId)
  .order('created_at', { ascending: true })   // ASC for chronological timeline (D-07)
if (!rows || rows.length === 0) notFound()
```
Note the explicit column list IS the ADMINLOG-05 whitelist — never `select('*')` here is fine too since the table has no unsafe columns, but an explicit list documents the contract and survives any future column addition. `EventStepTimeline` is built per the UI-SPEC net-new spec (left-rail dot+connector + glass step cards, status color map). Status conveyed by color AND text (WCAG 1.4.1).

### Anti-Patterns to Avoid
- **Importing `requireServiceClient` into a client component.** It reads `process.env` secret keys server-side only. All queries stay in Server Components / server modules. (`lib/supabase/service.ts` has no `'server-only'` guard, so this discipline is manual — flag in review.)
- **Using `components/ui/data-table.tsx` for the list.** It fetches all rows client-side and filters in `useMemo` (`data-table.tsx:84-111`) → unbounded growth (D-04). Borrow its search-input/chip/empty-state *visuals* only; the list table is a server-rendered `Table` (UI-SPEC Discretion #5).
- **`ilike` on a uuid column.** Errors in Postgres. Gate id search behind a UUID-shape check + `.eq` (Pattern 4).
- **Removing `requireAdmin()` "because the layout already gates."** Service client bypasses RLS; the page-level gate is the documented defense-in-depth precedent (Pattern 2 / Pitfall 1).
- **`select('*')` then rendering raw rows in the timeline without a field whitelist.** Even though the table is structurally safe today, the whitelist is the ADMINLOG-05 contract that survives future schema changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Attempt grouping/pagination | TS fetch-all + `groupBy` in JS | `pipeline_attempts` SQL view + `.range()` | JS can't paginate/count at attempt granularity without loading the whole table (D-04) |
| Multi-field search | Manual `WHERE` string concat | supabase-js `.or()` (Pattern 4) | PostgREST handles escaping/parsing; precedent in `read.ts`, `queries.ts` |
| Counts | `SELECT count(*)` raw SQL per status | `{ count:'exact', head:true }` | No rows transferred; established repo pattern (`recording.ts:142`) |
| Admin gate | Custom session/role check | `requireAdmin()` (`admin-context.ts:39`) | Cached, throws `notFound()`, is the project authz contract |
| Email→user_id | Custom auth.users query | `svc.auth.admin.listUsers` (`admins/actions.ts:35`) | auth schema is not directly queryable via PostgREST; admin API is the supported path |
| Empty / no-results states | Bespoke markup | `<EmptyState>` (`empty-state.tsx`) | Has `onClearFilter`, gradient icon, i18n built in |
| i18n | Hardcoded EN strings | `<T>` / `useTranslation()` | EN/PT-BR/ES contract (D-10) |
| Migration apply | `supabase db push` | `scripts/apply-migration-93-00.mjs` (pg) | `db push` blocked by remote history drift (documented in `apply-migration-92-00.mjs:2-4`) |

**Key insight:** This phase is ~90% recomposition of shipped admin patterns. The only thing worth "building" is the SQL view and the timeline component; everything else is wiring existing primitives.

## Runtime State Inventory

> This is a greenfield read-only UI phase, not a rename/refactor. Included only to confirm no hidden runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The `pipeline_events` table already exists (Phase 92). Phase 93 adds a read-only `pipeline_attempts` **view** over it. No data migration — the view is computed, holds no rows. | Create view (DDL only) |
| Live service config | None — no external service touched. | None |
| OS-registered state | None. | None |
| Secrets/env vars | Reuses existing `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` (`service.ts:14-15,26-27`). No new secrets. | None |
| Build artifacts | `types/database.types.ts` must be regenerated (or hand-edited) to include the new view's Row type if you want typed access to `pipeline_attempts`. See §State of the Art for regen method. | Regen types OR hand-edit (precedent: STATE.md Phase 19/24/38 — Docker unavailable on Windows, manual extension is established) |

## Common Pitfalls

### Pitfall 1: Service client silently bypasses the super-admin RLS policy
**What goes wrong:** Phase 92 added `pipeline_events_select_super_admin` RLS (`20260529000001_phase92_pipeline_events.sql:36-40`) assuming Phase 93 reads as an authenticated super-admin. But every admin page reads via `requireServiceClient()` (service role), which **bypasses all RLS**. The policy never fires.
**Why it happens:** The policy and the read path use different roles. The view's `security_invoker = on` also has no effect under the service role.
**How to avoid:** Treat `requireAdmin()` as the sole authorization boundary and call it at the top of BOTH `events/page.tsx` and `events/[attemptId]/page.tsx` (Pattern 2). Do not rely on the RLS policy or the layout gate alone.
**Warning signs:** A non-admin reaching `/admin/events` and seeing data — would indicate the `requireAdmin()` call is missing.

### Pitfall 2: `ilike` / `contains` on a `uuid` column throws
**What goes wrong:** `attempt_id.ilike.%abc%` errors (`operator does not exist: uuid ~~ unknown`).
**Why it happens:** `attempt_id`, `project_id`, `estimate_id`, `user_id` are `uuid` in `pipeline_events` (`database.types.ts:968,974,975,977,982` show them as `string` but the DDL is `uuid`).
**How to avoid:** Pattern 4 — gate id matching behind a UUID-shape regex and use `.eq` (exact). For prefix search, expose `::text` casts in the view and ILIKE those.
**Warning signs:** 400 from PostgREST with a uuid-operator error in the network tab.

### Pitfall 3: `searchParams` not awaited
**What goes wrong:** Reading `searchParams.page` directly returns a Promise / undefined.
**Why it happens:** This Next version passes `searchParams` (and `params`) as Promises (see `companies/[id]/page.tsx:14-19`).
**How to avoid:** `const sp = await searchParams` before reading keys.
**Warning signs:** `page` is always the default; filters never apply.

### Pitfall 4: View not in generated types → `from('pipeline_attempts')` is untyped/red
**What goes wrong:** `svc.from('pipeline_attempts')` errors under TS strict because the view isn't in `database.types.ts`.
**Why it happens:** Types weren't regenerated after the migration.
**How to avoid:** Regenerate via PAT (`supabase gen types --project-id prmqgcrnpuvpzruyzvuv`) OR hand-edit `database.types.ts` to add the `pipeline_attempts` Views/Row entry (established manual-extension precedent — STATE.md Phase 19/24/38). For a view, add under `Views:` not `Tables:`.
**Warning signs:** `tsc` error "Argument of type '\"pipeline_attempts\"' is not assignable".

### Pitfall 5: `db push` will fail — use the pg applier
**What goes wrong:** `supabase db push` errors on remote migration-history drift.
**Why it happens:** Remote has versions absent from the local migrations dir (documented in `apply-migration-92-00.mjs:2-4`).
**How to avoid:** Copy `scripts/apply-migration-92-00.mjs` → `apply-migration-93-00.mjs`, swap version/name, run `node scripts/apply-migration-93-00.mjs`. It applies the SQL, records it in `supabase_migrations.schema_migrations`, and self-verifies.
**Warning signs:** "Remote migration versions not found in local migrations directory."

## Code Examples

### Status-precedence + duration formatting (timeline + view parity)
```typescript
// Source: derived from D-01 precedence rule (CONTEXT D-01) + UI-SPEC status map
export function terminalStatus(rows: { status: string }[]): 'failed' | 'started' | 'succeeded' {
  if (rows.some(r => r.status === 'failed'))  return 'failed'
  if (rows.some(r => r.status === 'started')) return 'started'
  return 'succeeded'
}
export function formatDuration(ms: number | null): string {
  if (ms == null) return '—'           // null renders em-dash (billing-table.tsx:90 precedent)
  return `${ms} ms`
}
```

### Safe-column whitelist (ADMINLOG-05 contract)
```typescript
// Source: CONTEXT D-08 / database.types.ts:967-983 (the full, safe column set)
export const SAFE_EVENT_COLUMNS = [
  'id','attempt_id','project_id','estimate_id','user_id','company_id',
  'input_type','step','status','error_message','error_code','provider',
  'duration_ms','retry_count','created_at',
] as const
export type SafeEvent = Pick<Database['public']['Tables']['pipeline_events']['Row'], typeof SAFE_EVENT_COLUMNS[number]>
// EventStepTimeline accepts SafeEvent[] ONLY — no transcript/audio/key field is representable.
```

### Nav item (D-09)
```typescript
// Source: components/admin/admin-nav.tsx:9-25 (NAV_ITEMS shape { href, label, Icon })
import { ScrollText } from 'lucide-react'   // add to existing lucide import
{ href: '/admin/events', label: 'Event Log', Icon: ScrollText },
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `supabase gen types --db-url` (needs Docker) | `supabase gen types --project-id <id>` via PAT, OR manual edit of `database.types.ts` | Since Phase 19 (STATE.md:265) — Docker unavailable on Windows | Regen the view's Row type via PAT with project-id `prmqgcrnpuvpzruyzvuv` (STATE.md), or hand-add a `Views.pipeline_attempts` entry |
| `supabase db push` | One-off `pg` applier `scripts/apply-migration-*.mjs` | Since Phase 92 remote drift (`apply-migration-92-00.mjs:2-4`) | Use `apply-migration-93-00.mjs` |

**Deprecated/outdated:** none specific to this phase. The Postgres view `security_invoker` clause requires PG15+ — Supabase remote is PG15+, so HIGH that it's supported.

## Open Questions

1. **View vs RPC vs TS aggregation (D-02 final call).**
   - What we know: View is the recommended path; TS aggregation is the fallback; project has no view precedent.
   - What's unclear: Live `pipeline_events` row volume (affects whether TS fetch-all is even briefly viable).
   - Recommendation: **Build the view.** It's the only approach that satisfies D-04 (server pagination) + D-06 (SQL counts) correctly regardless of volume. Keep the migration tiny and self-verifying (apply-script checks the view exists).

2. **"Step" filter semantics — latest step vs any step touched.**
   - What we know: `step_reached` = latest step (matches the list's "step reached" column).
   - What's unclear: Whether an operator filtering by `step=transcribe` wants "attempts whose latest step was transcribe" or "attempts that ran transcribe at all."
   - Recommendation: Filter on `step_reached` (latest) for v1 — consistent with the displayed column; note the nuance so the planner can add an `EXISTS`-based "touched step" filter later if asked.

3. **UUID prefix/contains search (CONTEXT D-05 mentions "prefix/contains").**
   - What we know: `ilike` is invalid on uuid columns; exact `.eq` works.
   - What's unclear: Whether operators actually paste partial ids.
   - Recommendation: Exact UUID match for v1 (Pattern 4). If partial-id search is requested, expose `attempt_id::text` in the view and ILIKE that — small, additive change.

4. **Email→user_id depth (D-05).**
   - Recommendation: Only resolve when the term contains `@`; use `listUsers` find (single round-trip). Accept the 1000-user ceiling as a known v1 limit for an internal diagnostic tool.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | build/test/migration | ✓ | (project standard; `npm test` works) | — |
| `@supabase/supabase-js` | all reads | ✓ | ^2.103.0 (`package.json:29`) | — |
| `vitest` | validation tests | ✓ | ^4.1.4 (`package.json:77`) | — |
| `pg` (devDep) | one-off migration applier | ✓ | used by `apply-migration-92-00.mjs` | — |
| `DATABASE_URL` in `.env.local` | apply-migration script | ✓ assumed (Phase 92 used it) | — | If absent at apply time, planner sets it from Supabase pooler URL (session-mode :5432, per `apply-migration-92-00.mjs:21`) |
| Supabase remote (PG15+) | `security_invoker` view | ✓ | project `prmqgcrnpuvpzruyzvuv` (STATE.md) | View created remotely via applier; no local Postgres needed |
| Docker | type regen via `--db-url` | ✗ | — | Use PAT `gen types --project-id` OR hand-edit `database.types.ts` (established) |
| Supabase CLI `db push` | migration | ✗ (blocked by drift) | — | `apply-migration-93-00.mjs` pg applier |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Docker (→ PAT/manual type regen); `db push` (→ pg applier). Both have established, working fallbacks.

## Validation Architecture

> nyquist_validation is enabled (`.planning/config.json` `workflow.nyquist_validation: true`). This section is REQUIRED.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.1.4` (`package.json:77`) |
| Config file | `vitest` config present; `include` scoped to `tests/unit/**` (STATE.md:159 — "vitest include pattern explicitly set to tests/unit/** to avoid Playwright import collisions") |
| Quick run command | `npm test` (= `vitest run`, `package.json:11`) — full unit suite; runs in seconds |
| Full suite command | `npm test` |

**Mocking patterns (established):**
- **Static source-read assertions** (no DB): `readFileSync(resolve(process.cwd(), 'path'))` + `expect(src).toMatch(/regex/)` — precedent `tests/unit/inngest/transcribe-audio-job.test.ts:33-49`. Use for "requireAdmin present", "no transcript/audio field referenced", "view DDL has security_invoker".
- **Mocked supabase client**: `vi.mock('@/lib/supabase/service', ...)` returning a chainable mock whose `.from().select().or().eq().order().range()` record calls — pattern mirrors `tests/unit/api/transcribe-dispatch.test.ts:52-70` (`makeSupabaseMock` builder). Use to assert the query builder emits the right `.or()` string / `.eq()` filters / count queries.
- **No live DB in unit tests.** DB-state behaviors (view returns correct groups; RLS) are integration/manual.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMINLOG-01 | Attempt grouping/pagination query builds `.range()` + `order('last_at',desc)` + `count:'exact'` | unit (mocked supabase) | `npm test -- tests/unit/admin/pipeline-attempts-query.test.ts` | ❌ Wave 0 |
| ADMINLOG-01 | View DDL static contract: `security_invoker = on`, `GROUP BY attempt_id`, derived cols present | unit (static source read of migration .sql) | `npm test -- tests/unit/admin/pipeline-attempts-view.test.ts` | ❌ Wave 0 |
| ADMINLOG-01 | View actually returns one row per attempt with correct precedence | manual/integration (DB state) | manual query after `apply-migration-93-00.mjs` | n/a (manual) |
| ADMINLOG-02 | `buildSearchOr` emits ILIKE for text + `.eq` for UUID only; strips meta-chars | unit (pure fn) | `npm test -- tests/unit/admin/pipeline-attempts-query.test.ts` | ❌ Wave 0 |
| ADMINLOG-02 | email term (`@`) triggers `listUsers` path; non-email does not | unit (mocked `svc.auth.admin`) | same file | ❌ Wave 0 |
| ADMINLOG-03 | filter param→`.eq()` mapping (status/input_type/step); count queries use `head:true` per status | unit (mocked supabase) | same file | ❌ Wave 0 |
| ADMINLOG-03 | Refresh control calls `router.refresh()` | unit (static source read of control) OR manual | `npm test -- tests/unit/admin/events-controls.test.ts` | ❌ Wave 0 |
| ADMINLOG-04 | `terminalStatus` precedence (failed>started>succeeded); `formatDuration(null)='—'` | unit (pure fn) | `npm test -- tests/unit/admin/event-step-timeline.test.ts` | ❌ Wave 0 |
| ADMINLOG-04 | Detail fetch orders `created_at ASC`; `notFound()` on empty | unit (static source read) | `npm test -- tests/unit/admin/events-detail.test.ts` | ❌ Wave 0 |
| ADMINLOG-05 | `EventStepTimeline` source references ONLY `SAFE_EVENT_COLUMNS`; NO `transcript`/`audio`/`apiKey`/`payload`/`raw` token | unit (static source read — the structural guard) | `npm test -- tests/unit/admin/event-step-timeline.test.ts` | ❌ Wave 0 |
| ADMINLOG-05 | Detail query select list ⊆ 15 safe columns (no `select('*')` of unsafe; or asserts explicit list) | unit (static source read) | `npm test -- tests/unit/admin/events-detail.test.ts` | ❌ Wave 0 |
| cross-cutting | `requireAdmin()` called in both `events/page.tsx` and `events/[attemptId]/page.tsx` before any read | unit (static source read) | `npm test -- tests/unit/admin/events-route-gate.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (full unit suite is fast; no scoped runner needed).
- **Per wave merge:** `npm test` (all green).
- **Phase gate:** `npm test` green + manual: apply view via `apply-migration-93-00.mjs`, query `pipeline_attempts` to confirm grouping/precedence, click through `/admin/events` (list paginates, filters apply, search works, counts reflect filters, detail timeline renders, no payload anywhere) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/admin/pipeline-attempts-query.test.ts` — covers ADMINLOG-01/02/03 (query builder: `.or` construction, filter→`.eq` mapping, `.range`, count queries)
- [ ] `tests/unit/admin/pipeline-attempts-view.test.ts` — static contract on the migration `.sql` (security_invoker, GROUP BY, columns)
- [ ] `tests/unit/admin/event-step-timeline.test.ts` — whitelist guard + status precedence + duration format
- [ ] `tests/unit/admin/events-detail.test.ts` — ASC order, notFound, safe select list
- [ ] `tests/unit/admin/events-route-gate.test.ts` — requireAdmin presence on both routes
- [ ] `tests/unit/admin/events-controls.test.ts` — refresh/`router.refresh()` (optional; may fold into manual)
- [ ] No framework install needed — vitest present.

## Sources

### Primary (HIGH confidence — read directly from repo)
- `app/admin/admins/page.tsx`, `app/admin/admins/actions.ts:35` — service-client read + `auth.admin.listUsers` precedent
- `app/admin/companies/page.tsx:17-100`, `app/admin/companies/[id]/page.tsx:13-92` — list + detail Server Component pattern, `force-dynamic`, async params, mono IDs, back-link
- `app/admin/layout.tsx:16-17` — layout `getAdminContext()` gate
- `lib/auth/admin-context.ts:39-43` — `requireAdmin()` (notFound, 60s cache)
- `lib/supabase/service.ts:25-34` — `requireServiceClient()` (RLS-bypass)
- `supabase/migrations/20260529000001_phase92_pipeline_events.sql` — table columns, indexes, super-admin SELECT RLS
- `types/database.types.ts:966-1027` — `pipeline_events` Row (the 15 safe columns; uuid columns)
- `components/admin/admin-nav.tsx:9-25` — `NAV_ITEMS` shape `{ href, label, Icon }`
- `components/ui/data-table.tsx:84-111,132-185` — client fetch-all (do-not-use-for-list) + borrowable search/chip/empty visuals
- `app/admin/billing/billing-table.tsx:36-51,90` — `TierBadge` soft-fill pill idiom; em-dash for null
- `components/dashboard/empty-state.tsx`, `components/i18n/t.tsx`, `lib/i18n/use-translation.ts` — i18n + empty-state primitives
- `lib/mcp/tools/read.ts:200,311` — `.or()` filter + keyset precedent; `lib/notifications/queries.ts:61` — `.or()` is.null/eq
- `lib/actions/recording.ts:142`, `lib/actions/photo.ts:62`, `.planning/.../60-02-PLAN.md:328` — `{count:'exact',head:true}` count pattern
- `scripts/apply-migration-92-00.mjs` — one-off pg applier (db-push-drift workaround, self-verifying)
- `tests/unit/inngest/transcribe-audio-job.test.ts:33-59`, `tests/unit/api/transcribe-dispatch.test.ts:17-70` — static-source + mocked-supabase test patterns
- `.planning/STATE.md:159,265,421` — vitest include scope; type-regen-without-Docker; listUsers→getUserById decision
- `package.json:11,29,77` — `test` script, supabase-js, vitest versions

### Secondary (MEDIUM confidence)
- Postgres `security_invoker = on` view semantics (PG15+) — standard SQL; **no in-repo precedent** (verified via grep: no `CREATE VIEW`/`security_invoker` in `supabase/migrations/`). Flagged MEDIUM; the view DDL should be smoke-verified by the apply script + a manual query.

### Tertiary (LOW confidence)
- None. Context7 MCP tools were unavailable this session; supabase-js `.or()`/`count`/`range` claims are instead grounded in HIGH-confidence in-repo usage rather than external docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from `package.json`; all APIs used in-repo.
- Architecture (gate, pagination, search, counts, detail): HIGH — every pattern has a cited working precedent in `app/admin/*` or `lib/*`.
- Aggregation view (`pipeline_attempts`): MEDIUM — correct standard SQL but no in-repo view precedent; precedence/grouping logic unverified against live data (mitigated by self-verifying apply script + manual smoke).
- Pitfalls: HIGH — each is grounded in a specific repo fact (uuid columns, service-role RLS bypass, async searchParams, db-push drift).

**Research date:** 2026-05-30
**Valid until:** 2026-06-29 (stable — internal repo patterns; ~30 days)
