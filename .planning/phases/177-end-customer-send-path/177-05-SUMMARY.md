---
phase: 177-end-customer-send-path
plan: 05
subsystem: notifications
tags: [templates, customer-messaging, sms, email, supabase, fallback-copy]

# Dependency graph
requires:
  - phase: 172-template-editor-foundation
    provides: "lib/notifications/template-engine.ts's renderTemplate()/RenderChannel/TemplateVars — the shared {{var}} interpolator + per-channel (html/text) escaping, reused verbatim"
  - phase: 172-template-editor-foundation
    provides: "notification_templates table with a scope CHECK constraint already reserving 'customer' as a valid value (zero rows/resolver code until this plan)"
provides:
  - "buildCustomerCopy(eventType, channel, ctx) — built-in fallback copy for end-customer (email/sms) sends, exhaustive-switch guarded, one case today: 'estimate.sent'"
  - "resolveCustomerCopy(eventType, channel, ctx) — DB-first (scope='customer') resolver, falls back to buildCustomerCopy on any miss/empty-body/empty-after-render/throw, never blocks a send"
affects: [177-06, 177-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Customer-scoped copy/resolver modules kept fully PARALLEL to the tenant-scoped copy.ts/template-resolver.ts — never widen the tenant EventType union or its switch-exhaustive functions to accommodate customer event types"
    - "DB-first with defensive built-in fallback (query miss, null/empty body, empty-after-render, or thrown error all degrade to the same built-in copy) — same discipline as Phase 172's resolveNotificationCopy"

key-files:
  created:
    - lib/notifications/customer-copy.ts
    - lib/notifications/customer-template-resolver.ts
    - tests/unit/notifications/customer-copy.test.ts
    - tests/unit/notifications/customer-template-resolver.test.ts
  modified: []

key-decisions:
  - "customer-copy.ts and customer-template-resolver.ts are NEW, separate modules (not extensions of copy.ts/template-resolver.ts) — CustomerEventType is a small independent union so the tenant EventType switch stays untouched, avoiding any Phase 172/174 regression risk"
  - "customer-template-resolver.ts has no title/in_app rendering path — customer channels are email (subject+body) and sms (body only); the tenant resolver's in_app title logic does not apply here"
  - "Test file copies (does not import) template-resolver.test.ts's makeTemplateClient() helper, per plan instruction, to avoid any file coupling with the sibling 174-04 executor editing template-resolver.ts concurrently"

patterns-established:
  - "Exhaustiveness guard via `default: { const _exhaustive: never = eventType }` in buildCustomerCopy, mirroring copy.ts's style, so a forgotten CustomerEventType case is a compile error"

requirements-completed: [CUST-01, CUST-02]

# Metrics
duration: 3min
completed: 2026-07-21
---

# Phase 177 Plan 05: Customer-Scoped Fallback Copy + DB-First Template Resolver Summary

**New `buildCustomerCopy()`/`resolveCustomerCopy()` pair gives end-customer sends (email/sms) a DB-editable, fallback-safe copy source scoped to `notification_templates.scope='customer'`, fully parallel to and never touching Phase 172's tenant-scoped `copy.ts`/`template-resolver.ts`.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-21T23:05:00-04:00
- **Completed:** 2026-07-21T23:08:33-04:00
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `buildCustomerCopy('estimate.sent', channel, ctx)` — built-in fallback for both sms (plain-text body) and email (subject + inline-HTML body), with defensive `??` defaults on every context field
- `resolveCustomerCopy('estimate.sent', channel, ctx)` — DB-first resolver querying `notification_templates` with `.eq('scope','customer')`, reusing Phase 172's `renderTemplate()` for `{{var}}` interpolation and per-channel escaping, falling back to `buildCustomerCopy` on every miss/corruption case
- 13 unit tests (5 + 8) proving the built-in copy never leaks `{{`/`undefined`/`null`, and the resolver's DB-wins / fallback / never-throws contract for every failure mode called out in the plan

## Task Commits

Each task was committed atomically:

1. **Task 1: buildCustomerCopy() built-in fallback (TDD)** - `425101a6` (feat)
2. **Task 2: resolveCustomerCopy() DB-first resolver (TDD)** - `470a477a` (feat)

**Plan metadata:** (this commit)

_Note: implementation and tests were authored together per task since the plan's interfaces block fully specified both the RED test cases and the exact behavior; both were verified RED-then-GREEN before commit (Task 2's test suite was run against the not-yet-existing resolver module and failed with "Failed to resolve import" before the implementation file was added)._

## Files Created/Modified
- `lib/notifications/customer-copy.ts` - `CustomerEventType`/`CustomerCopyContext`/`CustomerCopy` types + `buildCustomerCopy()`, one case (`'estimate.sent'`), exhaustive-switch guarded
- `lib/notifications/customer-template-resolver.ts` - `resolveCustomerCopy()`, DB-first against `scope='customer'`, reuses `renderTemplate()`, falls back to `buildCustomerCopy()`
- `tests/unit/notifications/customer-copy.test.ts` - 5 cases: sms/email non-empty output, no leaked tokens/undefined/null, clientName-present vs absent greeting
- `tests/unit/notifications/customer-template-resolver.test.ts` - 8 cases: DB-wins-over-fallback, no-row, null/empty body, empty-after-render, thrown error (with `console.warn`), sms text-escaping, email html-escaping, null service client (no `.from()` call)

## Decisions Made
- Kept `customer-copy.ts`/`customer-template-resolver.ts` fully separate from `copy.ts`/`template-resolver.ts` (Rule: plan's explicit architectural boundary, not a deviation) — avoids any risk of destabilizing the tenant-scoped code path the sibling 174-04 executor is concurrently editing (`lib/notifications/template-resolver.ts`), and avoids widening `EventType`'s switch-exhaustive tenant functions for an unrelated concern.
- No `title` field in `CustomerCopy`/`resolveCustomerCopy` — customer channels are email (subject) and sms (body only), never in_app, so there is no tenant-resolver-style title/in_app rendering path to mirror.

## Deviations from Plan

None - plan executed exactly as written. Both new files, both test files, and both task commits match the plan's file list, interfaces, and behavior spec exactly.

## Issues Encountered

None. The plan's interfaces block was explicit enough that no ambiguity arose; the only care taken was to avoid touching `lib/notifications/template-resolver.ts` (confirmed via `git status` before every `git add` — only this plan's own new files were ever staged, never the sibling 174-04 executor's concurrent edits to `template-resolver.ts`, `customer-send-gate.ts`, `dispatch.ts`, etc.).

## Next Phase Readiness
`resolveCustomerCopy()` is ready for 177-06's send orchestrator and 177-07's legacy-route migration (the plan's explicitly named first real caller) to import and call directly for `'estimate.sent'` email/sms content — DB-editable today via direct `notification_templates` inserts with `scope='customer'`, with a future admin-editor increment able to write those rows without any resolver changes.

---
*Phase: 177-end-customer-send-path*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 4 created files and both task commits (`425101a6`, `470a477a`) verified present.
