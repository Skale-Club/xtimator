# Deferred Items — Phase 1000 (xphere-crm-sync)

Out-of-scope issues discovered during execution. NOT caused by this phase's changes; logged for later.

## Pre-existing `tsc --noEmit` errors (present on clean HEAD 373cc69, before 1000-02)

Discovered during 1000-02 verification. Confirmed identical on clean HEAD via `git stash` — none touch the files modified by this plan. Most stem from the Phase 97 Langfuse v3 migration.

- `lib/observability/langfuse.ts(15,10)` — `@langfuse/tracing` has no exported member `Langfuse`.
- `lib/inngest/functions/generate-estimate.ts(116,9)` — `metadata` not in `ConstructorParams`.
- `lib/whatsapp/estimate-graph.ts(78,9)` — `metadata` not in `ConstructorParams`.
- `tests/unit/estimate/observability.test.ts` (3×) — regex `s` flag requires `es2018+` target.
- `tests/unit/inngest/generate-estimate-job.test.ts(145,66)` — Mock not callable (needs `new`).
- `tests/unit/notifications/account-emails.test.ts` (3×) — Branding test fixtures missing `metaDescription`/`ogImageUrl`/`canonicalBaseUrl`/`faviconUrl`.

**Re-confirmed during 1000-03 (Task 2):** the same 10 errors are still present on the base commit (verified again via `git stash` of all 1000-03 changes → identical `tsc` error count). None of the files changed by 1000-03 (`client.ts`, `events.ts`, `xphere-sync.ts`, `functions/index.ts`, `route.ts`, `database.types.ts`, `xphere-client.test.ts`) introduce any new `tsc` error. Recommended owner: a follow-up Phase 97 Langfuse-type cleanup quick task + test-fixture refresh.
