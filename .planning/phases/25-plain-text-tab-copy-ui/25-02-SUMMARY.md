---
phase: 25-plain-text-tab-copy-ui
plan: "02"
subsystem: plain-text-send-ui
tags: [plain-text, clipboard, send-tab, client-component]
dependency_graph:
  requires:
    - Phase 24 — resolveTemplate utility in estimate-template.ts
    - Phase 25-01 — buildItemsBreakdown exported from estimate-template.ts
  provides:
    - PlainTextCard client component (components/workspace/send/plain-text-card.tsx)
    - SendTab extended with PlainTextCard below 2-column grid
    - ProjectWorkspace extended with ownerName + estimateTemplate props
    - page.tsx company query extended with owner_name + 4 template columns
  affects:
    - PLAINTEXT-01: Plain Text card visible in Send tab
    - PLAINTEXT-02: Copy button with clipboard toast
    - PLAINTEXT-04: Inline editing without server action
tech_stack:
  added: []
  patterns:
    - useState lazy initializer for generateText (avoids re-computation on every render)
    - key={estimate.id} on PlainTextCard to remount on estimate version change
    - space-y-6 wrapper pattern for stacking Send tab sections
key_files:
  created:
    - components/workspace/send/plain-text-card.tsx
  modified:
    - components/workspace/send/send-tab.tsx
    - components/workspace/project-workspace.tsx
    - app/(app)/projects/[id]/page.tsx
decisions:
  - PlainTextCardEmpty exported separately for potential future use; null estimate handled at SendTab level via existing empty state (no regression)
  - clientName added as explicit SendTabProps field (not accessed through project object) — keeps prop interface clean and consistent with clientEmail pattern
  - key={estimate.id} on PlainTextCard ensures textarea resets when user switches estimate versions (Pitfall 2 guard)
  - space-y-6 div wraps both the grid and PlainTextCard — consistent with workspace layout patterns (Pitfall 3 guard)
metrics:
  duration: 39min
  completed: "2026-05-08"
  tasks: 2
  files: 4
---

# Phase 25 Plan 02: PlainTextCard Component + Data Chain Summary

**One-liner:** `PlainTextCard` client component with editable textarea, clipboard copy with "Copied to clipboard!" toast, and RotateCcw reset — wired from Supabase company query through ProjectWorkspace and SendTab.

## What Was Built

### Task 1: PlainTextCard component

Created `components/workspace/send/plain-text-card.tsx` as a `'use client'` component:

- `PlainTextCard`: Renders a Card with a 16-row monospace Textarea pre-filled via `resolveTemplate(estimateTemplate, { client_name, company_name, owner_name, total, items_breakdown })`. Textarea is editable (local state only, no server action). Copy button uses `navigator.clipboard.writeText` with `toast.success('Copied to clipboard!')` and a 2-second Check icon flash. RotateCcw button calls `generateText()` to reset textarea to freshly generated text.
- `PlainTextCardEmpty`: Shown when no estimate exists — FileText icon with guidance copy.
- No server actions called. No client-side fetching. State is local only.

### Task 2: Data chain wiring

Three targeted changes to thread `ownerName`, `estimateTemplate`, and `clientName` from server to component:

1. **`app/(app)/projects/[id]/page.tsx`**: Extended company `select()` to include `owner_name, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature`. Derived `ownerName` and `estimateTemplate` object. Passed both to `ProjectWorkspace`.

2. **`components/workspace/project-workspace.tsx`**: Added `EstimateTemplate` import from `@/lib/utils/estimate-template`. Extended `ProjectWorkspaceProps` with `ownerName: string` and `estimateTemplate: EstimateTemplate`. Passed `clientName={project.client?.name ?? ''}`, `ownerName`, and `estimateTemplate` to `SendTab`.

3. **`components/workspace/send/send-tab.tsx`**: Added `EstimateTemplate` import and `PlainTextCard` import. Extended `SendTabProps` with `clientName`, `ownerName`, `estimateTemplate`. Wrapped the 2-column grid in `<div className="space-y-6">` and added `<PlainTextCard key={estimate.id} ... />` below the grid.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create PlainTextCard component | 1e3e3c0 | components/workspace/send/plain-text-card.tsx |
| 2 | Wire PlainTextCard through data chain | b5d919a | send-tab.tsx, project-workspace.tsx, page.tsx |

## Verification

- `npx tsc --noEmit` — no errors (both after Task 1 and Task 2)
- `npx vitest run` — 73 files, 408 tests passed, 0 failures, 2 skipped, 5 todo
- Acceptance criteria for both tasks: all checks passed

## Deviations from Plan

None — plan executed exactly as written. The `clientName` addition was pre-documented in the plan's revised approach section; no deviation from the spec.

## Known Stubs

None — `PlainTextCard` is fully implemented with live `resolveTemplate` + `buildItemsBreakdown` calls. All template variables resolved from props.

## Self-Check: PASSED

- [x] `components/workspace/send/plain-text-card.tsx` exists — FOUND
- [x] File starts with `'use client'` — CONFIRMED
- [x] Exports `PlainTextCard` and `PlainTextCardEmpty` — CONFIRMED
- [x] Imports `resolveTemplate, buildItemsBreakdown` from `@/lib/utils/estimate-template` — CONFIRMED
- [x] Imports `formatCurrency` from `@/lib/utils/format` — CONFIRMED
- [x] `app/(app)/projects/[id]/page.tsx` contains `select('name, owner_name, estimate_template_greeting, ...')` — CONFIRMED
- [x] `project-workspace.tsx` contains `ownerName: string` in interface — CONFIRMED
- [x] `project-workspace.tsx` contains `import type { EstimateTemplate }` — CONFIRMED
- [x] `send-tab.tsx` contains `import { PlainTextCard }` — CONFIRMED
- [x] `send-tab.tsx` contains `<PlainTextCard` — CONFIRMED
- [x] `send-tab.tsx` contains `key={estimate.id}` on PlainTextCard — CONFIRMED
- [x] `send-tab.tsx` wraps grid + PlainTextCard in `<div className="space-y-6">` — CONFIRMED
- [x] Commit 1e3e3c0 exists — FOUND
- [x] Commit b5d919a exists — FOUND
- [x] TypeScript clean — CONFIRMED
- [x] 408 tests pass — CONFIRMED
