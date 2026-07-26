---
phase: 180-isolated-demo-session-read-only-foundation
plan: 12
subsystem: background-job-security
tags: [inngest, demo, read-only, providers, notifications, xphere, vitest, tdd]

# Dependency graph
requires:
  - phase: 180-02
    provides: "Canonical explicit-company demo write classifier"
  - phase: 180-10
    provides: "Explicit-company denial for MCP and agent job dispatch"
  - phase: 180-11
    provides: "Trusted-company denial for shared notification and Xphere dispatch funnels"
provides:
  - "Trusted-company denial at all seven product-effect Inngest worker boundaries"
  - "Failure-callback denial before status, audit, notification, and provider effects"
  - "Explicit non-browser authority classification for maintenance, watchdog, grant, and reset workflows"
affects: [180-14, 180-15, phase-181, inngest, notifications, xphere, whatsapp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cookie-less workers call assertCompanyWritable with a trusted event or referenced-row company before their first product effect"
    - "Multi-tenant cron delivery groups by company before applying per-group demo denial"

key-files:
  created:
    - tests/unit/demo/inngest-demo-boundaries.test.ts
  modified:
    - lib/inngest/functions/generate-estimate.ts
    - lib/inngest/functions/analyze-photos.ts
    - lib/inngest/functions/transcribe-audio.ts
    - lib/inngest/functions/whatsapp-process.ts
    - lib/inngest/functions/notification-channel-send.ts
    - lib/inngest/functions/notification-email-digest.ts
    - lib/inngest/functions/xphere-sync.ts

key-decisions:
  - "Product-effect jobs return a deterministic demo_readonly skip instead of throwing, avoiding retries for intentionally denied work."
  - "Audio transcription checks both its referenced recording company and trusted event company so either demo signal fails closed."
  - "Email digest groups rows by company, user, and category so demo and writable tenants can never share one provider-send group."
  - "Cron cleanup, retention, watchdog, monthly grant, and offline reset retain machine/operator authority without browser-session guards."

patterns-established:
  - "Guard retry-exhaustion callbacks as well as primary handlers because failure notifications and status writes are product effects."
  - "A mixed-tenant sweep may perform the minimum read needed to resolve company, then must deny before user lookup, provider send, or mutation."

requirements-completed: [SAFE-01, SAFE-02]

# Metrics
duration: 5 min
completed: 2026-07-26
---

# Phase 180 Plan 12: Product-Effect Inngest Boundaries Summary

**Seven Inngest product-effect workers now stop deterministic demo-company work before writes, credit spend, providers, notifications, audits, or downstream dispatch while platform maintenance authority remains intact.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-26T18:53:06Z
- **Completed:** 2026-07-26T18:57:42Z
- **Tasks:** 2 completed
- **Files modified:** 8

## Accomplishments

- Guarded estimate generation, photo analysis, audio transcription, both WhatsApp processing paths, notification channel delivery, notification email digest, and Xphere synchronization with trusted company context.
- Covered retry-exhaustion callbacks so demo jobs cannot emit failure pipeline rows, tenant notifications, fallback WhatsApp messages, ops alerts, or Xphere error status.
- Kept normal tenant idempotency and concurrency configuration unchanged, including project serialization and request/batch keys.
- Added a 20-case focused contract covering primary handlers, failure callbacks, row-group digest handling, six cron maintenance jobs, and the offline service-role reset.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: RED — test trusted-company denial in product-effect jobs** — `a07c0b3e` (`test`)
2. **Task 2: GREEN — guard product-effect Inngest workers** — `006f95d8` (`feat`)

## Files Created/Modified

- `tests/unit/demo/inngest-demo-boundaries.test.ts` — focused trusted-company guard-order and maintenance-authority classification contract.
- `lib/inngest/functions/generate-estimate.ts` — primary and terminal-failure demo denial before pipeline, graph, usage, credit, and notification work.
- `lib/inngest/functions/analyze-photos.ts` — primary and terminal-failure denial before photo reads, vision providers, credits, dispatch, and notifications.
- `lib/inngest/functions/transcribe-audio.ts` — referenced-row plus event-company denial before pipeline, Whisper, storage, credits, and dispatch.
- `lib/inngest/functions/whatsapp-process.ts` — process, intent-router, and fallback failure denial before typing, graph/provider, message, or audit effects.
- `lib/inngest/functions/notification-channel-send.ts` — trusted event-company denial before WhatsApp or SMS providers.
- `lib/inngest/functions/notification-email-digest.ts` — event-level denial and company-isolated cron grouping before user lookup, email, or sent-state mutation.
- `lib/inngest/functions/xphere-sync.ts` — primary and terminal-failure denial before service-role reads/writes or CRM provider synchronization.

## Decisions Made

- Used non-throwing skip returns for main worker handlers because demo denial is intentional policy, not a retriable failure.
- Repeated the audio check against both the recording-resolved company and event company. This preserves the stronger referenced-row trust while failing closed if either input identifies the demo tenant.
- Added `company_id` to the email digest grouping key. A user with memberships in multiple companies can no longer have demo and normal notifications coalesced into one provider request.
- Left cleanup, retention, watchdog, monthly credit grant, and seed/reset code unchanged. Their cron or offline service-role authorization is operator/platform authority, not a public browser write exemption.

## TDD Gate Compliance

- **RED:** `a07c0b3e` introduced 20 focused cases; 13 failed on missing worker/failure-callback guards while all seven maintenance/reset classifications passed.
- **GREEN:** `006f95d8` added the shared explicit-company guard to all product-effect paths; the focused contract passed 20/20 and adjacent worker suites passed 65/65.
- **REFACTOR:** Not needed; the implementation is a minimal early-return boundary plus company-safe digest grouping.

## Verification

- `npx vitest run tests/unit/demo/inngest-demo-boundaries.test.ts` — passed (20/20).
- Adjacent worker run covering generate, analyze, transcribe, WhatsApp, and email digest — passed (65/65 across 9 files).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed with exit code 0.
- Git history confirms RED `a07c0b3e` precedes GREEN `006f95d8`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no package install, provider call, remote database change, DNS change, deployment, push, or external Inngest operation was performed.

## Known Stubs

None. The eight created/modified files contain no TODO, FIXME, placeholder, coming-soon, or unavailable implementation path.

## Next Phase Readiness

Product-effect background processing now shares the same deterministic company policy as synchronous services. Plans 180-14 and 180-15 can complete database/browser isolation and the consolidated phase gate without an unguarded queued-effect path.

## Self-Check: PASSED

Verified all eight implementation/test artifacts exist, commits `a07c0b3e` and `006f95d8` are reachable in history, RED precedes GREEN, focused and adjacent tests pass, TypeScript is clean, no goal-blocking stub or new threat surface was introduced, and `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
