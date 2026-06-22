---
phase: 102-resilience-batch-autorefine-ttl
plan: 04
subsystem: web-workspace-ui
tags: [HARD-06, recourse-ui, awaiting_details, i18n, alert]
requires:
  - "projects.status='awaiting_details' written by the web adapter (lib/estimate/adapters/default.ts, Phase 96)"
  - "components/ui/alert.tsx (Alert/AlertTitle/AlertDescription)"
  - "components/ui/button.tsx (Button)"
  - "lib/i18n/use-translation (useTranslation/t)"
  - "existing CaptureModePicker + setModePickerOpen trigger in overview-tab.tsx"
provides:
  - "NeedsDetailsBanner recourse component (web dead-end fix for vague-after-cap estimates)"
  - "overview-tab gated render on awaiting_details wired to the existing generate trigger"
affects:
  - "components/workspace/overview-tab.tsx (project overview)"
tech-stack:
  added: []
  patterns:
    - "Reuse Alert primitive + Button (no new style, no editor redesign)"
    - "English-literal-as-key i18n via t() so the existing pt/es pipeline translates copy"
    - "CTA reuses the existing setModePickerOpen(true) trigger — no new generation path"
key-files:
  created:
    - components/workspace/needs-details-banner.tsx
  modified:
    - components/workspace/overview-tab.tsx
decisions:
  - "Used the lucide Info icon (matches the workspace info/warning convention) + default Alert variant per UI-SPEC"
  - "Gate lives in OverviewTab (project.status === 'awaiting_details'), not inside the banner — keeps the banner a pure presentational dispatcher (matches the RED test's GatedBanner shape)"
  - "CTA → onAddDetails → setModePickerOpen(true): the SAME CaptureModePicker → capture flow → /api/generate-estimate path the Record action uses; no new generate call, no new query, no hook change"
metrics:
  duration_seconds: 102
  tasks_completed: 1
  tasks_total: 2
  files_touched: 2
  completed_date: 2026-06-21
---

# Phase 102 Plan 04: Needs-Details Recourse Banner Summary

HARD-06 web recourse half: closes the dead-end where a still-vague estimate left the user stuck — a `NeedsDetailsBanner` (reused `Alert` + `Button`) shows in OverviewTab when `project.status === 'awaiting_details'`, and its "Add details & regenerate" CTA re-enters the existing `CaptureModePicker`/generate trigger via `setModePickerOpen(true)`.

## What Was Built

- **`components/workspace/needs-details-banner.tsx`** (new) — `'use client'` `NeedsDetailsBanner({ onAddDetails })`. Renders an `Alert` (default variant) with a lucide `Info` icon, `AlertTitle` "We need a bit more detail", an `AlertDescription` body explaining the estimate came out too vague, and a `size="sm"` `Button` "Add details & regenerate" that calls `onAddDetails` on click. All three copy strings (title, body, CTA) are wrapped in `t()` from `@/lib/i18n/use-translation`, so the existing translation pipeline produces pt/es per the UI-SPEC. No new style invented — reuses the `Alert` primitive + `Button` only.
- **`components/workspace/overview-tab.tsx`** (modified) — imported `NeedsDetailsBanner` and added a gated render at the top of the returned `<div className="space-y-6">` (right after `<CaptureModePicker>`, above `<EstimateTab>`): `{project.status === 'awaiting_details' && (<NeedsDetailsBanner onAddDetails={() => setModePickerOpen(true)} />)}`. This reuses the EXISTING `modePickerOpen` state + already-mounted `CaptureModePicker` — no new picker, no new generate call. `project.status` was already in scope (no new prop).

## How It Works (recourse loop)

1. A vague estimate survives the auto-refine cap → the web adapter (`default.ts`, Phase 96) writes `projects.status='awaiting_details'`.
2. OverviewTab's gate fires → `NeedsDetailsBanner` renders above the (empty) estimate area.
3. User clicks "Add details & regenerate" → `onAddDetails()` → `setModePickerOpen(true)` → the existing `CaptureModePicker` opens → capture flow → `/api/generate-estimate` (the same path the Record action uses).
4. Once a usable estimate is produced, `project.status` leaves `awaiting_details` → the gate is false → the banner disappears naturally.

