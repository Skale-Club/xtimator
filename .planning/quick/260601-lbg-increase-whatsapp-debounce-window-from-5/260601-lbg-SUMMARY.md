---
phase: quick-260601-lbg
plan: 01
subsystem: whatsapp
tags: [debounce, buffer, inngest, whatsapp, handler]
dependency_graph:
  requires: [lib/redis, lib/whatsapp/buffer, lib/whatsapp/handler]
  provides: [buffered awaiting_details dispatch]
  affects: [processInboundWithDebounce, processInboundMessage]
tech_stack:
  added: []
  patterns: [rolling debounce buffer, Redis buffer claim, session re-query after claim]
key_files:
  modified:
    - lib/whatsapp/buffer.ts
    - lib/whatsapp/handler.ts
decisions:
  - "DEBOUNCE_WAIT_MS kept at 5_000 — user confirmed 5s is the intended window"
  - "awaiting_details path now uses same pushToBuffer+debounceWait+tryClaimBuffer rolling-window pattern as the no-session path — single code path is easier to reason about"
  - "Session re-queried after tryClaimBuffer wins to recover current draft_project_id — avoids using potentially-stale existingSession captured before the 15s wait"
  - "Redis-unavailable fallback preserved — immediate single-message dispatch if pushToBuffer returns false"
metrics:
  duration: 8min
  completed: "2026-06-01"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-260601-lbg Plan 01: Increase WhatsApp Debounce Window from 5s to 15s — Summary

**One-liner:** Extended DEBOUNCE_WAIT_MS from 5s to 15s and applied rolling debounce buffer to the `awaiting_details` path so rapid follow-up messages collapse into a single Inngest job.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Increase DEBOUNCE_WAIT_MS to 15 seconds | 9dac054 | lib/whatsapp/buffer.ts |
| 2 | Apply debounce buffer to awaiting_details path | 3feec5a | lib/whatsapp/handler.ts |

## What Was Built

**Task 1 — buffer.ts:** Changed `DEBOUNCE_WAIT_MS` from `5_000` to `15_000`. Updated the module-level comment to reflect "~15 seconds of silence". No other changes.

**Task 2 — handler.ts:** Replaced both bare `dispatchToExistingProject` calls in the `awaiting_details` branches (one in `processInboundWithDebounce`, one in `processInboundMessage`) with the full debounce pattern:

1. `pushToBuffer(fromPhone, message)` — adds the message to the Redis rolling window; falls back to immediate dispatch if Redis is unavailable.
2. `debounceWait()` — sleeps 15s; any newer message arriving during this window becomes the new winner.
3. `tryClaimBuffer(fromPhone, message.id)` — atomic claim; returns `null` if a newer message won (this worker exits silently).
4. Session re-query — after the wait, re-fetches `draft_project_id` from `whatsapp_sessions` scoped by `company_id + phone_number + state + expires_at` to avoid using a stale session snapshot.
5. `dispatchToExistingProject(batch.map(b => b.message), ...)` — dispatches the full collected batch as one Inngest job.

## Verification

```
grep -n "DEBOUNCE_WAIT_MS" lib/whatsapp/buffer.ts
# 25: export const DEBOUNCE_WAIT_MS = 15_000

grep -n "awaiting_details" lib/whatsapp/handler.ts
# lines 72 and 181 — both blocks contain pushToBuffer

npx tsc --noEmit
# No errors in lib/whatsapp/buffer.ts or lib/whatsapp/handler.ts
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — session re-query scoped by `company_id + phone_number + state + expires_at` (T-lbg-03 mitigation applied as specified in plan threat model).

## Self-Check: PASSED

- `lib/whatsapp/buffer.ts` — exists, `DEBOUNCE_WAIT_MS = 15_000` confirmed
- `lib/whatsapp/handler.ts` — exists, both `awaiting_details` blocks use `pushToBuffer`
- Commit `9dac054` — exists (buffer.ts change)
- Commit `3feec5a` — exists (handler.ts change)
- `npx tsc --noEmit` — no errors in modified files
