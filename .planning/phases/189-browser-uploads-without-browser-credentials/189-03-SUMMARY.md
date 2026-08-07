---
phase: 189-browser-uploads-without-browser-credentials
plan: 03
subsystem: web
tags: [storage, upload-ticket, browser-upload, capture, offline-resume, r2, supabase-storage]

# Dependency graph
requires:
  - phase: 189-01
    provides: "lib/storage/upload-ticket.ts (mintUploadTicket, UPLOAD_TICKET_BUCKETS, UploadTicket union)"
  - phase: 189-02
    provides: "POST /api/storage/upload-ticket — the caller-authorization route this plan's browser module calls"
provides:
  - "lib/storage/browser-upload.ts: uploadViaTicket()/requestUploadTicket() — the browser-safe, credential-free upload module every browser upload call site now uses"
  - "lib/storage/upload-ticket-types.ts: runtime-free UploadTicket union shared by the server minter and the browser module, so the browser module's import graph never includes the server-only ticket minter's specifier"
  - "Three browser upload call sites (capture-recorder.tsx, inline-audio-recorder.tsx, use-ai-input-submit.ts) migrated off createStorage(...).upload() onto uploadViaTicket()"
affects: [189-04-regression-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-runtime types file (upload-ticket-types.ts) split out from a server-only module so a browser module can import the type without the server module's specifier ever appearing in its static import list — provable-clean rather than clean-if-you-trust-erasure"
    - "Ticket minted once, outside uploadWithRetry's retry loop; the byte move retries against the same key/ticket (preserves the wrapper's 409-as-success idempotency rule)"
    - "StorageProvider-shaped adapter (ticketProvider) lets the byte move reuse uploadWithRetry completely unmodified — read/delete/list methods throw 'upload-only' by design"

key-files:
  created:
    - lib/storage/upload-ticket-types.ts
    - lib/storage/browser-upload.ts
    - tests/unit/storage/browser-upload.test.ts
  modified:
    - lib/storage/upload-ticket.ts
    - components/capture/capture-recorder.tsx
    - components/projects/inline-audio-recorder.tsx
    - components/workspace/ai-input-group/use-ai-input-submit.ts
    - tests/unit/storage/storage-seam-census.test.ts

key-decisions:
  - "companyId dropped from local use in all three components/hooks (the server now derives the storage key from the authenticated caller's active company) but left in every props/args interface unchanged — removing the prop would ripple into parents/callers and is out of this plan's scope"
  - "use-ai-input-submit.ts's previously-discarded upload error is now console.error'd before the unchanged thrown message, so a field failure is diagnosable instead of anonymous (explicitly called for in the plan's action, not a deviation)"
  - "inline-audio-recorder.tsx and use-ai-input-submit.ts both gain uploadViaTicket's default 3-attempt retry, which neither had before — verified no maximum-saving-duration assertion exists in either component or its tests to regress"

requirements-completed: [UPLOAD-01, UPLOAD-04]

# Metrics
duration: ~70min
completed: 2026-08-07
---

# Phase 189 Plan 03: Browser Uploads Move Off Direct Supabase Writes Onto the Ticket Endpoint Summary

**All three browser audio-upload call sites now request a server-issued upload ticket and PUT/uploadToSignedUrl against it via a new `lib/storage/browser-upload.ts`, composing the unmodified `uploadWithRetry` wrapper for the byte move — zero storage credential reaches the browser, and CAPT-01's retry/offline-resume guarantees are unchanged.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 3 completed
- **Files created:** 3 (upload-ticket-types.ts, browser-upload.ts, browser-upload.test.ts)
- **Files modified:** 5 (upload-ticket.ts, capture-recorder.tsx, inline-audio-recorder.tsx, use-ai-input-submit.ts, storage-seam-census.test.ts)

## Re-run Census Result (call_site_map verification)

`grep -rn "createStorage" --include=*.ts --include=*.tsx components` after migration:

```
components/capture/capture-recorder.tsx:19:import { createStorage } from '@/lib/storage'
components/capture/capture-recorder.tsx:409:      const storage = createStorage(supabase)
components/workspace/estimate/estimate-document.tsx:26:import { createStorage } from '@/lib/storage'
components/workspace/estimate/estimate-document.tsx:1333:    createStorage(supabase)
components/workspace/photos/photo-card.tsx:7:import { createStorage } from '@/lib/storage'
components/workspace/photos/photo-card.tsx:38:    createStorage(supabase)
components/workspace/photos/photo-lightbox.tsx:14:import { createStorage } from '@/lib/storage'
components/workspace/photos/photo-lightbox.tsx:50:    createStorage(supabase)
```

Every surviving hit is one of the four `getSignedUrl` READ sites named in the plan's `<call_site_map>` (Phase 190 targets). `capture-recorder.tsx` keeps its `createStorage` import/call for the photo-preview read at line ~409 — its audio-upload call site (line ~907, elsewhere in the same file) no longer calls `createStorage` at all. Zero `.upload(` calls remain in `components/`.

## Accomplishments

### Task 1 — the ticket-driven browser upload module
- `lib/storage/upload-ticket-types.ts` created: the `UploadTicket` discriminated union, zero runtime code, zero imports. `lib/storage/upload-ticket.ts` now imports the type from there and re-exports it, so every existing `import type { UploadTicket } from '@/lib/storage/upload-ticket'` site keeps working unchanged.
- `lib/storage/browser-upload.ts` created: `requestUploadTicket()` (a ~20-line bounded-retry POST ladder, numerically identical to `uploadWithRetry`'s policy — 3 attempts, `baseDelayMs * 2 ** (attempt-1)` backoff, >=500/network retryable, other 4xx terminal) and `uploadViaTicket()` (mints one ticket, then drives the byte move through the unmodified `uploadWithRetry` via a `StorageProvider`-shaped adapter).
- All 10 required test cases from the plan's behavior spec pass: happy path (both strategies), blob stamping (both the re-wrap case and the identity-passthrough case), transient PUT failure recovery with single ticket mint, terminal 4xx, 409-as-success, ticket-POST transient recovery, ticket-POST terminal 401, and abort-mid-backoff. 18/18 tests green on first run.
- `lib/storage/upload-with-retry.ts` and its test file are byte-unchanged (`git diff --stat` empty on both) — confirmed both before and after all three tasks.
- Import-graph guard proven capable of failing: ran it against a synthetic file importing `@/lib/storage/server` and `@/lib/storage/s3-config` first (it correctly flagged both), then against the real `browser-upload.ts` (clean). The plan's own guard regex is anchored on `lib/storage/server`/`lib/storage/s3-config` as path substrings — a same-directory relative `./server` import would not match that specific regex, so I additionally hand-verified via `grep -n "^import" lib/storage/browser-upload.ts` that its only imports are `./index` (types), `./upload-ticket-types` (types), `./upload-with-retry`, and `@/lib/supabase/client` — none of the four forbidden modules, by any specifier form.

### Task 2 — capture-recorder.tsx migration, five preserved behaviors
All five behaviors named in the plan's task were verified by reading the code after the edit:

1. **`if (!recordingIdRef.current)` still wraps the whole block** — confirmed unchanged; the ticket request + upload only happens on first dispatch, not Retry.
2. **`startRecordingPipeline({ storagePath, durationSeconds: storagePath ? finalizeDurationSeconds(...) : undefined })`** — unchanged; `storagePath` is now `uploaded.path` (the server-issued key) on first dispatch, `undefined` on Retry, exactly as before.
3. **`catch` still `return`s before `deletePendingCapture(pendingCaptureKey)`** — verified both by reading the code (the delete call is ~27 lines below the catch block, unreachable from within it) and by the automated guard script (`del < fail` check), which confirmed the delete-before-failure ordering is NOT present.
4. **The pre-flight zero-byte/`MIN_RECORDING_MS` guard still runs before any ticket is requested** — unchanged; it is ~15 lines above the upload block and was not touched.
5. **`failAt('saving', ...)` receives the same message shape** — unchanged: `err instanceof Error ? err.message : t('Failed to upload audio file')`.

`companyId` dead-variable decision: `companyId` was previously used only to build the client-side `storagePath` string (now server-derived) and appeared nowhere else in the file (confirmed via `grep -n "companyId"` before and after). Dropped from the function's destructured parameters (with an inline comment explaining why) and from the `runPipeline` `useCallback` dependency array; left in `CaptureRecorderProps` unchanged since removing the prop would ripple into every parent that passes it.

### Task 3 — inline recorder and AI-input voice submit
- `components/projects/inline-audio-recorder.tsx`: `uploadViaTicket()` replaces `createStorage(supabase).upload(...)`; `catch` shape unchanged (`setSaveError` + `setIsSaving(false)` + `return`). This site gains the 3-attempt retry it did not have — confirmed no saving-duration timeout/assertion exists in this component or any test that would regress.
- `components/workspace/ai-input-group/use-ai-input-submit.ts`: same replacement inside the existing `try`/`catch` that used to discard the underlying error; the thrown message (`t('Failed to upload audio file')`) is unchanged, but a `console.error` with the real error now precedes it.
- Both files: `companyId` dropped from destructuring (kept in each props/args interface, unused elsewhere in either file — confirmed independently per file, not assumed symmetric). `createClient`/`createStorage`/`getFileExtension` imports removed from both files (confirmed no other use of any of the three in either file before removing).

## Task Commits

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | The ticket-driven browser upload module | `9c86157c` | `lib/storage/upload-ticket-types.ts`, `lib/storage/browser-upload.ts`, `tests/unit/storage/browser-upload.test.ts`, `lib/storage/upload-ticket.ts` |
| 2 | Migrate capture-recorder, preserving retry and offline resume | `bb22020d` | `components/capture/capture-recorder.tsx` |
| 3 | Migrate the inline recorder and the AI-input voice submit | `875c782d` | `components/projects/inline-audio-recorder.tsx`, `components/workspace/ai-input-group/use-ai-input-submit.ts`, `tests/unit/storage/storage-seam-census.test.ts` |

This run's spawn instructions directed an atomic commit per task (overriding Task 3's own `<action>` text, which said "Do not commit" — that instruction was written for a scenario with concurrent sibling executors, which this run explicitly has: `190-01` and `191-01` committed interleaved with this plan's own commits, confirmed via `git log --oneline`, matching Plan 02's summary precedent for the same override).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/regression] `tests/unit/storage/storage-seam-census.test.ts` needed updating after Task 3**
- **Found during:** running the full `npx vitest run tests/unit tests/eval` suite after Task 3
- **Issue:** Two failures, both caused by this plan's own changes: (a) the census's exact-set-equality check flagged `inline-audio-recorder.tsx#createStorage` and `use-ai-input-submit.ts#createStorage` as `stale` manifest rows, since neither file calls `createStorage` anymore; (b) the "finds zero raw `.storage.from(` calls" check flagged `lib/storage/browser-upload.ts`, whose `supabase-signed-upload` strategy calls `createClient().storage.from(bucket).uploadToSignedUrl(...)` directly — `uploadToSignedUrl` is not part of the `StorageProvider` interface, exactly the same situation Plan 01 hit with `upload-ticket.ts`'s `createSignedUploadUrl`.
- **Fix:** Removed the two now-stale manifest rows; added `lib/storage/browser-upload.ts` to the raw-call `EXEMPT` set with an inline comment explaining why (mirrors 189-01's precedent for `upload-ticket.ts` exactly); updated the file's header doc comment describing the browser call-site landscape to reflect that only `capture-recorder.tsx` still has a `browser-supabase` census row (for its untouched photo-read call site).
- **Files modified:** `tests/unit/storage/storage-seam-census.test.ts`
- **Verification:** `npx vitest run tests/unit/storage/storage-seam-census.test.ts` — 8/8 pass. Full suite re-run afterward confirmed only the two known Windows/CRLF non-regressions remain.

---

**Total deviations:** 1 auto-fixed (Rule 1 — regression caused directly by this plan's own file changes, fixed in scope)
**Impact on plan:** No scope creep — the fix only touched the one census test file, and only in the ways this plan's own changes required (removing stale rows for call sites this plan removed, exempting a raw call this plan's own new module introduces for a documented, precedented reason).

## Issues Encountered

- `tests/unit/mcp-route-contract.test.ts` appeared in the FAIL set on the first full-suite run (`FAIL tests/unit/mcp-route-contract.test.ts > app/api/mcp/route.ts — behavior > GET returns 405 Method Not Allowed with Allow: POST header`), matching the documented fork-pool-contention flake. Re-ran isolated (`npx vitest run tests/unit/mcp-route-contract.test.ts`): 8/8 passed. Not a regression — confirmed absent from the second full-suite run.
- First full-suite run (before the storage-seam-census fix) showed 5 failed test files: the 2 known CRLF non-regressions, the 2 storage-seam-census failures (fixed above), and the mcp-route-contract flake (resolved by re-run). Second full-suite run (after the fix): exactly 2 failed test files, both the known CRLF non-regressions.

### Final Full-Suite Result

```
VITEST_EXIT=1

 FAIL  tests/unit/sign-estimate-atomic-migration.test.ts > sign_estimate_atomic migration (S2) — shape > is SECURITY DEFINER (a documented departure from save_estimate_atomic INVOKER) with search_path pinned
 FAIL  tests/unit/signature-evidence-retention-migration.test.ts > fix-pack F2, finding #2 — erase_company_for_compliance (GoTrue hard-delete escape hatch) > is SECURITY DEFINER with search_path pinned

 Test Files  2 failed | 617 passed | 1 skipped (620)
      Tests  2 failed | 5364 passed | 20 todo (5386)
```

Both `FAIL` lines match exactly the two known Windows/CRLF non-regressions named in this plan's instructions (pass in CI). Exit code (`VITEST_EXIT=1`) captured directly via a background run + `$?` on the next line, never through a pipe, per instructions.

## User Setup Required

None for this plan's code. The R2 bucket CORS prerequisite documented in this phase's `CONTEXT.md` remains an operator step for a later cutover plan — not touched here, and browser uploads in R2 mode will not actually succeed cross-origin until that CORS policy is applied out-of-band with an admin credential (verified blocked for the app token in Plan 01's context-gathering).

## Next Phase Readiness

- All three browser audio-upload call sites now go through `uploadViaTicket()` — no client module writes to storage with a client-held credential.
- Plan 04 (regression gates) can now write its permanent static import-graph gate against `lib/storage/browser-upload.ts`'s clean import list, and its full-suite/census regression checks against this plan's final state.
- `lib/storage/s3-provider.ts`, `lib/storage/index.ts`, `lib/storage/asset-source.ts`, and `lib/storage/upload-with-retry.ts` (+ its test) remain exactly as Plan 01/02 left them — untouched (`git diff --stat` empty on all four + the test file).
- STATE.md/ROADMAP.md/REQUIREMENTS.md were NOT updated by this run: three sibling plans (`189-03`, `190-01`, `191-01`) executed concurrently in this non-worktree-isolated repo (confirmed via interleaved commits in `git log`), and those three files were already mid-flight-modified by sibling agents when this run finished (confirmed via `git status --porcelain` showing them dirty but untouched by this run's commits). Running `gsd-tools state advance-plan`/`roadmap update-plan-progress`/`requirements mark-complete` here risked clobbering concurrent sibling writes to the same shared files. This mirrors 189-01's and 189-02's summaries, neither of which ran those tools either. The phase orchestrator should run the state/roadmap/requirements updates once after all wave plans (189-03/190-01/191-01, etc.) are confirmed complete.

## Self-Check: PASSED

Verified by direct shell check (not assumed):

- FOUND: `lib/storage/upload-ticket-types.ts`
- FOUND: `lib/storage/browser-upload.ts`
- FOUND: `tests/unit/storage/browser-upload.test.ts`
- FOUND commit `9c86157c`
- FOUND commit `bb22020d`
- FOUND commit `875c782d`
- FOUND: `uploadViaTicket` present in all three migrated call sites (confirmed above via the re-run census + guard-script output)

---
*Phase: 189-browser-uploads-without-browser-credentials*
*Completed: 2026-08-07*
