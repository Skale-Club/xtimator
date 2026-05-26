# Deferred Items — 260526-jo4

Out-of-scope lint findings encountered during execution (NOT introduced by this plan):

## Pre-existing lint warnings/errors

**1. `components/workspace/project-workspace.tsx:66` — `react-hooks/set-state-in-effect` error**
- Pattern: `setActiveTab(queryTab as WorkspaceTab)` called synchronously inside `useEffect`
- Pre-existing on `main` at commit `fd42fb0` — unrelated to logo plumbing
- Out of scope for this quick task

**2. `components/workspace/project-workspace.tsx:43` — `stats` defined but never used**
- Pre-existing unused destructured prop
- Out of scope

**3. `components/workspace/estimate/estimate-editor.tsx:136` — `photos` defined but never used**
- Pre-existing unused destructured prop
- Out of scope
