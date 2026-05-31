---
phase: quick-260525-oij
plan: 01
subsystem: workspace-client-tab
tags: [bug-fix, react-hook-form, ux]
requires: []
provides:
  - "ClientTab form re-syncs with project.client across re-renders via useForm `values`"
affects:
  - "components/workspace/client-tab.tsx"
tech-stack:
  added: []
  patterns:
    - "react-hook-form `values` prop for keeping form state synced with a changing external source (vs. `defaultValues` which is mount-only)"
key-files:
  created: []
  modified:
    - "components/workspace/client-tab.tsx"
decisions:
  - "Use react-hook-form `values` (not `defaultValues`) when the form's source data lives in a parent prop that can change across re-renders — the documented idiom for controlled external sources (https://react-hook-form.com/docs/useform#values)."
  - "Accept the trade-off that unsaved in-progress edits get discarded if the parent re-renders with new `project.client` data (e.g. another tab edits the linked client). The server is the source of truth and users have an explicit Save button; silent edit loss in this corner case is preferable to a stuck/empty form after a successful link action."
metrics:
  duration: "~6 minutes"
  completed: "2026-05-25T20:47:58Z"
  tasks_completed: 1
  tasks_deferred: 1
requirements:
  - QUICK-OIJ-01
---

# Quick Task 260525-oij: Fix client form not populating after linking — Summary

One-line: Switched `ClientTab`'s `useForm` from `defaultValues` to `values` so the name/email/phone fields auto-populate the moment `LinkClientCard` links an existing client (parent re-renders with `project.client` populated → `useForm({ values })` re-syncs in the same render cycle, no manual reload).

## What Changed

A single, surgical one-line change in `components/workspace/client-tab.tsx`:

```diff
   const form = useForm({
-    defaultValues: {
+    values: {
       name: client?.name ?? '',
       email: client?.email ?? '',
       phone: client?.phone ?? '',
     },
   })
```

## Why This Is the Right Fix

`defaultValues` is read **once at mount time** — it does not react to subsequent prop changes. The bug flow was:

1. User opens a project with `project.client = null` → `ClientTab` mounts → `useForm` initializes with empty strings.
2. User clicks "Link Client" → `LinkClientCard` calls `linkProjectToClient` server action → `router.refresh()`.
3. Server re-fetches `ProjectDetail` with `project.client` now populated → the `(app)` segment re-renders → `ClientTab` re-renders with `client = {...}`.
4. The early-return `if (!client) return <LinkClientCard />` no longer fires (good), but the form **still holds the empty initial values from step 1** because `defaultValues` is not reactive.

react-hook-form documents the `values` prop as the correct API for exactly this case — keeping form state synced with a changing external source. Per the official docs:

> The `values` prop will react to changes and update the form values, which is useful when your form needs to be updated by external state or server data.
> — https://react-hook-form.com/docs/useform#values

This is the idiomatic fix; no `useEffect` + `form.reset()` workaround needed.

## Behavioral Trade-off

`values` overrides user-edited fields when its reference changes. In practice this means:

- **Wanted (this fix's purpose):** when `project.client` transitions from `null` → linked client, the form picks up the linked client's contact data on the next render.
- **Side-effect (acceptable):** if the user edits a field (e.g. corrects the email) and then triggers a parent re-render *without saving* (e.g. another browser tab edits the same client → server-side re-fetch via realtime/refresh), the in-progress unsaved edit is discarded in favor of the latest server data.

Why acceptable: the server is the source of truth, there is an explicit Save button, and the alternative (a stuck empty form after a successful link) is a strictly worse UX. This is the same trade-off documented in the react-hook-form `values` docs.

## Files Modified

| File | Change | Lines |
|------|--------|-------|
| `components/workspace/client-tab.tsx` | `defaultValues` → `values` in `useForm` call | -1 / +1 |

## Commits

- `c8ff358` — fix(quick-260525-oij): client form auto-populates after linking client

## Tasks

### Task 1: Replace `defaultValues` with `values` in ClientTab useForm — DONE

Verification ran:

- `npx tsc --noEmit -p .` → only pre-existing `.next/types/validator.ts` build-artifact errors (4 errors, all in `app/(auth)/*` route-group declaration files unrelated to this change). **No new errors related to `client-tab.tsx`.**
- `npx vitest run tests/unit` → 928 passed / 43 failed / 3 todo. All 43 failures are in unrelated test files (`admin-actions`, `blog-actions`, `seo-actions`, `admin-dashboard`, `admin-gate`, `translate-route`, `wizard-client-only`, `provider-factory`, `app-icons`, `dashboard`, `queries/auth`, `cleanup-route-auth`, `bulk-adjust-dialog`, `transcribe-audio-job`, `globals-brand-tokens`, `company-members-migration`, `jobs-status`) — zero failures reference `client-tab` or `ClientTab`. Per scope boundary rules, these pre-existing failures are out of scope for this quick task.
- Done-criteria check: file contains `values:` (confirmed via `git diff`), no new tsc errors on touched file, no regressions in `client-tab`-adjacent tests (none exist for this component).

Commit: `c8ff358`

### Task 2: Manual verification — link client, confirm form populates — DEFERRED

This is a `checkpoint:human-verify` task. Per the executor constraints for this non-interactive run, the behavioral verification is **deferred to the user** because it requires browser interaction (live link flow, toast, regression checks across multiple projects).

**The codebase change has been verified statically:**

- TypeScript compiles cleanly on the modified file (no new errors).
- The unit-test suite has no `client-tab`-related regressions (no tests target this component).
- The change is a one-line, API-equivalent swap per the react-hook-form documentation — submission semantics (`form.handleSubmit(onSubmit)` and `patchClientContactAction`) are unchanged.

**User to run when convenient** (full steps in the PLAN.md `<how-to-verify>` block, summarized here):

1. `npm run dev` → open a project with NO linked client.
2. Click "Link Client" → search → select an existing client with name + email + phone populated.
3. **Expect:** Toast "Client linked successfully" + form fields **pre-filled** with the selected client's data (this is the primary fix).
4. **Regression check 1:** open a project that already has a linked client → form pre-populates on initial load (unchanged behavior).
5. **Regression check 2:** edit a field, hit Save → toast "Client updated", value persists after refresh (submission flow unchanged).
6. **Trade-off check (informational):** in a linked-client project, edit a field WITHOUT saving, navigate away and back — the form will re-sync from `project.client` and discard the unsaved edit. This is the expected/accepted behavior documented above under "Behavioral Trade-off."

## Deviations from Plan

None — plan executed exactly as written. Task 2 (manual verification) was deferred per orchestrator instructions for this non-interactive run; the code change itself was implemented exactly as specified in Task 1 (one-line swap, no extra changes to JSX, `onSubmit`, or surrounding components).

## Self-Check: PASSED

- **File exists:** `components/workspace/client-tab.tsx` — FOUND
- **Diff applied correctly:** confirmed via `git diff` — only the single intended line changed (`-    defaultValues: {` / `+    values: {`)
- **Commit exists:** `c8ff358` — FOUND in git log (`fix(quick-260525-oij): client form auto-populates after linking client`)
- **Done criteria met:** `values:` present on `useForm` call, tsc clean on touched file, no `client-tab` test regressions
- **Constraints honored:** code-only commit (no docs artifacts in `c8ff358`), commit prefix `fix(quick-260525-oij):` correct, ROADMAP.md untouched