## Verification

- `npx vitest run tests/unit/workspace/needs-details-banner.test.tsx` — **4/4 GREEN** (was RED at plan start: import of the not-yet-existing component failed by design from the 102-00 Wave-0 scaffold).
  - renders a title + CTA button when mounted
  - hidden when `project.status !== 'awaiting_details'`
  - visible when `project.status === 'awaiting_details'`
  - clicking the CTA fires `onAddDetails` exactly once
- `grep -n "awaiting_details" components/workspace/overview-tab.tsx` → gated render confirmed (line 85).
- `grep -n "useTranslation\|t(" components/workspace/needs-details-banner.tsx` → all three copy strings t()-wrapped (title, body, CTA).
- `tsc --noEmit` — no errors on either target file.
- `git diff --stat` (this plan) → exactly the two `files_modified` (needs-details-banner.tsx +46, overview-tab.tsx +5). No EstimateTab / capture flow / generate API changes.

## Deviations from Plan

None — plan executed exactly as written. The RED test already existed from the 102-00 Wave-0 scaffold, so Task 1's TDD flow went straight to GREEN by creating the component (no separate RED commit needed; the failing test was already committed in 201afb0/35e8537).

## Task 2 — Human-Verify (deferred, NON-BLOCKING UAT)

Task 2 is a `checkpoint:human-verify` (`autonomous: false`). Per the autonomous run mode, human-verify checkpoints are auto-approved and NOT paused — the items below are recorded as a deferred manual UAT to run in staging. The code task (Task 1) is fully implemented and unit-tested; this UAT confirms the live end-to-end loop + i18n only.

**Manual UAT items (staging):**
1. Generate an estimate from a deliberately thin/vague input (e.g. a one-word description) so the engine reverts it and sets `project.status='awaiting_details'`.
2. Open the project overview — confirm the banner appears above the (empty) estimate area with the title "We need a bit more detail" and the CTA.
3. Switch app language to PT and ES — confirm the title/body/CTA are translated by the existing pipeline (PT: "Precisamos de mais alguns detalhes" / "Adicionar detalhes e gerar de novo"; ES: "Necesitamos algunos detalles más" / "Agregar detalles y regenerar").
4. Click "Add details & regenerate" — confirm it opens the capture-mode picker (the same one Record uses) and that completing the flow re-runs generation; once a usable estimate is produced the banner disappears (status leaves `awaiting_details`).
5. Confirm a normal (non-vague) project shows NO banner.

**Status:** deferred / non-blocking. Owner confirmation pending — does not gate plan completion.

## HARD-06 Status

HARD-06 now has BOTH halves landed:
- **Configurable auto-refine cap** — shipped in Plan 102-02 (`AUTO_REFINE_MAX_ATTEMPTS` constant in `decide.ts`, default 1).
- **Web recourse UI** — shipped in this plan (102-04).

HARD-06 is complete with this plan.

## Phase 102 Remaining Work

- **102-03 (HARD-05, batch-reporting)** — still RED by design (`tests/unit/whatsapp/batch-reporting.test.ts` failing). Owned by Plan 102-03; touches `state.ts` + `whatsapp.ts` (left clean by 102-01). Not in scope for this plan.

## Scope Notes

- **xphere untouched** — confirmed: zero xphere files in this plan's diff. The Xphere CRM mirror integration is out of scope.
- No editor/workspace redesign; no new query, no hook change, no new generation path — only `Alert` + `Button` reused.

## Self-Check: PASSED

- FOUND: components/workspace/needs-details-banner.tsx
- FOUND: components/workspace/overview-tab.tsx (modified)
- FOUND commit: 6983aed (feat(102-04): add NeedsDetailsBanner recourse UI for awaiting_details)
- Test 4/4 GREEN verified
