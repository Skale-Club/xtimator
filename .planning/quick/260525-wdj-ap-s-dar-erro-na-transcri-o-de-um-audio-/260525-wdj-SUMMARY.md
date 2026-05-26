# Quick Task 260525-wdj — Summary

**Description:** Fix "Edit manually" navigation after audio transcription failure — land in the created project workspace, not /projects list.

**Status:** Completed
**Date:** 2026-05-25
**Commit:** `039afb5` — `fix(quick-260525-wdj): always route "Edit manually" to project workspace`

## What changed

**Single file modified:** [components/capture/capture-recorder.tsx](../../../components/capture/capture-recorder.tsx)

Before:
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

After:
```ts
onEditManually={() => {
  toast.info(t('Continue manually in the workspace tabs.'))
  router.push(`/projects/${projectId}`)
}}
```

The `onCancel` prop is preserved in the public signature so the popup chrome (`estimate-creation-popup.tsx`) keeps compiling without changes — only the recorder's `onEditManually` handler now ignores it. A targeted `eslint-disable-next-line @typescript-eslint/no-unused-vars` + comment block at the destructuring site documents why.

## Root cause (reference)

The bug only manifested in the **popup variant** (New Project wizard flow). The popup parent passed `onCancel = handleCancel`, and `handleCancel` only calls `clearParams()` — removing `?capture=…&projectId=…` from the URL. Because the popup was opened from `/projects?modal=new-project`, clearing those params dropped the user on `/projects` (the list page) instead of the project they just created.

The **fullscreen variant** (`app/(capture)/projects/[id]/capture/capture-client.tsx`) was already correct because it doesn't pass `onCancel` — the previous `else` branch fired `router.push(\`/projects/${projectId}\`)`.

## Verification

**Automated (executed):**
- `npx tsc --noEmit` — clean.
- `npx eslint components/capture/capture-recorder.tsx` — same baseline as HEAD before the change (pre-existing `no-var` error at line 224 and 4 pre-existing `react-hooks/exhaustive-deps` warnings are out of scope; no new issues from this change).

**Manual (pending user — checkpoint:human-verify task):**
1. Desktop: New Project → audio mode → record + force transcription failure → click "Edit manually" → expect `/projects/{newProjectId}` (workspace), not `/projects`.
2. iOS Safari: repeat on a real device.
3. Android Chrome: repeat on a real device.
4. Regression: from the same popup, click the X (top-right) — popup closes, URL drops `capture`/`projectId` params, user stays on the projects list (no navigation into the project).

## Files touched

- `components/capture/capture-recorder.tsx` — 6 insertions, 5 deletions (net +1 with the eslint-disable comment).

## Notes for follow-up

- If the popup's X-close behavior ever needs to also land the user inside the project workspace (rather than just closing), revisit `estimate-creation-popup.tsx` → `handleCancel`. As of this task, that flow intentionally only clears URL params — the "Edit manually" path is the only one that pushes into the workspace.
- The `onCancel` prop is now unused by the recorder. If/when no caller passes it anymore, the prop and the eslint-disable comment can both be removed.
