---
phase: 67-inngest-background-ai-jobs
plan: "04"
subsystem: whatsapp-dispatch
tags: [inngest, whatsapp, refactor, webhook-timeout, dispatch]
dependency_graph:
  requires: [67-02]
  provides: [whatsapp-handler-dispatch]
  affects: [lib/whatsapp/handler.ts, tests/unit/whatsapp/handler.test.ts]
tech_stack:
  added: []
  patterns:
    - Lazy import of inngest client at dispatch site (await import) to keep handler import graph slim
    - Pre-flight stays in webhook path (entitlements + draft project, both <1s); only AI work moves to Inngest
    - Event id = wa-batch-{lastMessageId} (wamid uniqueness) for first-layer idempotency
key_files:
  created: []
  modified:
    - lib/whatsapp/handler.ts
    - tests/unit/whatsapp/handler.test.ts
    - tests/unit/whatsapp/handler-inngest-dispatch.test.ts
decisions:
  - "Lazy await-import of @/lib/inngest/client inside processInboundMessages to keep top-of-handler import graph slim and avoid circular import risk with future Inngest function additions"
  - "Pre-flight stays in handler (NOT moved to Inngest): entitlements check + draft project insert run before dispatch so free-tier rejection is synchronous (no orphan project rows from Inngest race) and the dispatched event carries a real projectId"
  - "Existing handler.test.ts (which asserted inline Whisper/Vision/generate behavior) was rewritten — those flows are now exclusively covered by tests/unit/inngest/whatsapp-process-job.test.ts (Plan 67-02). Re-asserting them here would just duplicate worker tests against a now-stubbed handler"
  - "Helper functions handleTextMessage / handleAudioMessage / handleImageMessage / buildConfirmationMessage removed entirely from handler.ts — equivalent logic lives inside whatsAppProcessJob step.run blocks (Plan 67-02)"
metrics:
  duration_minutes: 3
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 3
  completed_date: "2026-05-15"
  tests_green: 125
requirements: [INNGEST-07]
---

# Phase 67 Plan 04: WhatsApp Handler — Inngest Dispatch Refactor Summary

**One-liner:** Refactored `lib/whatsapp/handler.ts:processInboundMessages` from an inline Whisper+Vision+generate-estimate pipeline into a thin dispatcher that fires one `whatsapp/process.requested` Inngest event per inbound batch — webhook ack to Meta now returns in <1s regardless of audio length.

## Tasks Completed

| Task | Name | Commit(s) | Files |
|------|------|-----------|-------|
| 1 (RED) | Add failing tests for handler Inngest dispatch refactor | ae792de | tests/unit/whatsapp/handler-inngest-dispatch.test.ts |
| 1 (GREEN) | Dispatch WhatsApp batch via Inngest, drop inline AI work | 22b44d4 | lib/whatsapp/handler.ts, tests/unit/whatsapp/handler.test.ts |

## Test Status

```
Test Files  13 passed (13)   # all tests/unit/whatsapp/*
Tests       125 passed (125)
Duration    6.05s
```

Plus the upstream inngest suite still green:
```
Test Files  8 passed (8)
Tests       17 passed (17)
```

## Verification Gates

| Gate | Expected | Actual |
|------|----------|--------|
| `grep 'generateEstimateForProject\|api.openai.com\|new Anthropic' lib/whatsapp/handler.ts` | 0 | 0 |
| `grep 'inngest.send' lib/whatsapp/handler.ts` | >= 1 | 1 |
| `grep 'EVENT_WHATSAPP_PROCESS' lib/whatsapp/handler.ts` | >= 1 | 2 |
| `npx vitest run tests/unit/whatsapp` | exit 0 | exit 0 (125/125) |
| `npx tsc --noEmit` | exit 0 | exit 0 |

## What Changed in handler.ts

### Removed
- `import Anthropic from '@anthropic-ai/sdk'`
- `import { generateEstimateForProject } from '@/lib/services/generate-estimate'`
- `import { downloadWhatsAppMedia } from '@/lib/whatsapp/client'` (only `sendWhatsAppMessage`, `markMessageAsRead`, `sendTypingIndicator` retained)
- `import { getIntegrationKey } from '@/lib/platform-config'`
- `import { createStorage } from '@/lib/storage'`
- Local helpers: `handleTextMessage`, `handleAudioMessage`, `handleImageMessage`, `buildConfirmationMessage`
- ~135 LOC of inline orchestration (loop over messages → download → Whisper/Vision → save → generateEstimateForProject → session insert → confirmation message build → sendWhatsAppMessage)

