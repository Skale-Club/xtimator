# Phase 93: Super Admin Event Log - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning
**Mode:** Auto (--auto) — recommended defaults selected per gray area, logged below

<domain>
## Phase Boundary

Deliver a **Super Admin–only Event Log UI** that reads the Phase 92 `pipeline_events` store and lets an operator diagnose any recording→estimate failure in seconds. It provides: a **recent-attempts list** (Generations-style columns, newest first, paginated), **search** (user / project / estimate / attempt id / error text), **filters** (status / input type / step) with **success/failure counts** and a **manual refresh**, and a **per-attempt detail view** rendering a **step timeline** (timestamp, status, message, error code, safe metadata, duration).

This phase is **read-only observability UI**. It does NOT write or mutate `pipeline_events`, does NOT change the pipeline or Phase 92 instrumentation, and exposes **only safe, summarized metadata** — never raw audio bytes, full transcripts, or API keys (ADMINLOG-05). It lives in the existing `app/admin/` super-admin area, gated by `requireAdmin()`.

In scope: the admin route(s) + nav entry, the attempts list (grouped by `attempt_id`), search/filter/count/refresh controls, the per-attempt step-timeline detail view, a read-only attempt-aggregation seam (DB view or server aggregation), and i18n labels.
Out of scope: any write/edit/delete of events, retention/TTL, alerting, external APM export, charts/analytics dashboards, CSV export (all deferred).
</domain>

<decisions>
## Implementation Decisions

### List granularity & attempt aggregation
- **D-01:** The list is **attempt-grouped**, not raw per-step rows. `pipeline_events` is append-only one-row-per-step (Phase 92 D-01); the list shows **one row per `attempt_id`** with derived columns: first/last timestamp, user/company, project/estimate, `input_type`, **step reached** (latest step), **terminal status** (failed > started/in-progress > succeeded precedence), **total duration**, and retry indicator. The per-attempt **detail view** (D-05) renders the raw step rows. (Satisfies ADMINLOG-01 "recent attempts list" + ADMINLOG-04 "step timeline".)
  - `[auto] List granularity — Q: "Attempt-grouped rows or raw per-step rows in the main list?" → Selected: "Attempt-grouped" (recommended: ADMINLOG-01 asks for an attempts list with a single 'step reached'/'status'/'duration' per attempt; raw rows belong in the detail timeline)`
- **D-02:** Aggregation seam — **prefer a read-only Postgres view** `pipeline_attempts` (or an RPC) created in a small Phase 93 migration, defined with `security_invoker = on` so the existing `pipeline_events` super-admin SELECT RLS is enforced through it. It GROUPs BY `attempt_id` and exposes the D-01 derived columns + the fields needed for search/filter/counts, enabling correct **attempt-level pagination** and **counts** in SQL. **Fallback:** if a view proves awkward, aggregate in TypeScript from a bounded service-client read. Planner picks; the view is the recommended path for correct pagination. **No new writable tables, no change to `pipeline_events`.**

### Data read & pagination
- **D-03:** Reads run **server-side** in a Server Component (or server action) via `requireServiceClient()` (RLS-bypassing), mirroring `app/admin/admins/page.tsx` and `app/admin/companies/page.tsx`. Access is gated by `requireAdmin()` at the route/layout (the `app/admin/layout.tsx` gate already applies). Because the service client bypasses RLS, the `requireAdmin()` gate is the load-bearing authorization — it MUST wrap every read.
- **D-04:** **Server-side pagination**, newest first (`created_at DESC` — index exists). Offset/limit via URL search params (e.g. `?page=N`, page size ~50). Do NOT use the client-side `components/ui/data-table.tsx` fetch-all pattern for the main list — the table grows unbounded. (Satisfies ADMINLOG-01 "paginated".)

### Search
- **D-05:** **Server-side search** driven by a URL search param, matching across: `attempt_id`, `project_id`, `estimate_id`, `user_id` (UUID exact/prefix/contains) and `error_message`/`error_code` (ILIKE). "Search by user" resolves **email → user_id** via the service auth admin lookup (same `svc.auth.admin` capability used in `app/admin/admins/page.tsx`); if email resolution is non-trivial, matching by `user_id` is the minimum and email-join is Claude's discretion. (Satisfies ADMINLOG-02.)

