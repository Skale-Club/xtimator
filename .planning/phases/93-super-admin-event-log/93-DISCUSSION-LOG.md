# Phase 93: Super Admin Event Log - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 93-super-admin-event-log
**Mode:** Auto (--auto) — recommended defaults auto-selected
**Areas discussed:** List granularity & aggregation, Pagination & data read, Search, Filters/counts/refresh, Detail view, Safe-metadata guard

---

## List granularity & aggregation

| Option | Description | Selected |
|--------|-------------|----------|
| Attempt-grouped rows | One row per `attempt_id` (step reached, terminal status, total duration); raw steps in detail | ✓ |
| Raw per-step rows | List shows every `pipeline_events` row | |

**User's choice:** Attempt-grouped (auto: recommended)
**Notes:** ADMINLOG-01 asks for an attempts list with a single step-reached/status/duration per attempt; raw rows belong in the ADMINLOG-04 timeline. Aggregation via a `security_invoker` view `pipeline_attempts` (recommended) or TS fallback.

---

## Pagination & data read

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side pagination via service client | Server Component + `requireServiceClient()`, offset/limit URL params, newest first | ✓ |
| Client-side fetch-all (data-table) | Fetch all rows, paginate in the browser | |

**User's choice:** Server-side pagination (auto: recommended)
**Notes:** `pipeline_events` grows unbounded; `created_at DESC` index exists. `requireAdmin()` is the load-bearing authz since the service client bypasses RLS.

---

## Search

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side multi-field search | URL param matches attempt/project/estimate/user ids + error text (ILIKE); email→user_id lookup | ✓ |
| Client-side search over current page | Filter only the fetched page in-browser | |

**User's choice:** Server-side multi-field (auto: recommended)
**Notes:** ADMINLOG-02 requires search across the whole store, not just the visible page. Email resolution via `svc.auth.admin` (precedent in admins page); user_id match is the minimum, email-join is discretion.

---

## Filters, counts, refresh

| Option | Description | Selected |
|--------|-------------|----------|
| URL search params + server round-trip | Status/input_type/step filters as params; counts server-computed; refresh via router.refresh | ✓ |
| Client-only filtering | Filter the fetched page in-browser | |

**User's choice:** URL params (auto: recommended)
**Notes:** Counts must reflect the whole filtered set (server-side), not just the page. Manual refresh only — no auto/live refresh (ADMINLOG-03).

---

## Detail view (step timeline)

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated detail page `[attemptId]` | Deep-linkable page, mirrors companies/[id]; vertical step timeline | ✓ |
| Drawer / Sheet overlay | Open timeline in a side sheet over the list | |

**User's choice:** Dedicated detail page (auto: recommended)
**Notes:** Matches existing admin detail-page precedent; deep-linkable for sharing an attempt. Timeline component is net-new (no existing timeline in admin).

---

## Safe-metadata guard (ADMINLOG-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Whitelist safe columns | Render only known safe `pipeline_events` fields; never raw payloads | ✓ |
| Blocklist sensitive fields | Render everything except an explicit deny-list | |

**User's choice:** Whitelist (auto: recommended)
**Notes:** Structural guard — the table has no raw-payload column by Phase 92 design; a render whitelist makes leaking audio/transcripts/keys impossible by construction.

---

## Claude's Discretion

- View-vs-TS aggregation final call; page size; email→user_id resolution depth; timeline visual treatment; global vs filter-scoped counts (recommend filter-scoped); chips vs Select for filters; presentation-only reuse of `data-table.tsx` over a server-fetched page.

## Deferred Ideas

- CSV/JSON export; failure-rate charts/analytics; retention/TTL; alerting; external APM export; real-time/live auto-refresh — all out of scope for Phase 93.