### Added (replaces the removed body)
```ts
const lastMessageId = messages[messages.length - 1].id
// ...draft project insert (unchanged)...
const { inngest } = await import('@/lib/inngest/client')
const { EVENT_WHATSAPP_PROCESS } = await import('@/lib/inngest/events')
const batchKey = `wa-batch-${lastMessageId}`

await inngest.send({
  name: EVENT_WHATSAPP_PROCESS,
  id: batchKey,
  data: { companyId, projectId, ownerPhone, messages, batchKey },
})
```

### Kept (pre-flight — runs in <1s)
- Entitlements check (free tier rejection happens here so no orphan drafts)
- Draft project insert (gives the worker a stable `projectId` for correlation)
- `markMessageAsRead` / `sendTypingIndicator` (in `processInboundMessage` / `processInboundWithDebounce`)
- Session gate → `processConfirmationReply` (the confirm/cancel reply flow is short and lives outside Inngest)
- All debounce buffer logic (Phase 48)

## Idempotency Story

**Two layers** (matches Plan 67-02 design):
1. **Event-level `id: wa-batch-{lastMessageId}`** — `lastMessageId` is a Meta `wamid.*`, globally unique. Inngest dedups events with the same `id` for 24h, so duplicate webhook redeliveries from Meta collapse to one event.
2. **Function-level `idempotency: 'event.data.batchKey'`** (set inside `whatsAppProcessJob`, Plan 67-02) — second layer that survives event-id misses.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing handler.test.ts asserted inline AI behavior**

- **Found during:** Task 1 GREEN verification (running existing whatsapp test suite)
- **Issue:** `tests/unit/whatsapp/handler.test.ts` had ~10 tests asserting that `processInboundMessage` calls Whisper via `fetch('https://api.openai.com/v1/audio/transcriptions', ...)`, calls Anthropic Vision via the SDK, calls `generateEstimateForProject`, inserts a `whatsapp_sessions` row, and runs orphan project cleanup on Whisper failure. After the refactor those flows no longer exist in handler.ts — they all moved to `whatsAppProcessJob` (Plan 67-02) and are already covered by `tests/unit/inngest/whatsapp-process-job.test.ts`. The plan itself noted this: "the existing handler.test.ts (which tests inline behavior) will be updated/replaced as part of Plan 67-04 once the refactor lands."
- **Fix:** Rewrote `handler.test.ts` to assert the new dispatch surface — keeping session-gate coverage (delegate to `processConfirmationReply` / reminder for non-text), entitlement-gate coverage (free tier rejection still synchronous), and adding dispatch-shape assertions (event name, id pattern, payload contents). Pre-existing concerns covered by other suites are not duplicated.
- **Files modified:** `tests/unit/whatsapp/handler.test.ts`
- **Commit:** 22b44d4

No Rule 2/3/4 deviations. No CLAUDE.md adjustments needed. No auth gates.

## Self-Check: PASSED

- `lib/whatsapp/handler.ts` — EXISTS, dispatch-only, gates verified by grep
- `tests/unit/whatsapp/handler.test.ts` — EXISTS, rewritten for dispatch surface
- `tests/unit/whatsapp/handler-inngest-dispatch.test.ts` — EXISTS, all 9 RED→GREEN
- Commit ae792de (RED test) — verified in `git log`
- Commit 22b44d4 (GREEN refactor) — verified in `git log`
- 125/125 whatsapp tests passing
- 17/17 inngest tests still passing (no regression)
- tsc clean
- No new untracked files; no secrets committed (gitleaks PASS on both commits)

## Ready for Plan 67-05

Plan 05 will refactor the frontend capture flow (`app/projects/[id]/capture/*`) to poll `/api/jobs/[jobId]` instead of awaiting the long-running `/api/generate-estimate` response — closing the loop on the user-facing side of the Inngest migration.
