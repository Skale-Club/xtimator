---
quick_id: 260525-wdj
mode: quick
description: Fix "Edit manually" navigation after audio transcription failure — land in the created project workspace, not /projects list
status: completed
created: 2026-05-25
must_haves:
  truths:
    - In the New Project popup flow, when audio transcription fails and the user clicks "Edit manually", the app navigates to `/projects/{projectId}` (the project workspace), NOT to `/projects` (list page).
    - The fullscreen capture variant (`/projects/[id]/capture`) is unchanged — it already routed to `/projects/{projectId}` because `onCancel` was undefined; behavior preserved.
    - The popup chrome (X button / overlay click) continues to close via the existing `onCancel`/`handleCancel` path (no regression on close).
  artifacts:
    - components/capture/capture-recorder.tsx (onEditManually handler simplified to always router.push)
  key_links:
    - components/capture/capture-recorder.tsx
    - components/projects/estimate-creation-popup.tsx
    - components/projects/new-project-wizard.tsx
    - app/(capture)/projects/[id]/capture/capture-client.tsx
---

# Quick Task 260525-wdj: Fix "Edit manually" navigation after audio transcription failure

## Problem

When a user is in the New Project popup flow:

1. User creates a new project → record audio → transcription fails
2. The `<CaptureFailure />` fallback UI offers an **"Edit manually"** button
3. **Current behavior:** clicking it returns the user to `/projects` (the projects list page)
4. **Expected behavior:** clicking it should drop the user into the just-created project workspace at `/projects/{projectId}`, where they can continue manually via the tabs (transcript editor, notes, photos, etc.)

## Root cause

`components/capture/capture-recorder.tsx` — `onEditManually` callback (around line 546-553) had a branch:

```ts
onEditManually={() => {
  toast.info(t('Continue manually in the workspace tabs.'))
  if (onCancel) {
    onCancel()
  } else {
    router.push(`/projects/${projectId}`)
  }
}}
```

- In **popup variant** (used by `estimate-creation-popup.tsx` → spawned from `new-project-wizard.tsx`), the parent passes `onCancel = handleCancel`. `handleCancel` only calls `clearParams()` — it removes `?capture=...&projectId=...` from the URL. Since the popup was opened from `/projects?modal=new-project`, clearing the params leaves the user on `/projects` (the list). Bug.
- In **fullscreen variant** (`app/(capture)/projects/[id]/capture/capture-client.tsx`), the parent does NOT pass `onCancel`, so the `else` branch runs `router.push(\`/projects/${projectId}\`)`. Correct.

## Fix

Make `onEditManually` unconditionally route to the project workspace. The `onCancel` prop stays in the signature (popup still needs to pass `handleCancel` for the X/overlay-close path, owned by the parent `Dialog`'s `onOpenChange`, not by the recorder itself).

## Tasks

### Task 1: Rewrite `onEditManually` to always router.push to project workspace

**Files:** `components/capture/capture-recorder.tsx`

**Action:**
- Replace the `if (onCancel) { onCancel() } else { router.push(...) }` block with a single `router.push(\`/projects/${projectId}\`)` call after the toast.
- Keep `onCancel` in the prop signature (callers still pass it; popup chrome relies on `handleCancel` for X/overlay close).
- Suppress the now-unused-parameter lint warning with a targeted `// eslint-disable-next-line @typescript-eslint/no-unused-vars` and a short comment explaining why the prop remains.

**Verify:**
- `npx tsc --noEmit` clean.
- `npx eslint components/capture/capture-recorder.tsx` returns no new errors/warnings vs HEAD baseline.

**Done when:**
- Diff is the single 6-line edit in `onEditManually` + the eslint-disable + comment.
- TypeScript and lint pass at baseline.

### Task 2 (checkpoint:human-verify): Manual UX verification

**Action (user):**
1. Desktop browser:
   - From dashboard, open "New Project" → fill required fields → choose **Audio** capture mode.
   - Record short audio → stop. (Simulate transcription failure: temporarily block the transcribe API, or run with a known-broken audio sample.)
   - When `<CaptureFailure />` shows, click **"Edit manually"**.
   - Expected: navigate to `/projects/{newProjectId}` (the workspace), NOT back to `/projects`.
2. Mobile (iOS Safari + Android Chrome): repeat the same flow on real devices.
3. Regression check: from the same popup, click the **X** (top-right) — the popup should close and URL should just lose the `capture`/`projectId` params (back to `/projects?modal=new-project`-ish). No navigation into the project.

**Done when:** all three flows behave as described.

## Why no automated tests

No existing tests in `tests/unit/capture/**` (empty directory). Setting up React Testing Library + router mocks for a 4-line navigation fix would exceed quick-task budget, and the verification path (mobile capture flow) is unavoidably manual anyway.