### Filters, counts, refresh
- **D-06:** **Filters** for `status` (succeeded / failed / in-progress[=started, no terminal]), `input_type` (recording / photo / manual_text), and `step` (save_recording / transcribe / analyze / generate_estimate / preview_redirect), implemented as **URL search params** (server round-trip) using existing shadcn `Select`/Button-chip patterns. **Counts:** success / failure (and in-progress) totals computed server-side, reflecting the current filter+search set. **Manual refresh:** a button that re-runs the server query (`router.refresh()` / `revalidatePath`). (Satisfies ADMINLOG-03.)

### Detail view (step timeline)
- **D-07:** A **dedicated detail page** at `app/admin/events/[attemptId]/page.tsx` (deep-linkable, consistent with `app/admin/companies/[id]/page.tsx`), NOT a drawer/sheet. It fetches all `pipeline_events` rows for the `attempt_id` ordered by `created_at ASC` and renders a **net-new vertical step-timeline component**: per step — name, status (color-coded), timestamp, `duration_ms`, `error_code` + `error_message` (when failed), `provider`, `retry_count`, and safe metadata. Header shows attempt-level summary (user/company, project/estimate, input_type, terminal status). (Satisfies ADMINLOG-04.)

### Safe-metadata guard (ADMINLOG-05)
- **D-08:** Render **only the known safe `pipeline_events` columns** (id, attempt_id, project_id, estimate_id, user_id, company_id, input_type, step, status, error_message, error_code, provider, duration_ms, retry_count, created_at). The table has no raw-payload column by Phase 92 design, so the guard is structural: **never** add a fetch/render of audio bytes, full transcripts, or API keys. A whitelist of rendered fields (not a blocklist) enforces this. (Satisfies ADMINLOG-05.)

### Route & navigation
- **D-09:** New route group under `app/admin/events/` — `page.tsx` (list) + `[attemptId]/page.tsx` (detail). Add an "Event Log" entry to the Super Admin nav (`components/admin/admin-nav.tsx` `NAV_ITEMS`).

### i18n
- **D-10:** Use the established admin i18n pattern: `<T>…</T>` (`@/components/i18n/t`) in Server Components, `useTranslation()` (`@/lib/i18n/use-translation`) in Client Components, for all labels, headers, filter options, status text, and empty states (EN/PT-BR/ES).

### Claude's Discretion
- View-vs-TS aggregation final call (D-02); exact page size; email→user_id resolution depth (D-05); timeline component visual treatment; whether counts are global vs filter-scoped (recommend filter-scoped); chips vs Select for filters; whether to reuse `components/ui/data-table.tsx` for presentation only (client search/sort over the server-fetched page) while keeping pagination server-side.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §ADMINLOG-01..05 — the five requirements this phase satisfies
- `.planning/ROADMAP.md` §"Phase 93: Super Admin Event Log" (~L1012) — goal + 5 success criteria

### Phase 92 store (what this UI reads)
- `supabase/migrations/20260529000001_phase92_pipeline_events.sql` — `pipeline_events` columns, indexes (`attempt_id`, `(company_id, created_at DESC)`, `(created_at DESC)`, `status`), and the super-admin SELECT policy `pipeline_events_select_super_admin` (`EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()))`)
- `types/database.types.ts` — `pipeline_events` Row type (column shape the UI renders); regenerate if a Phase 93 view/RPC is added
- `.planning/phases/92-pipeline-event-persistence/92-CONTEXT.md` — D-02 column semantics, D-03 started/terminal modeling, the "no sensitive data" guard

