---
phase: 174-tenant-cutover-whatsapp-reenable
plan: 04
subsystem: notifications
tags: [notifications, dispatch, template-resolver, whatsapp, copy-context, vitest]

# Dependency graph
requires:
  - phase: 174-01
    provides: buildFullCopyContext(eventType, ctx) sparse-ctx default enrichment
  - phase: 174-02
    provides: metadata.email_copy consumer contract (EmailCopyMetadata) in the email digest
  - phase: 174-03
    provides: expectedVariableCount field on NotificationTemplate / getApprovedTemplateForEvent
provides:
  - notify() enriches copyContext once via buildFullCopyContext before any resolveNotificationCopy call
  - notify() resolves a DISTINCT email-channel copy (subject text-mode, body html-mode) and stashes it as metadata.email_copy
  - notify() resolves a DISTINCT sms-channel copy, falling back to `${title}: ${body}` on any miss/error
  - resolveNotificationCopy's title/subject rendering is decoupled from body's channel-driven mode (always text)
  - WhatsApp send-time guard: a resolved variable count mismatched against tpl.expectedVariableCount refuses the send and logs, never delivers garbled
affects: [174-05, 174-06, 174-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "notify()'s copyContext seam: compute buildFullCopyContext(eventType, ctx) ONCE per invocation, reuse across in_app/email/sms resolveNotificationCopy calls — never call it per-channel"
    - "Per-channel copy divergence: in_app/email/sms each get their own resolveNotificationCopy(scope, eventType, channel, ctx) call, each independently try/catch-guarded with a fallback to the caller-supplied or default value — never throws, never blocks a sibling channel"
    - "template-resolver.ts: title/subject ALWAYS renders in 'text' mode; only the BODY's mode is channel-driven (html for email, text otherwise) — a subject/title/label header is never an HTML-rendering context"
    - "WhatsApp send-time guard: compute variables once, compare .length against tpl.expectedVariableCount BEFORE inngest.send — refuse + console.warn on mismatch, proceed unchanged on match"

key-files:
  created: []
  modified:
    - lib/notifications/dispatch.ts
    - lib/notifications/template-resolver.ts
    - tests/unit/notifications/dispatch.test.ts
    - tests/unit/notifications/template-resolver.test.ts
    - tests/unit/notifications/whatsapp-channel.test.ts

key-decisions:
  - "Computed buildFullCopyContext(params.eventType, params.copyContext) exactly once per notify() call into a local fullCopyContext, reused for the in_app/email/sms resolution calls — avoids re-deriving defaults 3x and keeps the enrichment behavior consistent across channels."
  - "email_copy resolution is scoped inside the existing `if (channels.inApp) {...}` block (pre-existing coupling: the notifications row insert is the only place metadata gets written) — not restructured, per the plan's scope fence."
  - "template-resolver.ts's FLAG-3 fix is a single-line change: renderedTitle's mode argument is hardcoded to 'text' instead of the channel-driven `mode` variable; body's mode computation is untouched."
  - "WhatsApp variable-count guard computes `variables` once (outside the match/no-match branch) and reuses it in the inngest.send payload on the match path, avoiding a second call to tpl.variables()."

requirements-completed: [TNT-01, TNT-03]

# Metrics
duration: ~20min
completed: 2026-07-21
---

# Phase 174 Plan 04: dispatch.ts Choke-Point Wiring Summary

**Wired Wave-1's `buildFullCopyContext` and `expectedVariableCount` into `notify()`'s single shared resolution path — per-channel in_app/email/sms copy resolution (with a template-resolver title/subject text-mode fix) plus a WhatsApp send-time param-count guard.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completed
- **Files modified:** 5 (0 created)

## Accomplishments

- `resolveNotificationCopy` (`lib/notifications/template-resolver.ts`) now renders title/subject in `'text'` mode unconditionally — an email subject can no longer surface a literal `&amp;`; body's mode stays channel-driven (html for email), unchanged.
- `notify()` (`lib/notifications/dispatch.ts`) enriches `params.copyContext` via `buildFullCopyContext` exactly once per invocation, before any `resolveNotificationCopy` call — a sparse ctx (e.g. `{ amountUSD: undefined }`) can no longer render a blank field.
- `notify()` resolves a DISTINCT email-channel copy when `channels.email && params.userId` and stashes it as `metadata.email_copy = { subject, body }` on the notifications row insert — the first real production producer of the `EmailCopyMetadata` contract Plan 174-02's digest consumer already expects.
- `notify()` resolves a DISTINCT sms-channel copy for the SMS Inngest payload body, falling back to today's exact `` `${resolvedTitle}: ${resolvedBody}` `` format on any miss, error, or omitted `copyContext`.
- The WhatsApp branch now refuses and logs (`console.warn`) any send whose resolved `variables.length` doesn't match the approved template's `expectedVariableCount`, instead of delivering a garbled Meta template — verified as a structural no-op for the 5 static `REGISTRY` fallback entries and a real guard against a misconfigured DB-approved row.
- Every pre-existing test across `dispatch.test.ts`, `template-resolver.test.ts`, and `whatsapp-channel.test.ts` stays green; 9 new tests added proving the enrichment, per-channel resolution, and guard behaviors.

## Task Commits

Each task was committed atomically, scoped to only the files each task modified:

1. **Task 1: Per-channel copy resolution — template-resolver title/subject mode fix + buildFullCopyContext + email/sms resolution + metadata.email_copy** — content landed inside commit `cef9ced8` (see **Deviations** below for why the commit message/scope doesn't match this task cleanly)
2. **Task 2: WhatsApp expectedVariableCount guard (Pitfall 3)** — `6dcda7a9` (`feat(174-04): WhatsApp expectedVariableCount guard — refuse-and-log on param-count mismatch (TNT-03 / Pitfall 3)`)

## Files Created/Modified

- `lib/notifications/dispatch.ts` — `notify()`: `buildFullCopyContext` import + single enrichment call; email-copy resolution + `metadata.email_copy` stash inside the `inApp` insert block; sms-copy resolution replacing the hardcoded format string; WhatsApp `expectedVariableCount` guard around the existing `tpl.variables({...})` call
- `lib/notifications/template-resolver.ts` — `renderedTitle`'s mode argument hardcoded to `'text'` (FLAG-3 fix); body's mode computation untouched
- `tests/unit/notifications/dispatch.test.ts` — 7 new tests: sparse-ctx enrichment proof, email-channel second resolution + `metadata.email_copy` stash, `channels.email:false` no-op proof, sms-channel resolution + fallback-on-reject, WhatsApp variable-count mismatch refusal, `expectedVariableCount:0` dormant-schema refusal
- `tests/unit/notifications/template-resolver.test.ts` — 1 new test: email-channel subject renders text-mode while body stays html-escaped
- `tests/unit/notifications/whatsapp-channel.test.ts` — mock-shape migration (`expectedVariableCount: 2` added to both registry mocks) + 1 new mismatch-refusal test

## Decisions Made

- `fullCopyContext` is computed once and reused across all 3 resolver-backed channel calls (in_app/email/sms) — matches the plan's explicit "do NOT call buildFullCopyContext more than once per notify() invocation" instruction.
- The WhatsApp guard computes `variables` once and reuses it on the send path, rather than calling `tpl.variables(...)` a second time inside the `else` branch.
- No changes to `preferences.ts`, WhatsApp's copy SOURCE, or any of the 9 call sites — scope fence honored exactly as specified.

## Deviations from Plan

**Code:** None — plan executed exactly as written; both `<interfaces>` code blocks were applied verbatim (re-verified against the live files first, per each task's `read_first`).

### Process deviation (git-index race with a concurrent sibling executor — not a code deviation)

This wave ran alongside a concurrent GSD executor working Phase 177 plans in the same working tree. Task 1's changes were staged with a pathspec-scoped `git add` (per house rules) immediately after verification passed. Before the `git commit` for Task 1 could run, the sibling process staged its own Phase-177 files and committed — because git's index is a single shared file, its commit swept up my already-staged Task 1 files (`dispatch.ts`, `template-resolver.ts`, `dispatch.test.ts`, `template-resolver.test.ts`) along with its own (`customer-send-gate.ts`, `customer-send-gate.test.ts`), landing under the message `feat(177-01): symbol-harden SendPermit + widen assertSendAllowed for email` (`cef9ced8`) instead of a `feat(174-04)`-prefixed commit.

- **Verified, not rewritten:** per house rules ("do NOT push... atomic commit per task"), no destructive git operation was used to unwind this — `git show cef9ced8:<path>` was used to confirm all 4 of Task 1's files landed byte-for-byte as authored (diff stats matched exactly: `dispatch.ts` +63/-5 lines, `template-resolver.ts` +6/-5, both test files' new `it()` blocks present verbatim).
- **No functional impact:** the working tree was clean of my changes after the sweep (nothing lost), the full `tests/unit/notifications` suite (30 files, 296 tests) passed against the resulting HEAD, and `tsc --noEmit -p tsconfig.ci.json` was clean.
- **Task 2 was unaffected:** by re-checking `git status --short` immediately before staging (confirming only Task 2's 3 files were dirty) and committing without delay, Task 2 landed as a clean, correctly-scoped, correctly-prefixed commit (`6dcda7a9`).
- **Traceability note:** anyone auditing `cef9ced8` for TNT-01/174-04 changes should cross-reference this SUMMARY — the commit message describes only the 177-01 portion of that diff.

## Issues Encountered

- One authored test used a literal `&` inside template TEXT (not an interpolated value) expecting it to be HTML-escaped in `'html'` mode — `template-engine.ts`'s `renderTemplate` only escapes the *interpolated value*, never the surrounding template text (by design, documented in that file's header). Corrected the test fixture to place the ampersand inside the `ctx.clientName` value instead, so the html-vs-text divergence is actually observable. No production code was affected — this was a test-authoring correction caught before commit.
- `tests/unit/notifications/whatsapp-channel.test.ts` only calls `vi.clearAllMocks()` in `afterEach` (not `resetAllMocks`), so a `.mockResolvedValue(null)` set by an earlier test on `resolveOwnerPhone` persists across later tests that don't re-assert it. The new mismatch-guard test explicitly re-sets `resolveOwnerPhone.mockResolvedValue('+15551230000')` so it is order-independent, rather than relying on file test order.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `notify()`'s `copyContext` seam is now feature-complete for all 3 resolver-backed channels (in_app/email/sms). Wave 3 (Plans 174-05/06/07) can mechanically sweep the 9 call sites onto `copyContext` with zero risk of the sparse-ctx or double-escape traps — both are closed at this single choke point.
- `metadata.email_copy` is now a real production write; Plan 174-02's digest consumer (already shipped) can be exercised end-to-end once a Wave-3 call site opts in.
- The WhatsApp `expectedVariableCount` guard is live but structurally dormant for the 5 static `REGISTRY` entries — real WhatsApp dormancy still depends on the `whatsapp_opt_in_at` consent gate and Meta's template-approval gate (Plan 174-03's territory), not on this guard.

## Self-Check: PASSED

- FOUND: lib/notifications/dispatch.ts
- FOUND: lib/notifications/template-resolver.ts
- FOUND: lib/notifications/copy-context.ts
- FOUND: lib/notifications/whatsapp-registry.ts
- FOUND commit: cef9ced8 (contains Task 1's 4 files, verified via `git show cef9ced8:<path>`)
- FOUND commit: 6dcda7a9 (Task 2, correctly scoped and prefixed)
- `npx vitest run tests/unit/notifications` — 30 files, 296 tests passed
- `npx tsc --noEmit -p tsconfig.ci.json` — clean, no output

---
*Phase: 174-tenant-cutover-whatsapp-reenable*
*Completed: 2026-07-21*
