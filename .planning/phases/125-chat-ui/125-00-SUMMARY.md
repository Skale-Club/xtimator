---
phase: 125-chat-ui
plan: 00
subsystem: ui
tags: [ai-sdk, useChat, vercel-ai, vitest, server-action, multimodal, chat]

# Dependency graph
requires:
  - phase: 124-chat-backend
    provides: "/api/chat streaming route (toUIMessageStreamResponse + full messages-array contract) + lib/chat/tools.ts (8 tools)"
  - phase: 123-chat-persistence
    provides: "lib/queries/chat.ts ChatMessageRow + listConversations/getConversationWithMessages history helpers"
  - phase: 122-channel-neutral-extraction
    provides: "lib/agent-tools normalizeInput (audio/photo -> text)"
provides:
  - "@ai-sdk/react@3.0.211 installed (its bundled ai is 6.0.209 — lockstep with the installed ai@6.0.209), the useChat hook for Plans 125-01/02"
  - "lib/chat/history-mapper.ts toUIMessages — pure ChatMessageRow[] -> UIMessage[] seed for useChat (CHATUI-02)"
  - "lib/actions/chat.ts normalizeChatInput — owner-scoped server action wrapping normalizeInput for multimodal -> text (CHATUI-03)"
  - "8 chat test files on disk: 3 GREEN (scope-fence, history-mapper, normalize-action) + 5 RED scaffolds (chat-message/composer/thread/sidebar/estimate-card) for Plans 01/02 to turn green"
  - "Static scope fence asserting app/api/chat/route.ts + lib/chat/tools.ts stay UI-untouched"
affects: [125-01-PLAN, 125-02-PLAN, chat-ui, useChat, estimate-card, multimodal]

# Tech tracking
tech-stack:
  added: ["@ai-sdk/react@3.0.211 (exact pin; bundles ai@6.0.209)"]
  patterns:
    - "Wave-0 Nyquist scaffolds: every requirement gets a test file on disk before its UI plan runs (component-dependent assertions as it.todo until the component lands)"
    - "Static-source scope fence (readFileSync + assert invariants) to freeze the Phase-124 backend against UI-only edits"

key-files:
  created:
    - lib/chat/history-mapper.ts
    - lib/actions/chat.ts
    - tests/unit/chat/chat-ui-scope.test.ts
    - tests/unit/chat/history-mapper.test.ts
    - tests/unit/chat/normalize-action.test.ts
    - tests/unit/chat/chat-message.test.tsx
    - tests/unit/chat/chat-composer.test.tsx
    - tests/unit/chat/chat-thread.test.tsx
    - tests/unit/chat/chat-sidebar.test.tsx
    - tests/unit/chat/estimate-card.test.tsx
  modified:
    - package.json
    - package-lock.json
    - .planning/phases/125-chat-ui/125-VALIDATION.md

key-decisions:
  - "Pinned @ai-sdk/react@3.0.211 (not the nonexistent 6.0.209): @ai-sdk/react is on an independent 3.x line; 3.0.211 is the `latest` dist-tag and declares dependencies.ai === 6.0.209 — exact lockstep with the installed ai@6.0.209"
  - "normalizeChatInput mirrors app/api/chat/route.ts auth (createClient().auth.getClaims() + getActiveCompanyId()) rather than the plan's getAuthClaims helper, which does not exist in this codebase"
  - "Component scaffolds kept importable via one contract-anchor expect + it.todo placeholders; chat-thread static-source assertions defer to 125-01 (file does not exist yet)"

patterns-established:
  - "Pattern: multimodal normalize as a thin owner-scoped server action over the neutral normalizeInput — NO credit code (CHATMETER-01 inherited via ingestMultimodal), NEVER throws"
  - "Pattern: history seed mapper filters to user/assistant rows only; tool calls travel as PARTS on the assistant message (Open Q2)"

requirements-completed: [CHATUI-01, CHATUI-02, CHATUI-03, CHATUI-04]

# Metrics
duration: 9min
completed: 2026-06-25
---

# Phase 125 Plan 00: Chat UI Wave-0 Foundation Summary

