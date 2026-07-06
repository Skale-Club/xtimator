---
phase: 159-inbox-visual-redesign
plan: 01
subsystem: ui
tags: [tailwind, glassmorphism, avatar, react, admin-panel, vitest]

# Dependency graph
requires:
  - phase: 154-155 (v4.16 Admin Inbox Consolidation)
    provides: the two-pane conversation viewer (list + thread pane) at app/admin/inbox
provides:
  - lib/utils/avatar.ts - deterministic-color initials utility (getInitials, getAvatarColor, AVATAR_PALETTE)
  - Redesigned conversation-list rows (avatar, glass background, accent bar, unread dot)
  - Redesigned thread-pane header (matching avatar, glass background)
  - Glass-continuity between list pane and thread pane (shared --glass-bg-light)
  - Optional inbound-bubble glass polish in components/whatsapp/message-bubble.tsx
affects: [159-02 (Inbox Settings glass wrap), any future admin-panel surface needing a deterministic-color avatar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deterministic-color avatar: hashString(seed) % PALETTE.length, no Math.random/Date, same input always same color"
    - "Per-row glass treatment via lightweight utility classes (not nested Card) for scroll-list performance"
    - "3px before:-pseudo-element left accent bar, shared gradient token for both selected and unread states"

key-files:
  created:
    - lib/utils/avatar.ts
    - tests/unit/utils/avatar.test.ts
  modified:
    - app/admin/inbox/admin-whatsapp-client.tsx
    - components/whatsapp/message-bubble.tsx

key-decisions:
  - "Adjusted one test's sample-name pair (Maria Silva vs Joao Pedro -> Maria Silva vs Ana Costa) after discovering an incidental 8-slot hash-modulo collision between the original pair; the algorithm itself is correct and deterministic, only the test literal changed (Rule 1 - test data fix)"
  - "Applied the optional inbound-bubble glass polish (Task 3 step 3) rather than skipping it - the now-glass message-list background made the old flat bg-muted bubble look visually disconnected, and the glass/blur/border treatment reads cleanly against both light and dark admin themes"
  - "Kept both the colored unread dot AND the existing numeric Badge (per CONTEXT.md's discretion clause) rather than removing the count"

patterns-established:
  - "Deterministic per-identity color utility (lib/utils/avatar.ts) - reusable for any future feature needing consistent per-contact/per-entity coloring"

requirements-completed: [INBOX-05, INBOX-06, INBOX-07]

# Metrics
duration: 8min
completed: 2026-07-06
---

# Phase 159 Plan 01: Inbox Visual Redesign (List Rows + Thread Header) Summary

**Built a deterministic-color initials-avatar utility (hash-based, 8-color palette) and applied Xtimator's existing Phase-71 glassmorphism tokens to the Inbox's conversation-list rows and thread-pane header, replacing the flat `bg-muted`/plain-badge design the owner called "ficou péssimo."**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-06T04:49:00Z
- **Completed:** 2026-07-06T04:57:34Z
- **Tasks:** 3 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `lib/utils/avatar.ts` — new `getInitials`/`getAvatarColor`/`AVATAR_PALETTE` utility, 7/7 unit tests green, provably deterministic (no `Math.random`/`Date` usage) and provably varies across distinct seeds
- Conversation-list rows now show a deterministic-color initials `Avatar`, a glass-token background (selected + hover), a 3px left accent bar (gradient for selected/unread, transparent for read), and a colored unread dot alongside the existing numeric `Badge`
- Thread-pane header shows a matching deterministic-color `Avatar` for the same contact (identical seed expression as the corresponding list row: `contact_name || contact_phone`), with a glass background consistent with the list pane
- Inbound message bubbles received the optional glass treatment (`bg-muted` → `glass-bg` + `backdrop-blur` + `glass-border`) for visual continuity with the now-glass message-list container; the outbound gradient bubble was untouched
- Read-only invariant re-confirmed after every task: zero `sendMessage`/`reply`/`handleSend` matches in `admin-whatsapp-client.tsx`

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the deterministic-color avatar utility** — `9f0f4a9f` (test, RED) → `5672296d` (feat, GREEN)
2. **Task 2: Redesign conversation-list rows with avatar, glass surface, and rich unread signal** — `cc00b5f8` (feat)
3. **Task 3: Redesign the thread-pane header and apply optional inbound-bubble glass polish** — `306aaf25` (feat)

_TDD task (Task 1) has two commits: test → feat, per RED-GREEN flow. No refactor step was needed._

## Files Created/Modified
- `lib/utils/avatar.ts` — deterministic-color initials-avatar utility (`getInitials`, `getAvatarColor`, `AVATAR_PALETTE`)
- `tests/unit/utils/avatar.test.ts` — 7 unit tests covering initials edge cases + color determinism/variation/palette-membership
- `app/admin/inbox/admin-whatsapp-client.tsx` — list-row and thread-header JSX/className redesign; new imports (`Avatar`, `AvatarFallback`, `getInitials`, `getAvatarColor`); zero changes to selection/data-fetching logic
- `components/whatsapp/message-bubble.tsx` — inbound bubble class changed from `bg-muted text-foreground` to a glass treatment; outbound/failed branches untouched

## Decisions Made
- **Test sample-name fix (Rule 1):** the plan's suggested `getAvatarColor('Maria Silva') !== getAvatarColor('Joao Pedro')` sample pair happened to hash to the same palette slot (both `% 8 === 7`) with the specified djb2-style hash — a legitimate 1-in-8 collision, not an algorithm defect (5 other name pairs sampled hash to distinct slots). Swapped the second sample to `'Ana Costa'` (hashes to slot 0) so the "confirms the hash actually varies output" test assertion is meaningful. `getAvatarColor`'s implementation matches the plan's exact specified algorithm byte-for-byte.
- **Inbound-bubble glass polish applied, not skipped:** Task 3 step 3 was explicitly optional/discretionary. Applied it because the message-list container now carries `bg-[var(--glass-bg-light)]`, and leaving inbound bubbles on flat `bg-muted` would have created exactly the "jarring flat-vs-glass split" CONTEXT.md warned against. No contrast issues were found in code review (text-foreground remains readable against the light glass tint in both light/dark tokens).
- **Dot + Badge both kept:** per CONTEXT.md's discretion clause, the unread dot supplements rather than replaces the numeric Badge — informative count stays available while the dot dominates at-a-glance scanning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/test-data] Fixed incidental hash-collision in avatar-variation test**
- **Found during:** Task 1 (RED phase, first `vitest run`)
- **Issue:** The plan's suggested test used `getAvatarColor('Maria Silva')` vs `getAvatarColor('Joao Pedro')` to assert two distinct seeds produce different colors; both happen to hash to the same `% 8` slot (`bg-indigo-500`) under the specified hash function, causing a false test failure despite correct, working determinism.
- **Fix:** Verified via a quick hash dump across 7 sample names that the algorithm does vary output (5/6 pairs land on distinct slots); replaced the second sample name with `'Ana Costa'` (slot 0, distinct from `'Maria Silva'`'s slot 7).
- **Files modified:** `tests/unit/utils/avatar.test.ts`
- **Verification:** `npx vitest run tests/unit/utils/avatar.test.ts` — 7/7 passing
- **Committed in:** `5672296d` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 test-data/Rule 1)
**Impact on plan:** Zero impact on the shipped algorithm or acceptance criteria — the `getAvatarColor`/`getInitials` implementation matches the plan's specification exactly. Only a single test literal changed to avoid asserting on an incidental collision.

## Issues Encountered

- **Pre-existing `npx tsc --noEmit` failures in unrelated test files** (billing/whatsapp-handler/estimate test fixtures, several `TS1501` regex-flag errors) — confirmed via grep that none reference `admin-whatsapp-client`, `message-bubble`, or `avatar.ts`. Logged to `.planning/phases/159-inbox-visual-redesign/deferred-items.md` per the scope-boundary rule; not fixed (out of this plan's file scope).
- **e2e static-contract test failure found during the regression-gate check** (`loadAdminConversationThread contains no update/insert/delete calls` fails because the source file's own doc-comment contains the literal substring "revalidatePath", tripping a `.not.toMatch(/revalidatePath/)` assertion) — confirmed via `git log`/`git diff` that `lib/actions/admin-whatsapp.ts` has zero uncommitted changes and was last touched by unrelated historical commits; this file is not in this plan's `files_modified` list and was not touched by this plan. This is a pre-existing test/comment mismatch (the comment documents "no revalidatePath calls" but the regex matches the comment text itself), already independently flagged by the concurrently-running 159-02 plan in the same `deferred-items.md`. Not fixed here (out of scope; the failure is unrelated to any code this plan touched).
- Manual visual UAT (opening `/admin/inbox` in a browser, confirming avatar colors/glass surfaces/accent bars by eye) was deferred — the plan's own acceptance criteria label this "Manual visual check (defer to UI-checker-style review, not automatable)." A concurrent dev server was already running on port 9633 (shared with other concurrently-executing agents); restarting it risked disrupting those agents' work. Verified instead via: (1) exhaustive grep-based structural checks against every acceptance criterion, (2) full git diff review confirming only className/JSX/import changes, (3) a live HTTP request to the running dev server confirming the route compiles and serves 200/307 without runtime errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/utils/avatar.ts` is now available for reuse by Plan 159-02 (Inbox Settings glass wrap) or any future admin surface needing deterministic per-identity coloring.
- The list-row and thread-header visual redesign is complete and structurally verified; live browser UAT against seeded admin credentials is the only deferred verification step (same deferral pattern as prior Inbox milestones).
- The `revalidatePath`-comment-string e2e test false-positive (pre-existing, unrelated to both 159-01 and 159-02) should be triaged by whichever plan/phase owns `lib/actions/admin-whatsapp.ts` next — either reword the doc comment or make the test regex more precise (e.g. match `revalidatePath(` including the paren).

---
*Phase: 159-inbox-visual-redesign*
*Completed: 2026-07-06*

## Self-Check: PASSED

All created/modified files confirmed present on disk:
- `lib/utils/avatar.ts` — FOUND
- `tests/unit/utils/avatar.test.ts` — FOUND
- `app/admin/inbox/admin-whatsapp-client.tsx` — FOUND
- `components/whatsapp/message-bubble.tsx` — FOUND
- `.planning/phases/159-inbox-visual-redesign/159-01-SUMMARY.md` — FOUND
- `.planning/phases/159-inbox-visual-redesign/deferred-items.md` — FOUND

All task commit hashes confirmed present in git history:
- `9f0f4a9f` (Task 1 RED) — FOUND
- `5672296d` (Task 1 GREEN) — FOUND
- `cc00b5f8` (Task 2) — FOUND
- `306aaf25` (Task 3) — FOUND
