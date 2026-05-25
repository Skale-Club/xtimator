---
phase: quick-260525-lt5
plan: 01
subsystem: ui/projects
tags:
  - ui
  - destructive-actions
  - confirmation-dialog
requires:
  - components/ui/alert-dialog (already imported)
  - lib/actions/project::softDeleteProjectAction (already imported)
provides:
  - Soft-delete confirmation AlertDialog for active + archived project rows
affects:
  - components/projects/project-row-actions.tsx (only)
tech-stack:
  added: []
  patterns:
    - "Two-stage trash UX: soft-delete now gated behind AlertDialog confirmation (parity with hard-delete)"
key-files:
  created: []
  modified:
    - components/projects/project-row-actions.tsx
decisions:
  - "Kept destructive red styling (bg-destructive ...) on soft-delete confirm action for visual parity with hard-delete dialog — soft delete is still destructive intent and matching styling preserves muscle memory"
  - "Preserved existing 'moved to Trash' toast wording verbatim — only the timing changed (after confirm) not the message"
  - "Single shared softConfirmOpen state for both active + archived branches — both Delete items deterministically show the same dialog content (projectName is the same component-instance prop)"
metrics:
  duration: "~4.5 min"
  completed: "2026-05-25"
requirements:
  - UI-CONFIRM-SOFT-DELETE
---

# Quick 260525-lt5: Confirm soft-delete with AlertDialog Summary

Gated the "Delete" action on active + archived project rows behind an AlertDialog confirmation so soft-delete now matches the two-stage trash pattern instead of acting on a single click.

## What changed

`components/projects/project-row-actions.tsx`:
- Added `const [softConfirmOpen, setSoftConfirmOpen] = useState(false)` alongside the existing `confirmOpen` state.
- Replaced the `onClick` handler on the `status === 'active'` Delete `<DropdownMenuItem>` so it now calls `setSoftConfirmOpen(true)` instead of running `softDeleteProjectAction` directly.
- Applied the same change to the `status === 'archived'` Delete `<DropdownMenuItem>`. Both branches now open the same shared dialog.
- Appended a new `<AlertDialog open={softConfirmOpen}>` block directly after the existing hard-delete `<AlertDialog>`. The new dialog mirrors the hard-delete structure (header / description / footer / cancel / action) but with:
  - Title: `Move project to Trash?`
  - Description: `"${projectName}" will be moved to Trash. You can restore it from the Trash view within 30 days before it is permanently deleted.`
  - Action label: `{isPending ? 'Moving...' : 'Move to Trash'}`
  - Action onClick: runs `softDeleteProjectAction(projectId)` with the existing `"${projectName}" moved to Trash` toast, then closes the dialog.
  - Same destructive red styling as the hard-delete confirm button for visual parity.

Diff shape: 1 added `useState`, 2 `onClick` handlers simplified to `setSoftConfirmOpen(true)`, 1 new `<AlertDialog>` block appended. No imports changed. No other code touched.

## Why it ships

Soft-delete previously fired on a single click with no undo prompt — a footgun next to non-destructive items like Archive in the same dropdown. With the new dialog, deletion now requires an explicit confirm step, matching the established two-stage trash UX (soft delete → 30-day Trash → hard delete). The success toast and underlying action remain unchanged, so the post-confirm experience is identical to before.

## What did NOT change

- Hard-delete confirmation block (`confirmOpen`, `Permanently delete project?` dialog) is byte-for-byte unchanged. Its state, title, description, action onClick, label, and styling were not modified.
- The `status === 'trash'` "Delete permanently" menu item still calls `setConfirmOpen(true)` exactly as before.
- Archive / Unarchive / Restore items remain one-click (non-destructive).
- Imports unchanged — all AlertDialog primitives were already imported.
- The `run()` helper, `Props` interface, `useTransition`, `useRouter`, and overall component structure are untouched.

## Deviations from Plan

None — plan executed exactly as written. (Note: an early Edit attempt mistakenly resolved to the parent repo file outside the worktree; this was reverted with `git checkout` and the same edits re-applied inside the worktree before commit. No effect on the committed diff.)

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0, no errors.
- `softConfirmOpen` references in file: 6 (1 useState, 2 setSoftConfirmOpen(true) onClicks, 1 `open={softConfirmOpen}`, 1 `onOpenChange={setSoftConfirmOpen}`, 1 setSoftConfirmOpen(false) inside action). >= 4 ✓
- `softDeleteProjectAction(projectId)` references: 1 (inside the new AlertDialogAction onClick only).
- `hardDeleteProjectAction(projectId)` references: 1 (unchanged hard-delete action).
- `Move project to Trash?` title: exactly 1 match.
- `Permanently delete project?` title: exactly 1 match (unchanged).
- Original `confirmOpen` still referenced by hard-delete dialog and trash-row menu item — confirms it was not renamed.

## Commits

- `330a4f4` feat(quick-260525-lt5): confirm soft delete with AlertDialog

## Self-Check: PASSED

- FOUND: components/projects/project-row-actions.tsx (modified, 191 lines)
- FOUND commit: 330a4f4
- TypeScript: clean
