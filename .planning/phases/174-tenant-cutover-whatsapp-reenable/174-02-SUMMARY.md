---
phase: 174-tenant-cutover-whatsapp-reenable
plan: 02
subsystem: notifications
tags: [notifications, email, resend, escaping, tdd, inngest]

# Dependency graph
requires:
  - phase: 172-template-engine-foundation (plan 03)
    provides: "resolveNotificationCopy(scope, eventType, channel, ctx) — DB-first resolver whose html-mode body is pre-escaped by escapeHtmlValue; the source of the double-escape hazard this plan closes on the consumer side"
provides:
  - "DigestEmailItem.preEscaped?: boolean on lib/email/notification-emails.ts — governs BODY escaping ONLY; title/subject is always unconditionally escaped by renderItem, never gated by this flag"
  - "buildDigestItem(row, category): DigestEmailItem — exported pure mapping fn in lib/inngest/functions/notification-email-digest.ts, prefers row.metadata.email_copy (subject plain, body preEscaped:true) over row.title/row.body (preEscaped:false), defensive fallback on absent/malformed data, never throws"
affects: [174-04-tenant-cutover-whatsapp-reenable-dispatch-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Consumer-side contract built ahead of the producer (174-04): metadata.email_copy = { subject: string (TEXT-mode, plain), body: string (HTML-mode, pre-escaped) } — two different escaping modes on the same object, not a uniform pair"
    - "preEscaped flag scoped to a single field (body) rather than the whole item — title stays unconditionally escaped since the resolver guarantees it's always plain text"
    - "Pure mapping function (buildDigestItem) extracted from an inline items.map(...) callback specifically to make row→DigestEmailItem logic unit-testable without mocking Inngest's step machinery"

key-files:
  created:
    - tests/unit/inngest/notification-email-digest.test.ts
  modified:
    - lib/email/notification-emails.ts
    - tests/unit/notifications/email-digest.test.ts
    - lib/inngest/functions/notification-email-digest.ts

key-decisions:
  - "preEscaped governs BODY only, never title — matches the revised plan (plan-checker FLAG 3): an email subject header is never an HTML-rendering context, so metadata.email_copy.subject is always plain TEXT-mode content and must always be escapeHtml'd downstream exactly like row.title always was"
  - "buildDigestItem uses a defensive inline type guard (typeof === 'object' && !== null && typeof .subject === 'string' && typeof .body === 'string') rather than a schema library — mirrors this file's existing no-new-dependencies defensive style; malformed/partial email_copy (non-object, non-string subject, non-string body) falls back to row.title/row.body with preEscaped:false, never throws"
  - "buildDigestItem exported as a pure function and unit-tested directly (no Inngest step.run mocking) — mirrors the existing repo pattern (e.g. monthly-credit-grant.ts's runMonthlyCreditGrant) of extracting cron/event business logic for direct testability"

requirements-completed: [TNT-01]

# Metrics
duration: 5min
completed: 2026-07-21
---

# Phase 174 Plan 02: Email Digest Double-Escape Fix (Consumer Side) Summary

**Body-only `preEscaped` flag on `DigestEmailItem` plus a new `buildDigestItem()` pure mapping function make the notification digest email pipeline safe to consume resolver-sourced, already-HTML-escaped body content without corrupting entities — while `title`/`subject` stays unconditionally escaped since the resolver always renders it as plain text.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-21T22:52:00-04:00 (approx, first test run)
- **Completed:** 2026-07-21T22:56:06-04:00
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `DigestEmailItem` gained an optional `preEscaped?: boolean` field that governs BODY escaping only; `renderItem` skips `escapeHtml(item.body)` when `preEscaped` is true, eliminating the `&amp;` → `&amp;amp;` double-escape corruption for resolver-sourced content
- `title` remains unconditionally run through `escapeHtml()` in `renderItem` with zero bypass — consistent with the revised contract that `resolveNotificationCopy` always renders title/subject in TEXT mode (Plan 174-04), never HTML mode
- New exported `buildDigestItem(row, category): DigestEmailItem` in the digest worker prefers `row.metadata.email_copy` (`subject → title` plain, `body → body` with `preEscaped: true`) when present and structurally valid, and safely falls back to `row.title`/`row.body` (`preEscaped: false`) — today's exact behavior — on absence or malformation
- 8 new tests added across the two files (4 in `email-digest.test.ts` proving no-double-escape / regression / title-always-escaped / grouped-per-item behavior; 8 in the new `notification-email-digest.test.ts` proving the mapping contract, defensive fallbacks, and never-throws guarantee) — 17/17 tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: notification-emails.ts — preEscaped flag (body only) prevents double-escaping** - `c41cd9fc` (feat)
2. **Task 2: notification-email-digest.ts — prefer metadata.email_copy, body-only preEscaped threading** - `a03a5e2e` (feat)

**Correction commit:** `f5a0490e` (chore) — see Deviations below; not a plan task, a concurrency-safety fix.

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/email/notification-emails.ts` - `DigestEmailItem.preEscaped?: boolean` added; `renderItem`'s `bodyHtml` now conditional on the flag; `titleHtml` unchanged (always escaped)
- `tests/unit/notifications/email-digest.test.ts` - 4 new `it()` blocks appended to the existing describe block: no-double-escape on `preEscaped:true` body, regression proof for `preEscaped:false`/omitted, title-always-escaped-regardless-of-body-flag, and per-item `preEscaped` in a grouped multi-item digest
- `lib/inngest/functions/notification-email-digest.ts` - new exported `buildDigestItem(row, category)` pure mapping function; digest-send loop's `items: items.map((i) => ({...}))` inline object replaced with `items: items.map((i) => buildDigestItem(i, cat))`
- `tests/unit/inngest/notification-email-digest.test.ts` (new) - 8 tests covering: valid `metadata.email_copy` preference, null/`{}`/malformed (non-object, non-string subject, non-string body) fallback paths, never-throws guarantee, and a contract-shape assertion tying `buildDigestItem`'s output to Task 1's `renderItem` behavior

## Decisions Made
- `preEscaped` is scoped to `body` only, per the plan's FLAG-3 revision — no conditional was added to the `titleHtml` line; this was verified explicitly by a dedicated test (`preEscaped: true` item with an unescaped `&` in `title` still renders `&amp;` in the HTML heading)
- `buildDigestItem`'s type guard checks `typeof emailCopy === 'object' && emailCopy !== null && typeof subject === 'string' && typeof body === 'string'` before trusting the shape — malformed metadata (string instead of object, non-string subject, non-string body) all fall back to the pre-174 `row.title`/`row.body` path, never throws
- New test file mirrors the existing repo convention (see `tests/unit/inngest/monthly-credit-grant-job.test.ts`) of testing an extracted pure function directly rather than mocking `step.run`/Inngest orchestration

## Deviations from Plan

### Auto-fixed Issues

**1. [Concurrency safety — not a Rule 1-4 code deviation] Corrected a cross-plan file accidentally swept into the Task 2 commit**
- **Found during:** Task 2 commit, immediately after `git commit`
- **Issue:** A concurrently running sibling plan (173-02/174-01/174-03 all active per the execution context) staged its own file (`tests/unit/admin/notification-templates-panel.test.tsx`) via its own `git add` in the narrow window between this plan's scoped `git add <2 files>` and `git commit -m ...`. Because `git commit -m` (without a pathspec) commits everything currently staged, that unrelated file was swept into commit `a03a5e2e` alongside this plan's two intended files.
- **Fix:** Ran `git rm --cached tests/unit/admin/notification-templates-panel.test.tsx` (working-tree content untouched, file returned to the sibling's expected untracked state) and committed the correction as a new, non-destructive commit (`f5a0490e`) — no `git commit --amend`, no history rewrite, so no risk to any sibling process that may have already based work on `a03a5e2e`'s hash.
- **Files modified:** none of this plan's files were affected in content; only the git index entry for the sibling's file was reverted
- **Verification:** `git show --stat HEAD` on `f5a0490e` confirms only the sibling's file was removed from tracking; `git status --short` confirms it is back to `??` (untracked, content intact on disk) for the owning plan to commit itself; this plan's own files (`lib/inngest/functions/notification-email-digest.ts`, `tests/unit/inngest/notification-email-digest.test.ts`) remain correctly committed in `a03a5e2e`
- **Committed in:** `f5a0490e`

---

**Total deviations:** 1 (concurrency-safety correction, not a code/behavior deviation from the plan's contract)
**Impact on plan:** None on the plan's actual deliverable — `preEscaped` flag and `buildDigestItem` are implemented exactly as specified. The correction was a git-hygiene fix necessitated by heavy sibling concurrency (173-02, 174-01, 174-03 all active simultaneously), not a change to plan scope or behavior.

## Issues Encountered
- Heavy concurrent git activity from sibling plans caused the above staging race. Going forward within this execution, `git add` was immediately followed by `git status --short` verification before every commit to catch any further races before they land (none occurred on subsequent — there were none — commits in this plan, as Task 2 was the last).

## User Setup Required
None - no external service configuration required. This plan touches only application code and unit tests; no env vars, dashboard config, or migrations.

## Next Phase Readiness
- The consumer-side contract (`DigestEmailItem.preEscaped` body-only, `buildDigestItem` preferring `metadata.email_copy`) is complete and independently tested — Plan 174-04 (producer side, Wave 2) can now populate `notifications.metadata.email_copy` via `dispatch.ts`/`resolveNotificationCopy` and this plan's digest worker will correctly consume it without any further changes here.
- No blockers. `dispatch.ts` and `template-resolver.ts` were correctly left untouched per this plan's scope fence — that is 174-04's responsibility, including the title-mode fix this plan's contract assumes (`resolveNotificationCopy` always rendering title/subject in TEXT mode).

---
*Phase: 174-tenant-cutover-whatsapp-reenable*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: lib/email/notification-emails.ts
- FOUND: tests/unit/notifications/email-digest.test.ts
- FOUND: lib/inngest/functions/notification-email-digest.ts
- FOUND: tests/unit/inngest/notification-email-digest.test.ts
- FOUND: .planning/phases/174-tenant-cutover-whatsapp-reenable/174-02-SUMMARY.md
- FOUND: commit c41cd9fc (Task 1)
- FOUND: commit a03a5e2e (Task 2)
- FOUND: commit f5a0490e (concurrency-safety correction)
