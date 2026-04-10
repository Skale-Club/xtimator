---
phase: 04-project-creation-workspace
plan: 02
subsystem: ui
tags: [wizard, forms, react-hook-form, nextjs]
---

## What was built

3-step New Project Wizard at `/projects/new` with client selection (inline creation), project details (auto-name suggestion, type dropdown from industry config, custom type, budget), and confirmation summary. On submit creates project via `createProjectAction` and redirects to workspace.

## Commits

- `f09680f`: feat(04-02): wizard page, step indicator, and wizard shell component
- `037c03a`: feat(04-02): step components -- client select, project details, confirmation

## Key files

### key-files.created
- `app/(app)/projects/new/page.tsx` — Server component fetching company + clients
- `components/projects/new-project-wizard.tsx` — Wizard shell with useForm + step navigation
- `components/projects/project-step-indicator.tsx` — 3-step indicator (reuses onboarding pattern)
- `components/projects/step-client-select.tsx` — Client selector with inline "Add new client"
- `components/projects/step-project-details.tsx` — Auto-name, type dropdown, budget field
- `components/projects/step-confirmation.tsx` — Read-only summary before creation

## Decisions

- zodResolver cast to `any` for zod v4 compatibility (consistent with Phase 2)
- Auto-name uses `nameManuallyEdited` ref to avoid overwriting user edits
- Inline client creation calls existing `createClientAction` from Phase 3

## Self-Check: PASSED

- [x] All 6 files created with real implementations
- [x] TypeScript compiles (`npx tsc --noEmit`)
- [x] Wizard uses projectSchema from Plan 01
- [x] createProjectAction called on submit