**Installed `@ai-sdk/react@3.0.211` (lockstep `ai@6.0.209`), shipped the pure `toUIMessages` history-seed mapper and the owner-scoped `normalizeChatInput` multimodal server action, and laid down all 8 CHATUI test files (3 GREEN + 5 RED scaffolds) so the phase is `nyquist_compliant: true`.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-25T08:45:49Z
- **Completed:** 2026-06-25T08:55:23Z
- **Tasks:** 3
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments
- The single new dependency is pinned and installed lockstep with `ai@6.0.209` — and the lockstep was re-verified against the registry after the plan's assumed `6.0.209` number turned out not to exist for this package.
- `toUIMessages` and `normalizeChatInput` exist, are tested GREEN, and are ready for Plans 01/02 to consume against pinned types.
- Every CHATUI requirement has a test file on disk; `125-VALIDATION.md` flipped to `nyquist_compliant: true` + `wave_0_complete: true` so no downstream task carries a MISSING verify.
- A static scope fence locks `app/api/chat/route.ts` (`toUIMessageStreamResponse` + `originalMessages: messages`) and `lib/chat/tools.ts` (`buildChatTools`) against UI edits.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @ai-sdk/react + scope-fence test** - `89dc791e` (chore)
2. **Task 2: history-mapper (ChatMessageRow[] -> UIMessage[]) + tests** - `109d0393` (feat, TDD RED+GREEN in one commit)
3. **Task 3: normalizeChatInput action + tests + RED scaffolds + validation** - `2d10516c` (feat, TDD RED+GREEN)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) — see final docs commit.

## Files Created/Modified
- `lib/chat/history-mapper.ts` - Pure `toUIMessages(rows)` mapper: order-preserving, user/assistant only, parts verbatim, defensive non-array → []
- `lib/actions/chat.ts` - `'use server'` `normalizeChatInput`: owner auth + active-company gate, audio Blob reconstruction, photo passthrough, never throws, no credit code
- `tests/unit/chat/chat-ui-scope.test.ts` - Static scope fence (GREEN)
- `tests/unit/chat/history-mapper.test.ts` - Mapper unit tests (GREEN)
- `tests/unit/chat/normalize-action.test.ts` - Server action unit tests (GREEN)
- `tests/unit/chat/{chat-message,chat-composer,chat-thread,chat-sidebar,estimate-card}.test.tsx` - RED scaffolds (contract-anchor expect + it.todo)
- `package.json` / `package-lock.json` - `@ai-sdk/react@3.0.211` exact pin
- `.planning/phases/125-chat-ui/125-VALIDATION.md` - `nyquist_compliant: true`, `wave_0_complete: true`, Wave-0 boxes checked

