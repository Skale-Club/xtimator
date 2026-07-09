---
phase: 163-format-first-send-hub-cross-surface-settings-rollout
plan: 04
subsystem: ui
tags: [send-hub, dialog, shadcn, format-first, sendhub-01, sendhub-06, drop-in]

# Dependency graph
requires:
  - phase: 160-friendly-estimate-urls
    provides: buildEstimatePublicPath (Online Estimate card's URL source)
  - phase: 162-presentation-settings-panel
    provides: dialog primitive + a11y patterns; state-ownership convention (parent owns *Open flag)
  - phase: 163-01
    provides: Wave 0 SendHubDialog contract test (RED -> GREEN target)
  - phase: 163-03
    provides: cross-surface resolver rollout -- hub delegates section-visibility to the underlying renderers, no isSectionVisible calls in the hub itself
provides:
  - New components/workspace/send/send-hub-dialog.tsx (format-first Send hub, 3 cards + subordinate footer)
  - New components/workspace/send/language-flag-chip.tsx (re-homed from the dying estimate-preview.tsx per RESEARCH Q5)
  - estimate-tab.tsx no longer imports the retired SendDialog; hub mounts from the same sendOpen state slot
  - Wave 0 static-grep test (SENDHUB-01 + SENDHUB-06 assertions) transitions RED -> GREEN (6/6 non-todo assertions)
affects:
  - 163-05-PLAN.md (delivery-action wiring: replaces the placeholder toast.info handlers with real server-action calls + estimate_deliveries.insert)
  - 163-06-PLAN.md (deletion sweep: send-dialog.tsx, send-form.tsx, send-actions-menu.tsx, send-tab.tsx, estimate-preview.tsx all now safe to delete)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Format-first dialog composition: shadcn Dialog + a grid of Card wrappers, one per format. No <Tabs> primitive. Actions live inside each card, not below/around them. Applies whenever a UI needs to expose N mutually-compatible output modes (each with its own delivery affordances)."
    - "Drop-in dialog swap: rename the imported component + tag; parent's *Open state stays untouched. Preserves the estimate-tab.tsx state-ownership pattern established in Phase 162 (settingsOpen / photosOpen)."
    - "Placeholder handler with a distinct toast per action: onClick={() => toast.info('<Action> - wired in 163-05')} keeps the UI mountable + demoable during a multi-plan rollout, without shipping fake behavior that might look real."
    - "Optional-prop threading with fallback semantics: companySlug + whatsappEnabled land as OPTIONAL props at every parent layer. When undefined, downstream fallback paths kick in (buildEstimatePublicPath -> legacy token URL; whatsappEnabled -> show placeholder button). Lets the hub ship BEFORE the parent chain is fully wired."

key-files:
  created:
    - components/workspace/send/send-hub-dialog.tsx
    - components/workspace/send/language-flag-chip.tsx
  modified:
    - components/workspace/estimate/estimate-tab.tsx

key-decisions:
  - "SendHubDialog wires Copy URL + Open URL TODAY (buildEstimatePublicPath + navigator.clipboard + window.open) instead of stubbing them behind placeholder toasts. These are pure client-side ops that don't require server logging; 163-05 will ADD delivery-tracking (estimate_deliveries insert) on top of the working handlers, not replace them. The plan text's 'or similar' latitude covered this."
  - "Email / SMS / WhatsApp / Download stay as placeholder toasts (toast.info(action + ' -- wired in 163-05')). These DO require server-action calls + delivery-row insertion; 163-05 will replace the placeholder handlers with the real wiring."
  - "companySlug + whatsappEnabled added as OPTIONAL props at EstimateTabProps (not threaded end-to-end from ProjectWorkspace -> page.tsx in this plan). Rationale: keeps the plan scoped to the UI seam; buildEstimatePublicPath's legacy fallback (returns /estimate/{share_token} when slug is null) means the Online Estimate card's Copy URL + Open URL still work today. 163-05 threads them from the page layer once the delivery-action wiring needs them."
  - "LanguageFlagChip re-homed to a dedicated file INSTEAD of folded into send-hub-dialog.tsx. Rationale: any future consumer (hub, deletion-sweep audit, a follow-on preview surface) can import it without pulling in the whole hub. Estimate-preview.tsx still exports its own copy (untouched); the coexisting definitions retire together in 163-06."
  - "Mark as Sent uses useTransition + reads markAsSentAction's { error } | { success } return shape (not throw-based). Mirrors the send-form.tsx precedent for the same action, so the hub's binding preserves markAsSentAction's 5 side effects (sent_at, share_expires_at, projects.status, estimate_activity insert, Xphere sync, revalidatePath) exactly as-is."
  - "PlainTextSheet KEPT and rewired inside the Plain Text card's Edit action. Rationale (RESEARCH Q7): its API surface is a clean seam; deleting it would force a redundant rebuild of the plain-text preview UI. Retire together with the other channel-first files in 163-06 only if 163-05 finds a leaner replacement."

patterns-established:
  - "The retirement of a legacy dialog happens in TWO steps: (1) build the replacement + swap the consumer's import + JSX (this plan), (2) delete the legacy file only after every consumer is flipped (163-06). The two-step lets each step keep the app buildable and the tests green."
  - "Placeholder handlers are DISTINGUISHABLE by the action they claim to perform: toast.info('Copy URL -- wired in 163-05') NOT toast.info('coming soon'). Rationale: a QA/product review of the half-shipped state should see exactly which buttons the next plan wires, without opening the plan file."

requirements-completed: [SENDHUB-01, SENDHUB-06]

# Metrics
duration: 10m 26s
completed: 2026-07-09
---

# Phase 163 Plan 04: Format-First SendHubDialog Summary

**Format-first Send hub landed: `<SendHubDialog>` renders 3 cards (Online Estimate / PDF / Plain Text) with per-format delivery-action buttons, a `<LanguageFlagChip>` in the header (display-only, no picker), and `Mark as Sent` as a subordinate ghost button in the footer. `estimate-tab.tsx` no longer imports the retired `<SendDialog>`; the hub mounts from the SAME `sendOpen` state slot (line 92). Copy URL + Open URL work today; Email/SMS/WhatsApp/Download are placeholder toasts that 163-05 will replace with real server-action calls + `estimate_deliveries` inserts.**

## Performance

- **Duration:** 10m 26s
- **Started:** 2026-07-09T00:19:57Z
- **Completed:** 2026-07-09T00:30:23Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Task 1 (`43c06416`)** — Re-homed `LanguageFlagChip` from the dying `components/workspace/send/estimate-preview.tsx` into a dedicated `components/workspace/send/language-flag-chip.tsx`. Verbatim copy of the component + added `'use client'` directive + `data-testid="language-flag-chip"` for RTL. Two definitions coexist for one plan; the estimate-preview.tsx copy retires with 163-06's deletion sweep.
- **Task 2 (`17ccec85`)** — Built `<SendHubDialog>` (~340 lines). Three format cards laid `grid grid-cols-1 md:grid-cols-3 gap-3` (mobile stacks, desktop lays horizontally). Each card carries its own delivery-action buttons: Online Estimate (Copy URL, Open URL, Email, SMS, WhatsApp), PDF (Download PDF, Email, SMS, WhatsApp), Plain Text (Copy, Edit via PlainTextSheet, Email, SMS, WhatsApp). Footer holds a ghost `Mark as Sent` button wired to the existing `markAsSentAction`. No `<Tabs>` primitive; no `Share & Export` string anywhere. Wave 0 contract test (163-01 Task 4 File C) transitions from RED (4 fails / 2 pass) to GREEN (6 pass / 2 `it.todo`).
- **Task 3 (`2e14229b`)** — Swapped `estimate-tab.tsx`'s line 13 import from `SendDialog` -> `SendHubDialog` and the JSX tag at line 181-197. Added 2 optional props to `EstimateTabProps` (`companySlug?: string | null`, `whatsappEnabled?: boolean`). The `sendOpen` state at line 92 is UNTOUCHED; `onSend={() => setSendOpen(true)}` binding UNTOUCHED. Hub renders from the SAME state slot as the retired dialog.
- **Wave 0 SendHubDialog contract test** transitions RED -> GREEN across all 6 non-todo assertions:
  - File exists: GREEN
  - `export function SendHubDialog`: GREEN
  - Three testid cards (`send-hub-card-online-link` / `-pdf` / `-plain-text`): GREEN
  - No `@/components/ui/tabs` import: GREEN
  - No `Share & Export` string: GREEN
  - `markAsSentAction` + `LanguageFlagChip` referenced: GREEN
- **Hidden-regression guards all GREEN (40/40):** `estimate-pdf-totals` (3/3), `estimate-pdf-modern-totals` (3/3), `whatsapp/formatter`, `utils/estimate-template`, `presentation-settings-cross-surface` (4/4). Confirms Phase 163-03's Wave 2 rollout is not perturbed by the hub swap.
- **Typecheck clean:** `npx tsc --noEmit -p tsconfig.ci.json` exits 0 across all three commits.
- **`send-dialog.tsx` still on disk:** deletion is 163-06's scope. This file no longer references it (verified: `grep -Ec "\bSendDialog\b" components/workspace/estimate/estimate-tab.tsx` = 0).

## Task Commits

1. **Task 1: Re-home LanguageFlagChip** — `43c06416` (feat)
2. **Task 2: Build SendHubDialog** — `17ccec85` (feat)
3. **Task 3: Swap SendDialog -> SendHubDialog in estimate-tab** — `2e14229b` (feat)

## Files Created/Modified

**Created (2):**
- `components/workspace/send/send-hub-dialog.tsx` — 340-line format-first Send hub component. Consumes estimate + client + company + template props (drop-in shape); renders 3 cards + subordinate footer.
- `components/workspace/send/language-flag-chip.tsx` — 39-line re-home. Verbatim copy of the chip from estimate-preview.tsx + `'use client'` + testid.

**Modified (1):**
- `components/workspace/estimate/estimate-tab.tsx` — import + JSX swap + 2 optional prop declarations. State-ownership pattern preserved; no behavior change to the surrounding editor render path.

## Decisions Made

- **Copy URL + Open URL wired today (not placeholder toasts).** These are pure client-side operations (clipboard + window.open) that require no server logging. 163-05 will ADD server-side delivery-tracking on top, not replace working handlers. This aligns with the plan's "or similar" latitude on the placeholder pattern and delivers actual value in the interim state.
- **Email / SMS / WhatsApp / Download stay as placeholder toasts.** These DO require server-action calls + `estimate_deliveries` inserts. 163-05 replaces the placeholders with the real wiring. Distinguishing toasts per action ("Email link — wired in 163-05" vs "Download PDF — wired in 163-05") makes the half-shipped state legible in a QA review.
- **`companySlug` + `whatsappEnabled` added as OPTIONAL props at `EstimateTabProps` only.** The parent chain (`OverviewTab` -> `ProjectWorkspace` -> page.tsx) does NOT yet thread them — plan gave latitude here ("if the props at the layer above already carry `company` for other reasons, just pass through"). Fallback behavior: `companySlug: null` -> `buildEstimatePublicPath` returns the legacy `/estimate/{share_token}` path (byte-identical to the retired `buildShareLink`); `whatsappEnabled: undefined` -> hub shows WhatsApp buttons (default true). 163-05 threads them from the page layer.
- **LanguageFlagChip re-homed to a dedicated file (not folded into the hub).** Rationale: keeps the retirement clean — 163-06 deletes `estimate-preview.tsx` without also having to grep the hub. Also allows any future consumer (a follow-on preview surface, a status pill) to import the chip without pulling in the whole hub.
- **`Mark as Sent` uses `useTransition` + `{ error } | { success }` return shape.** `markAsSentAction` returns `{ error }` on failure and `{ success: true }` on success — it does NOT throw. Mirrors the `send-form.tsx` precedent for the same action, so all 5 side effects (`sent_at`, `share_expires_at`, `projects.status='sent'`, `estimate_activity` insert, Xphere sync, `revalidatePath`) fire exactly as they did before.
- **PlainTextSheet KEPT and rewired inside the Plain Text card's Edit action.** Its API surface is a clean seam; deleting it would force a redundant rebuild of the plain-text preview UI. 163-06 revisits — either delete + rebuild inside the hub, or keep as-is once 163-05 has landed the delivery-action wiring.
- **Card `variant="glass"` chosen for parity with the surrounding editor + PresentationSettingsPanel** (both use glass styling). The Online Estimate card also carries `border-primary/40` to emphasize its default-format status (SENDHUB-01 language "Online Estimate (default)").

## Deviations from Plan

None material. Small in-scope adjustments:

### Inline adjustments (not deviations)

**1. Type correction: `TemplateData | null` -> `EstimateTemplate`**
- **Found during:** Task 2 (SendHubDialog prop signature)
- **Issue:** The plan's `<interfaces>` block described `estimateTemplate: TemplateData | null` on the retired `SendDialogProps`; the actual source at `components/workspace/send/send-dialog.tsx:28` is `EstimateTemplate` (non-nullable). Also, `TemplateData` isn't exported from `lib/utils/estimate-template.ts` — `EstimateTemplate` is.
- **Fix:** Used `EstimateTemplate` for the hub's `estimateTemplate` prop, matching the retired dialog + `PlainTextSheet`'s prop.
- **Files modified:** `components/workspace/send/send-hub-dialog.tsx`
- **Verification:** Typecheck clean, RTL tests GREEN.

**2. Copy URL + Open URL wired today (see Decisions Made above)**
- **Found during:** Task 2 (compute `publicPath` -> avoid unused-variable warning)
- **Issue:** The plan required `buildEstimatePublicPath` be imported + called (per acceptance criteria's grep gate) but ALSO required all delivery actions to be placeholder toasts. Computing `publicPath` without consuming it would emit an unused-variable warning.
- **Fix:** Wired Copy URL + Open URL to consume `publicPath` (via `navigator.clipboard.writeText(buildAbsoluteUrl())` and `window.open(buildAbsoluteUrl(), '_blank', 'noopener,noreferrer')`). These are pure client-side ops; 163-05 will ADD delivery-row logging on top. Email / SMS / WhatsApp / Download stay placeholder.
- **Files modified:** `components/workspace/send/send-hub-dialog.tsx`
- **Verification:** Contract test GREEN; typecheck clean; hidden-regression suite GREEN.

**3. Interface annotation adjustment: `estimate: EstimateWithSections | null`**
- **Found during:** Task 2 (drop-in shape)
- **Issue:** The retired `SendDialogProps.estimate` was `EstimateWithSections | null`, and `estimate-tab.tsx` renders the dialog even when `currentEstimate` might not exist during the auto-generation window. Preserving nullability makes the drop-in cleaner.
- **Fix:** Kept `estimate: EstimateWithSections | null` on the hub props; early-returns `null` when the estimate is absent (mirrors the retired dialog's behavior at `send-dialog.tsx:47`).
- **Files modified:** `components/workspace/send/send-hub-dialog.tsx`
- **Verification:** Typecheck clean.

---

**Total deviations:** 0 material; 3 inline adjustments (2 type/nullability corrections vs plan text, 1 auto-added Rule 3 style fix for the unused-variable case).
**Impact on plan:** None. All acceptance criteria met on first pass after correcting an initial `Share & Export` regex trip in a comment (see Issues Encountered below).

## Issues Encountered

- **Case-insensitive `Share & Export` regex tripped by comments.** The contract test's assertion `expect(source).not.toMatch(/Share\s*&\s*Export/i)` also matched several comment references I wrote ("...replaces the retired channel-first SendDialog. Same sendOpen state slot..." — wait no that was SendDialog. The relevant one was comments describing what was retired). Fixed by rewriting comments to describe the retired UI without naming the exact literal (e.g., "separate dropdown menu that used to sit in the dialog header"). Took 2 additional edit passes to nail; commit was clean before the Task 2 commit.
- **Snapshot line-ending churn.** `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` was rewritten by vitest during Task 3's test run — LF -> CRLF only, no substantive diff. Restored via `git checkout --` to keep the Task 3 commit clean. Same known issue as 163-03.
- **Pre-existing RED test.** `tests/unit/estimate/delivery-insert-format.test.ts` (added by 163-01 as a Wave 0 scaffold for SENDHUB-03) has 3 failing `it` blocks — pre-existing (not caused by this plan). GREEN transition is 163-05's scope (adding `format:` fields to the 6 estimate_deliveries INSERT sites). Documented here for continuity; no fix in this plan.

## User Setup Required

None — pure UI + drop-in swap. No environment variables, secrets, migrations, or dashboard configuration required. The parent chain wiring for `companySlug` + `whatsappEnabled` end-to-end will land in 163-05 (still no user action needed).

## Next Phase Readiness

- **163-04 (this plan) complete.** SENDHUB-01 + SENDHUB-06 met. The hub is mounted from `estimate-tab.tsx` and renders correctly (typecheck + contract test + hidden-regression suite all GREEN).
- **163-05 (delivery-action wiring)** — unblocked. The hub's per-action onClick handlers are named placeholder targets (`placeholder('Email link')`, `placeholder('Download PDF')`, etc.); 163-05 replaces each placeholder with the corresponding server-action call + `estimate_deliveries` insert (which requires 163-02's migration to already be applied). The hub's shape is stable — 163-05 changes only handlers, not layout or props.
- **163-06 (deletion sweep)** — unblocked. All 5 legacy files (`send-dialog.tsx`, `send-form.tsx`, `send-actions-menu.tsx`, `send-tab.tsx`, `estimate-preview.tsx`) now have zero external consumers except each other (self-referential cycle). Grep verification will confirm at deletion time.
- **Manual verification** (deferred per phase validation strategy): open the hub at 360/390/430px viewports, confirm 3 cards stack cleanly + all buttons >= 44px touch targets. Should be done during a follow-on QA sweep, not required to advance the phase.
- **No blockers.**

## Self-Check

Verified via absolute-path existence + git-log grep + vitest sweep + tsc + grep counts:

- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/send-hub-dialog.tsx` created (Task 2)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/send/language-flag-chip.tsx` created (Task 1)
- FOUND: `C:/Users/Vanildo/Dev/xtimator/components/workspace/estimate/estimate-tab.tsx` modified (Task 3)
- FOUND: commit `43c06416` (Task 1) in `git log`
- FOUND: commit `17ccec85` (Task 2) in `git log`
- FOUND: commit `2e14229b` (Task 3) in `git log`
- FOUND: `npx vitest run tests/unit/workspace/send-hub-dialog.test.tsx` = 6 passed / 2 todo / 0 failed
- FOUND: `npx vitest run tests/unit/pdf/... tests/unit/whatsapp/... tests/unit/utils/estimate-template.test.ts tests/unit/estimate/presentation-settings-cross-surface.test.tsx` = 40/40 GREEN
- FOUND: `npx tsc --noEmit -p tsconfig.ci.json` exit 0
- FOUND: `grep -Ec "\bSendDialog\b" components/workspace/estimate/estimate-tab.tsx` = 0
- FOUND: `grep -c "SendHubDialog" components/workspace/estimate/estimate-tab.tsx` = 2
- FOUND: `grep -c "sendOpen" components/workspace/estimate/estimate-tab.tsx` = 2 (state decl line + JSX open= line; setSendOpen is case-different)
- FOUND: `grep -c "companySlug" components/workspace/estimate/estimate-tab.tsx` >= 1 (actual: 4 -- interface docstring + interface field + destructure + JSX prop)
- FOUND: `components/workspace/send/send-dialog.tsx` still on disk (unchanged; retires with 163-06)
- FOUND: `components/workspace/send/estimate-preview.tsx` still on disk (unchanged; retires with 163-06)

## Self-Check: PASSED

---
*Phase: 163-format-first-send-hub-cross-surface-settings-rollout*
*Completed: 2026-07-09*
