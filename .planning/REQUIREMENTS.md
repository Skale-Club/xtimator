# Requirements: v4.2 Recording Reliability & Observability

**Goal:** Make the recording → transcription → estimate pipeline reliable and observable. Eliminate the opaque 503 that breaks audio capture, persist every pipeline step to a durable events store, and give Super Admins a searchable event log to diagnose failures without touching the database.

**Started:** 2026-05-28
**Status:** Defining requirements

## Why this milestone (the gap the recording 503 exposed)

Audio capture currently fails with an opaque error. Root cause: `GET /api/jobs/[jobId]` returns `503 "Inngest not configured"` whenever `INNGEST_SIGNING_KEY` is missing. `hooks/use-job-status.ts` surfaces `"Status check failed: 503"`, and `components/capture/capture-recorder.tsx` marks the transcribing step as failed with no actionable recovery.

This 503 is not a new bug — it is the unfinished tail of the v3.1.1 Inngest migration. **INNGEST-01** (worker registration + reachability) and **INNGEST-06** (idempotency) were never completed and are carried forward into this milestone as REC requirements.

Beyond the fix, there is no observability: today only a single `recording_added` row lands in `estimate_activity`. When a capture fails, no one can see which step broke, why, or for whom. This milestone adds a per-step event store and a Super Admin event log UI (modeled on the reference Generations panel) so failures are diagnosable in seconds.

The user-facing capture popup stays simple (human-readable reason + Retry + Edit manually). Deep diagnostics live in Super Admin.

**Source spec:** Notion project "Recording Failure Investigation - Super Admin Event Logs".

---

## v1 Requirements (this milestone)

### REC — Recording Pipeline Reliability

- [ ] **REC-01**: `GET /api/jobs/[jobId]` no longer hard-503s when Inngest is unconfigured — either completes INNGEST-01 (worker functions registered at `app/api/inngest/route.ts` and publicly reachable) or degrades gracefully, returning an actionable, non-error status the client can render (never an opaque 503)
- [ ] **REC-02**: Capture popup (`components/capture/capture-recorder.tsx`) shows a human-readable failure reason plus Retry and "Edit manually" actions — never a raw status code or stack
- [ ] **REC-03**: Retry creates or continues a traceable attempt (same attempt id lineage); "Edit manually" preserves project context so no recording work is lost
- [ ] **REC-04**: Inngest pipeline jobs are idempotent — carry-forward INNGEST-06; `step.run()` boundaries + explicit `idempotencyKey` per job so retries never double-charge AI/transcription providers
- [ ] **REC-05**: `hooks/use-job-status.ts` interprets the new graceful statuses correctly — distinguishes "still processing", "failed with reason", and "config unavailable" without throwing on non-200

### EVENT — Pipeline Event Persistence

- [ ] **EVENT-01**: New events store (table) persists per-attempt, per-step records — attempt id, project id, estimate id, user id, company id, input type, step, status, error message, error/HTTP code, provider, duration, retry count, created/updated timestamps. RLS: deny-all to client, service-role writes, super-admin read only
- [ ] **EVENT-02**: Backend instrumentation writes an event at each pipeline step transition — save recording, transcribe, analyze, generate estimate, preview redirect — capturing both success and failure with timing
- [ ] **EVENT-03**: All input types are captured (recording / photo / manual text); retries increment `retry_count` and link to the originating attempt id
- [ ] **EVENT-04**: Existing single `recording_added` write to `estimate_activity` is preserved (no regression to current activity feed) — the new events store is additive, not a replacement

### ADMINLOG — Super Admin Event Log UI

- [ ] **ADMINLOG-01**: Recent attempts list in Super Admin — Generations-style columns (timestamp, user/company, project/estimate, input type, step reached, status, duration); newest first; paginated
- [ ] **ADMINLOG-02**: Search across attempts by user, project, estimate, attempt id, and error text
- [ ] **ADMINLOG-03**: Filters for status (success/failure/in-progress), input type, and step; success/failure counts displayed; manual refresh control
- [ ] **ADMINLOG-04**: Per-attempt detail view renders a step timeline — each step's timestamp, status, message, error code, safe metadata, and duration
- [ ] **ADMINLOG-05**: No raw sensitive provider payloads (audio bytes, full transcripts, API keys) rendered in the admin UI — only safe, summarized metadata

---

## Out of Scope (deferred / future)

- **Customer-facing diagnostics** — the capture popup stays minimal (reason + Retry + Edit manually); rich diagnostics are Super Admin only
- **External APM / Sentry integration** — this milestone builds an in-app event store, not a third-party observability pipeline
- **Alerting / paging on failure spikes** — event store is queryable but no automated alerts in v1
- **Retention/archival policy for the events store** — TTL/cleanup cron deferred until volume warrants it
- **Replaying or re-running a failed attempt from the admin UI** — read-only diagnostics in v1; Retry stays in the user-facing flow
- **Remaining v3.1.1 UAT / FIX / PERF backlog** — those stay in `.planning/milestones/v3.1.1-REQUIREMENTS.md`; only INNGEST-01/06 are pulled forward (as REC-01/REC-04) because they are the direct root cause of the 503

---

## Key Decisions (Critical)

1. **The 503 is unfinished v3.1.1 work, not a fresh bug** — REC-01 and REC-04 explicitly complete INNGEST-01 and INNGEST-06. Fixing the symptom without finishing the migration would leave the pipeline fragile.
2. **Graceful degradation over hard failure** — when Inngest config is genuinely absent, the job-status endpoint must return an actionable status the UI can render, never a 503 that the polling hook throws on.
3. **Event store is additive** — `estimate_activity`'s `recording_added` write stays; the new table is a separate, richer, service-role-only store. No migration of existing activity data.
4. **Super Admin owns deep diagnostics; the popup stays simple** — clear split so end users see a friendly recovery path while operators get full visibility.
5. **No sensitive payloads in the admin UI** — store and display only safe metadata; raw audio/transcripts/keys never surface in ADMINLOG.

---

## Traceability

Coverage: to be completed by the roadmap (phase assignment starts at Phase 91). Every v1 requirement above must map to exactly one phase — no orphans, no duplicates.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REC-01 | TBD | Pending |
| REC-02 | TBD | Pending |
| REC-03 | TBD | Pending |
| REC-04 | TBD | Pending |
| REC-05 | TBD | Pending |
| EVENT-01 | TBD | Pending |
| EVENT-02 | TBD | Pending |
| EVENT-03 | TBD | Pending |
| EVENT-04 | TBD | Pending |
| ADMINLOG-01 | TBD | Pending |
| ADMINLOG-02 | TBD | Pending |
| ADMINLOG-03 | TBD | Pending |
| ADMINLOG-04 | TBD | Pending |
| ADMINLOG-05 | TBD | Pending |