## Decisions Made
- **Version pin corrected to `@ai-sdk/react@3.0.211`** — the plan/research assumed `@ai-sdk/react@6.0.209`, but that version returns 404 on the registry; `@ai-sdk/react` versions independently (its `latest` is `3.0.211`, `ai-v6` dist-tag is `3.0.134`). `3.0.211` declares `dependencies.ai === "6.0.209"`, so it is the exact lockstep with the installed `ai@6.0.209` (the research's own §Standard Stack already noted `3.0.211` also depends on `ai@6.0.209`).
- **Auth pattern follows the real route**, not the plan's `getAuthClaims` helper (which does not exist) — `createClient().auth.getClaims()` → `claims.sub`, then `getActiveCompanyId()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned @ai-sdk/react@3.0.211 instead of the nonexistent 6.0.209**
- **Found during:** Task 1 (dependency install)
- **Issue:** `npm view @ai-sdk/react@6.0.209` → 404; the package has no `6.0.209` (it versions on an independent 3.x line). The install would have failed.
- **Fix:** Verified the lockstep against the registry — `@ai-sdk/react@3.0.211` (the `latest` dist-tag) declares `dependencies.ai === "6.0.209"`. Installed it with `--save-exact`. Confirmed `node -e` resolves `ai: 6.0.209 | @ai-sdk/react: 3.0.211`.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm ls @ai-sdk/react` → `3.0.211`; bundled ai resolves to `6.0.209`; scope-fence test green.
- **Committed in:** `89dc791e` (Task 1 commit)

**2. [Rule 3 - Blocking] Used createClient().auth.getClaims() instead of the plan's getAuthClaims helper**
- **Found during:** Task 3 (normalizeChatInput)
- **Issue:** The plan's interface block imports `getAuthClaims` from `@/lib/queries/auth`; that function does not exist in the codebase. `app/api/chat/route.ts` (the posture the action mirrors) uses `createClient().auth.getClaims()`.
- **Fix:** The server action authenticates with `createClient().auth.getClaims()` → `claimsData?.claims?.sub`, matching the route exactly. Tests mock `@/lib/supabase/server` accordingly.
- **Files modified:** lib/actions/chat.ts, tests/unit/chat/normalize-action.test.ts
- **Verification:** normalize-action test green (unauthorized / no_active_company gates + forwarding).
- **Committed in:** `2d10516c` (Task 3 commit)

**3. [Rule 1 - Bug] Fixed vi.mock hoisting in normalize-action test**
- **Found during:** Task 3 (RED→GREEN)
- **Issue:** Top-level mock vars referenced inside `vi.mock` factories threw `Cannot access ... before initialization` (vitest hoists `vi.mock` above the file).
- **Fix:** Wrapped the three mock fns in `vi.hoisted(() => ({ ... }))`.
- **Files modified:** tests/unit/chat/normalize-action.test.ts
- **Verification:** test suite green (5/5).
- **Committed in:** `2d10516c` (Task 3 commit)

**4. [Rule 1 - Bug] Reworded a doc comment so the no-credit-code gate is unambiguous**
- **Found during:** Task 3 (acceptance check)
- **Issue:** A comment in `lib/actions/chat.ts` contained the literal word "debits" while explaining the file adds NO credit code — a naive `grep debit|grant|consume|ledger` gate would false-positive.
- **Fix:** Reworded "already debits ... re-debiting" → "already accounts for ... re-accounting". No functional change; the file still contains zero credit calls.
- **Files modified:** lib/actions/chat.ts
- **Verification:** `grep -niE "debit|grant|consume|ledger" lib/actions/chat.ts` → none; test still green.
- **Committed in:** `2d10516c` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug)
**Impact on plan:** All necessary for correctness — the planned dep version and auth helper did not exist; both were resolved to the real lockstep dep and the real route auth pattern. No scope creep; backend stays frozen.

## Issues Encountered
- During an overall tsc verification I ran `git checkout 28663ecd -- .` intending a no-op; it instead reverted the working-tree `125-VALIDATION.md` + `package.json`/`package-lock.json` to the prior commit (staged). All three HEAD commits were already correct; I restored the working tree to HEAD (`git checkout HEAD -- ...`), confirming the `@ai-sdk/react` pin and the `nyquist_compliant: true` frontmatter remained intact. No committed state was affected.
- `tsc --noEmit` reports 6 pre-existing errors in unrelated test files (refine-shared-prompt, observability, step-runner, generate-estimate-job) — none in chat/this plan's files. Out of scope (scope boundary); logged to `deferred-items.md`.

## Known Stubs
The 5 component test files (`chat-message`, `chat-composer`, `chat-thread`, `chat-sidebar`, `estimate-card`) are intentional RED Wave-0 scaffolds: each has one real contract-anchor `expect` plus `it.todo` placeholders for the behaviors Plans 125-01/02 build. This is by design (Nyquist Wave 0) — the owning plans turn them green; not a goal-blocking stub for THIS plan, whose goal is the dep + the two primitives + the scaffolds.

## User Setup Required
None - no external service configuration required (one npm dep, no new secret, no migration).

## Next Phase Readiness
- Plans 125-01 (message stream + composer + thread) and 125-02 (sidebar + estimate card) can execute against pinned types (`UIMessage` from `ai`, `useChat` from `@ai-sdk/react@3.0.211`), the tested `toUIMessages` seed, and the tested `normalizeChatInput` action — and against existing automated verifies (the RED scaffolds).
- No blockers. The backend (124) is fenced; the UI plans must NOT touch `app/api/chat/route.ts` or `lib/chat/tools.ts` (the scope-fence test enforces this).

---
*Phase: 125-chat-ui*
*Completed: 2026-06-25*

## Self-Check: PASSED
- All 11 created files verified on disk (FOUND).
- All 3 task commits verified in git history (89dc791e, 109d0393, 2d10516c).
