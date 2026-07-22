---
phase: 173-super-admin-template-editor
plan: 02
subsystem: notifications
tags: [admin-panel, react, radix-tabs, rtl-testing, server-actions, glassmorphism]

# Dependency graph
requires:
  - phase: 173-super-admin-template-editor (plan 01)
    provides: TENANT_TEMPLATE_CATALOG/EDITABLE_CHANNELS/getEventVariableCatalog (template-catalog.ts), SAMPLE_COPY_CONTEXT (sample-context.ts), validateTemplateVariables (template-validation.ts), listNotificationTemplates/saveNotificationTemplate/sendTestNotification (admin-notification-templates.ts server actions)
provides:
  - "/admin/notifications route (requireAdmin-gated Notification Center page)"
  - "NotificationTemplatesPanel: Tenant/End Customer audience tabs, 17-event category nav (Estimates/Billing/System/Internal), In-app/Email/SMS channel tabs, keyed-remount editor mounting"
  - "NotificationTemplateEditor: event-scoped variable chips, live renderTemplate() preview, client-side unknown-variable gate, Save + 3-target (Email/SMS/Telegram) test-send on in-progress form state"
  - "admin-nav.tsx 'Notifications' sidebar entry (Bell icon)"
affects: [174-tenant-cutover-whatsapp-reenable, 177-end-customer-send-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Editor mounted with key={`${eventType}:${channel}`} by its parent so React remounts (not prop-updates) on selection change — local form state can never stale-merge across two different templates; verified in RTL via an uncontrolled-input DOM-reset probe rather than trusting the React key contract untested"
    - "Radix TabsTrigger activates on `mousedown`, not `click` — RTL interaction tests against Tabs.Trigger must use fireEvent.mouseDown({ button: 0 }), not fireEvent.click (plain <button> nav items, e.g. the event list, are unaffected and use fireEvent.click as usual)"
    - "Client-safe modules from 173-01 (template-catalog.ts, sample-context.ts, template-validation.ts) imported directly into 'use client' components for zero-round-trip live preview + validation feedback; 'use server' action module (admin-notification-templates.ts) imported for its value exports (Server Actions) exactly like whatsapp-templates-panel.tsx's createTemplate/submitTemplateToMeta"

key-files:
  created:
    - app/admin/notifications/page.tsx
    - components/admin/notification-templates-panel.tsx
    - components/admin/notification-template-editor.tsx
    - tests/unit/admin/notification-template-editor.test.tsx
    - tests/unit/admin/notification-templates-panel.test.tsx
  modified:
    - components/admin/admin-nav.tsx

key-decisions:
  - "Seed-prefill for the 34 (event x channel) combinations with no DB row yet: body defaults to EVENT_TEMPLATE_SEED[eventType].body, title defaults to the seed title when channel==='in_app', subject defaults to the seed title when channel==='email' — gives the admin a realistic starting draft instead of a blank textarea. All defaults are computed via lazy useState initializers (not useEffect), which only run once per mounted instance — safe specifically because the parent remounts the editor by key on every selection change."
  - "Test-send targets (email/sms/telegram) are independent of the row's own channel — an admin editing an in_app row can still test-send it via email/SMS/Telegram to preview how the copy reads elsewhere. Matches the plan's explicit scope_fence note (not a bug)."
  - "SMS test-send phone number is local component state only (never persisted, never sent to saveNotificationTemplate) — short-circuits with a toast (no dispatch) when empty, verified by RTL asserting sendTestNotification is never called in that case."
  - "Panel's category-group DOM nodes carry data-testid={`category-group-${category}`} purely to make the WARNING-2 RTL coverage precise (assert group membership + exact button count per category) without over-coupling the test to incidental class names; no visual/behavioral effect."
  - "WARNING-2 (Opus plan-check hardening, adopted as extra task work): added tests/unit/admin/notification-templates-panel.test.tsx (not in the plan's file list) covering the panel's own grouping/selection/remount behavior, plus extended the editor test file with SMS + Telegram test-send assertions beyond the plan's Email-only case."
  - "Task 3 (checkpoint:human-verify) auto-approved per standing project preference (no-checkpoint-interruptions) — logged below instead of pausing for manual click-through; the automated RTL suites (13 new tests across both components) are what back that approval."

patterns-established:
  - "Pattern: any future admin editor mounted per-selection-key should seed its local state via lazy useState initializers (not useEffect+setState), and its RTL test should prove the remount with a DOM-identity probe (uncontrolled input default value), not just assert the final prop values look right."
  - "Pattern: RTL tests against components/ui/tabs.tsx's Radix-backed TabsTrigger must fire mousedown, not click."

requirements-completed: [TMPL-02, TMPL-03, TMPL-04, TMPL-05]

# Metrics
duration: 30min
completed: 2026-07-21
---

# Phase 173 Plan 02: Notification Center Admin UI Summary

**`/admin/notifications` — a two-pane browse/edit UI (17 tenant events x 3 channels) with event-scoped variable chips, a live `renderTemplate()` preview against pinned sample data, a client-side unknown-variable gate backed by 173-01's server validation, and 3-target (Email/SMS/Telegram) test-send on the in-progress draft.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 2 plan tasks (Task 3 checkpoint auto-approved) + 1 additional test-only task (WARNING-2)
- **Files created:** 5 (3 component/page, 2 test)
- **Files modified:** 1 (admin-nav.tsx)

## Accomplishments

- **Notification Center page + panel (Task 1).** `app/admin/notifications/page.tsx` is `requireAdmin()`-gated first (the service-client read that follows bypasses RLS, so this is the real access control), fetches `listNotificationTemplates('tenant')` server-side, and renders `NotificationTemplatesPanel`. The panel shows Tenant/End Customer audience tabs (`Card variant="glass"`, matching `whatsapp-templates-panel.tsx` conventions); the Tenant view groups all 17 `TENANT_TEMPLATE_CATALOG` events into 4 category sections (Estimates/Billing/System/Internal — not delivered to tenants) in a left nav card, with In-app/Email/SMS channel tabs driving a keyed `NotificationTemplateEditor` on the right. The End Customer tab is a static empty-state Card with no fetch and no fake catalog, per the scope fence.
- **Template editor (Task 2, TDD).** `NotificationTemplateEditor` renders event-scoped variable chips (`getEventVariableCatalog`) — zero chips + an explanatory note for `admin.bonus_credits_granted` (CREDITUI-04 guard holds in the live editor, not just the server). A `useMemo`-recomputed `validateTemplateVariables` call gates the Save button and shows a named inline error before any server round trip. The live preview pane runs real `renderTemplate()` against `SAMPLE_COPY_CONTEXT[eventType]`, matching the channel's escaping mode (`html` for email via `dangerouslySetInnerHTML`, `text`/`<pre>` for in_app/sms). Save and all three test-send buttons (Email/SMS/Telegram) always dispatch the CURRENT in-progress field values, not the last-saved row; the SMS button additionally requires a local (non-persisted) phone number and short-circuits with a toast if empty.
- **Sidebar entry.** `admin-nav.tsx` gained a `Bell`-icon "Notifications" link in `BOTTOM_ITEMS`, positioned before Integrations.
- **WARNING-2 hardening (extra task work, adopted per plan-check instructions).** Added `tests/unit/admin/notification-templates-panel.test.tsx` (not in the plan's file list) proving: (1) all 17 tenant events land in exactly the 4 category groups with the correct membership and count per group; (2) selecting a different (event, channel) remounts the editor with fresh props — proven via an uncontrolled-input DOM-reset probe (a stale-typed value in the mocked editor is discarded on selection change, which only happens on a true unmount+mount, not a props-only update); (3) the End Customer tab shows the exact static empty-state string with no editor mounted and no category groups rendered. Also extended `notification-template-editor.test.tsx` with SMS short-circuit + SMS/Telegram dispatch assertions beyond the plan's Email-only case.
- **Task 3 (human-verify checkpoint) auto-approved.** Per project standing preference (no-checkpoint-interruptions), the manual click-through in `how-to-verify` was not run interactively. See "Checkpoint Outcome" below.

## Task Commits

Each task was committed atomically (pathspec-scoped `git add`/`git commit` throughout — sibling GSD agents were active concurrently in the same working tree; see "Issues Encountered"):

1. **Task 1: Notification Center page + browse panel** - `ef5a9e45` (feat)
2. **Task 2 (TDD): template editor — chips, preview, validation gate, save + test-send** - `708878b6` (feat, includes the RED test file + GREEN implementation in one commit per the plan's own `<action>` instruction)
3. **Extra task (WARNING-2): Panel RTL coverage** - `12d529ad` (test)

_Task 2 was written test-first (RED: component didn't exist, import failed) then implemented to GREEN; the plan's `<action>` text specifies a single combined commit for this task (not separate RED/GREEN commits), which was followed here._

## Files Created/Modified

- `app/admin/notifications/page.tsx` - requireAdmin-gated page, fetches `listNotificationTemplates('tenant')`, renders the panel
- `components/admin/notification-templates-panel.tsx` - audience tabs, category-grouped event nav (`data-testid="category-group-*"`), channel tabs, keyed editor mount, `router.refresh()` on save
- `components/admin/notification-template-editor.tsx` - per-(event,channel) form: chips, live preview, validation gate, Save, 3-target test-send
- `components/admin/admin-nav.tsx` - added `Bell` import + `/admin/notifications` entry to `BOTTOM_ITEMS`
- `tests/unit/admin/notification-template-editor.test.tsx` - 10 RTL cases (plan's 7 + WARNING-2's SMS short-circuit/dispatch + Telegram dispatch)
- `tests/unit/admin/notification-templates-panel.test.tsx` - 3 RTL cases (WARNING-2, extra task work): category grouping, remount-by-key, End Customer empty state

## Decisions Made

See `key-decisions` in frontmatter — seed-prefill defaults, test-send target independence from row channel, local-only SMS phone state, `data-testid` category grouping for test precision, and the WARNING-2/Task-3 handling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getByText` ambiguity between the body textarea's rendered value and the inline error message**
- **Found during:** Task 2, writing the "unknown variable" RTL test
- **Issue:** React mirrors a controlled `<textarea>`'s `value` into its DOM text content, so `screen.getByText(/unknownVar/)` matched BOTH the textarea and the destructive-colored error `<p>`, throwing a multiple-elements error.
- **Fix:** Added `data-testid="tpl-body-error"` to the error paragraph in `notification-template-editor.tsx` and queried it directly via `getByTestId(...).textContent`.
- **Files modified:** `components/admin/notification-template-editor.tsx`, `tests/unit/admin/notification-template-editor.test.tsx`
- **Verification:** full editor suite green (10/10).
- **Committed in:** `708878b6` (Task 2 commit)

**2. [Rule 3 - Blocking] Radix `TabsTrigger` activates on `mousedown`, not `click`**
- **Found during:** extra WARNING-2 panel test, the "End Customer" tab-switch case
- **Issue:** `fireEvent.click(screen.getByText('End Customer'))` never switched the active tab — `@radix-ui/react-tabs`'s `TabsTrigger` wires activation to `onMouseDown`, and `fireEvent.click` alone does not dispatch a `mousedown` event.
- **Fix:** Switched to `fireEvent.mouseDown(el, { button: 0 })` for the audience-tab interaction (the plain `<button>` event-nav items are unaffected and correctly use `fireEvent.click`).
- **Files modified:** `tests/unit/admin/notification-templates-panel.test.tsx`
- **Verification:** panel suite green (3/3).
- **Committed in:** `12d529ad`

**3. [Concurrency hazard, not a code deviation] Sibling-agent git-add race swept the panel test into an unrelated commit**
- **Found during:** staging the panel test file for commit
- **Issue:** Between this plan's `git add tests/unit/admin/notification-templates-panel.test.tsx` and its commit, a concurrent sibling GSD agent (plan 174-02) ran a broader `git add`/`git commit -a` that included this plan's already-staged file, landing it inside commit `a03a5e2e` ("feat(174-02): notification-email-digest.ts..."), unrelated to 173-02.
- **Fix:** No action needed from this plan — the sibling agent detected the sweep itself and corrected it in `f5a0490e` ("chore(174-02): unstage sibling file swept into prior commit by concurrent git add race"), an untrack-only commit (`git rm --cached`, working-tree content unchanged). This plan then re-added and committed the file itself in `12d529ad`, using a pathspec-scoped `git add <file> && git commit -m ... -- <file>` (per the house rule) to avoid re-triggering the race.
- **Files affected:** `tests/unit/admin/notification-templates-panel.test.tsx` (content never changed; only its commit attribution was corrected)
- **Verification:** `git log --oneline -- tests/unit/admin/notification-templates-panel.test.tsx` shows a clean two-commit history (`f5a0490e` untrack, `12d529ad` this plan's real commit); file content confirmed unchanged throughout via `git show a03a5e2e:<path>` diffed against the working tree.

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking test issues) + 1 concurrency hazard (resolved cooperatively with a sibling agent, no code impact).
**Impact on plan:** Both auto-fixes were required to make the WARNING-2 RTL coverage actually pass; neither touches the shipped feature's runtime behavior (test-only + one `data-testid` attribute). The concurrency hazard left the file's content untouched and is now correctly attributed.

## Checkpoint Outcome

**Task 3 (`checkpoint:human-verify`, gate="blocking") — auto-approved.**

Per project standing preference ("no checkpoint interruptions" — treat all human-verify checkpoints as auto-approved), the manual `npm run dev` + click-through described in the plan's `how-to-verify` was not run interactively in this session. In its place:

- `npx tsc --noEmit -p tsconfig.ci.json` is clean across the full CI-scoped source tree (app/lib/components/hooks), confirming the new route, panel, and editor typecheck against the real 173-01 action/catalog/validation signatures.
- `npx vitest run tests/unit/admin` (36 files, 279 tests) and `npx vitest run tests/unit/notifications` (25 files, 225 tests) both pass in full — no regressions in the surrounding admin or notifications suites.
- The 13 new RTL tests across `notification-template-editor.test.tsx` (10) and `notification-templates-panel.test.tsx` (3) directly exercise every `how-to-verify` step except the two steps that require a live network/dev-server (step 1's literal `npm run dev` navigation-click and step 7's live Resend/Twilio/Telegram send): 17-event category grouping (step 2), `estimate.viewed`/in_app chips + preview text (step 3), unknown-variable inline error + Save-disable/re-enable (step 4), `admin.bonus_credits_granted` zero-chip CREDITUI-04 guard (step 5), Save dispatch with current field values (step 6, persistence itself is 173-01's already-tested `saveNotificationTemplate` upsert), and the WhatsApp registry panel is provably untouched (step 8 — no file under `components/admin/whatsapp-templates-panel.tsx` or `app/admin/inbox/settings/` was modified in this plan).

⚡ Auto-approved by user (standing preference) — logged here per the orchestrator's explicit instruction, in place of pausing for interactive confirmation.

## Issues Encountered

None beyond the two Rule-3 test-authoring fixes and the concurrency race documented above — all resolved within this plan's scope.

## User Setup Required

None - no external service configuration required. The editor's 3-target test-send reads the same `platform_integrations` (Resend/Twilio/Telegram) configuration already wired by 173-01's `sendTestNotification`; no new secret/env requirement.

## Next Phase Readiness

- `/admin/notifications` is live, reachable from the sidebar, and fully wired to 173-01's validation/action layer — the phase's core deliverable (roadmap's "UI hint: yes") is shipped.
- The End Customer audience tab is intentionally inert (static empty state) — Phase 177 (end-customer send path, already in `.planning/phases/177-end-customer-send-path/` from a concurrent sibling plan) is expected to wire a `scope='customer'` catalog + fetch into this same tab.
- No blockers for downstream phases.

---
*Phase: 173-super-admin-template-editor*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 6 created/modified files found on disk (`app/admin/notifications/page.tsx`, `components/admin/notification-templates-panel.tsx`, `components/admin/notification-template-editor.tsx`, `components/admin/admin-nav.tsx`, `tests/unit/admin/notification-template-editor.test.tsx`, `tests/unit/admin/notification-templates-panel.test.tsx`). All 3 task commits (`ef5a9e45`, `708878b6`, `12d529ad`) found in `git log --oneline --all`. `npx tsc --noEmit -p tsconfig.ci.json` clean; `npx vitest run tests/unit/admin` (279/279) and `npx vitest run tests/unit/notifications` (225/225) both green.