### Super Admin area patterns to reuse
- `app/admin/layout.tsx` — admin layout + the `requireAdmin()` gate that wraps the area
- `lib/auth/admin-context.ts` — `requireAdmin()` / `getAdminContext()` (super-admin gate, cached 60s)
- `lib/supabase/admin-gate.ts` — `checkPlatformAdmin()` (proxy-side gate)
- `app/admin/admins/page.tsx` — server read via `requireServiceClient()` + `svc.auth.admin.listUsers` (email lookup precedent)
- `app/admin/companies/page.tsx` + `app/admin/companies/[id]/page.tsx` — list + detail-page pattern to mirror
- `app/admin/billing/billing-table.tsx` — shadcn `Table` + per-row client state pattern
- `app/admin/admins/actions.ts` — `'use server'` + `requireAdmin()` + `requireServiceClient()` + `{ ok, message }` discriminated return
- `components/ui/data-table.tsx` — reusable client search/filter-tabs/sort (presentation only — NOT for unbounded pagination)
- `components/admin/admin-nav.tsx` — `NAV_ITEMS` (add "Event Log")
- `components/ui/table.tsx`, `components/ui/sheet.tsx`, `components/ui/dialog.tsx`, `components/ui/select.tsx` — shadcn primitives available

### Data access
- `lib/supabase/service.ts` — `requireServiceClient()` (RLS-bypassing read client; gate with `requireAdmin()`)

### i18n
- `components/i18n/t.tsx` (`<T>`), `lib/i18n/use-translation.ts` (`useTranslation()`) — admin translation pattern (EN/PT-BR/ES)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin()` (`lib/auth/admin-context.ts`) — server-side super-admin gate; throws `notFound()` for non-admins. Load-bearing authz when using the service client.
- `requireServiceClient()` (`lib/supabase/service.ts`) — RLS-bypassing read client used by every admin page.
- shadcn `Table`, `Select`, `Sheet`, `Dialog`, `Card`, `Button`, `Input` + `components/ui/data-table.tsx` — all present.
- `app/admin/companies/[id]/page.tsx` — concrete list→detail-page precedent (breadcrumb + Card + back link).
- i18n: `<T>` (server) / `useTranslation()` (client) already used across admin pages.

### Established Patterns
- Super-admin pages: Server Component → `requireAdmin()` → `requireServiceClient()` → `.from(...).select(...).order(...)`; pass data to a Client component for interactivity.
- Admin route gating at `app/admin/layout.tsx` (+ proxy `checkPlatformAdmin`).
- Server actions in `app/admin/**/actions.ts` return `{ ok, message }`.

### Integration Points
- New route: `app/admin/events/page.tsx` (list) + `app/admin/events/[attemptId]/page.tsx` (detail).
- Nav: `components/admin/admin-nav.tsx` `NAV_ITEMS`.
- Reads: `pipeline_events` (+ optional `pipeline_attempts` view) via service client, gated by `requireAdmin()`.
- Must NOT: write/mutate `pipeline_events`, change Phase 92 instrumentation, or render any raw provider payload.

### Net-New (no existing pattern)
- Per-attempt **step-timeline** component (no timeline/activity-feed component exists in the admin area).
- Attempt-level **aggregation** read (view/RPC or TS) — new.
- Multi-field server-side **search** + filter-scoped **counts** + **refresh** control in admin — new composition of existing primitives.
</code_context>

<specifics>
## Specific Ideas

- Modeled on the reference **"Generations" panel**: a dense recent-attempts table (timestamp, who, what, input type, step reached, status, duration) → click a row → full per-attempt step timeline with errors and timing. Keep it operator-focused and information-dense, not marketing-polished.
- Status color coding: succeeded = green, failed = red/destructive, in-progress/started = amber/muted.
- Empty state and "no results for this filter/search" state both required (admin pages use empty states).
</specifics>

<deferred>
## Deferred Ideas

- CSV/JSON export of attempts — out of scope (operator can read in-UI).
- Charts / failure-rate-over-time analytics — out of scope (counts only).
- Retention / TTL / archival of `pipeline_events` — explicitly out of scope per REQUIREMENTS.md.
- Alerting on failure spikes, external APM/Sentry export — out of scope.
- Real-time live updates / auto-refresh — manual refresh only (ADMINLOG-03).

None of the above belong in Phase 93.
</deferred>

---

*Phase: 93-super-admin-event-log*
*Context gathered: 2026-05-30*
