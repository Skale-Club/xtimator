---
phase: quick
plan: 260527-jid
type: execute
wave: 1
depends_on: []
files_modified:
  - components/projects/estimate-creation-popup.tsx
autonomous: true
requirements: [QUICK-FIX-POPUP-NAV]

must_haves:
  truths:
    - "Completing a recording for a NEW project navigates the user to /projects/[id] (the created project page)"
    - "Completing a recording for an EXISTING project still shows the freshly-generated estimate on its page (router.refresh still fires)"
    - "The recording popup closes after completion (isOpen flips false once ?capture/?projectId params are gone)"
    - "Cancel and Dialog close paths are unchanged (clearParams still used there)"
  artifacts:
    - path: "components/projects/estimate-creation-popup.tsx"
      provides: "handleComplete() that navigates via router.push without a racing router.replace"
      contains: "router.push(`/projects/${projectId}`)"
  key_links:
    - from: "handleComplete()"
      to: "/projects/[id] route"
      via: "router.push (no preceding clearParams/router.replace)"
      pattern: "router\\.push\\(`/projects/\\$\\{projectId\\}`\\)"
---

<objective>
Fix the new-project recording popup not navigating to the created project page on completion.

Purpose: In `components/projects/estimate-creation-popup.tsx`, `handleComplete()` calls `clearParams()` (which fires `router.replace(...)`) immediately before `router.push('/projects/${projectId}')` in the same tick. In the Next.js App Router these two navigation calls race and the `push` gets dropped. For a NEW project the popup is open on `/projects` (the list), so `replace` targets `/projects` while `push` targets `/projects/[id]` — two different URLs — leaving the user stranded on the list. For an existing-project record both target the same `/projects/[id]` URL, so no race is observable and it works today.

Output: A corrected `handleComplete()` that drops the redundant `clearParams()` call and relies on `router.push` to produce a params-free URL (which lets the Dialog's `isOpen` flip to `false` on its own), followed by `router.refresh()`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@components/projects/estimate-creation-popup.tsx

<interfaces>
<!-- Current handleComplete (lines 96-103) — the ONLY function to change: -->
```typescript
function handleComplete() {
  if (!projectId) return
  clearParams()
  // Overview is now the live estimate (project A R3). Navigate there and
  // refresh so the freshly-generated estimate is visible immediately.
  router.push(`/projects/${projectId}`)
  router.refresh()
}
```

<!-- clearParams (lines 65-71) — DO NOT MODIFY. Still used by handleCancel + Dialog onOpenChange: -->
```typescript
function clearParams() {
  const params = new URLSearchParams(searchParams.toString())
  params.delete(CAPTURE_PARAM)
  params.delete(PROJECT_ID_PARAM)
  const q = params.toString()
  router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
}
```

<!-- isOpen (line 57) is derived from the URL params; router.push to a params-free URL flips it false: -->
```typescript
const isOpen = isCaptureMode(mode) && !!projectId
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove redundant clearParams() from handleComplete() to fix the replace+push race</name>
  <files>components/projects/estimate-creation-popup.tsx</files>
  <action>
Edit ONLY the `handleComplete()` function (currently lines 96-103). Remove the `clearParams()` call. Keep `if (!projectId) return`, keep `router.push(`/projects/${projectId}`)`, and keep `router.refresh()`. Replace the existing comment with one explaining WHY clearParams() is intentionally NOT called here.

Resulting function:

```typescript
function handleComplete() {
  if (!projectId) return
  // Navigate straight to the project page. Do NOT call clearParams() here:
  // clearParams() fires router.replace(), and a synchronous replace + push in
  // the same tick races in the App Router — the push gets dropped (broke the
  // new-project flow, which opens on /projects so replace and push target
  // different URLs). router.push to /projects/[id] yields a URL with no
  // ?capture/?projectId params, so the Dialog's isOpen flips to false and the
  // popup closes on its own — clearParams() is redundant. refresh() is still
  // needed for the same-route existing-project record case so the freshly
  // generated estimate shows.
  router.push(`/projects/${projectId}`)
  router.refresh()
}
```

CONSTRAINTS:
- Do NOT touch `clearParams()` itself (lines 65-71) — still used by `handleCancel()` and the Dialog `onOpenChange` close path.
- Do NOT change `handleCancel()`, the `useEffect`, the `Dialog`/`onOpenChange` close path, or any imports.
- No new dependencies. No behavior change to cancel/close paths.
  </action>
  <verify>
    <automated>cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
- `handleComplete()` no longer calls `clearParams()`.
- `handleComplete()` still has `if (!projectId) return`, `router.push(`/projects/${projectId}`)`, and `router.refresh()`.
- The comment explains the replace+push race and why clearParams() is omitted.
- `clearParams()`, `handleCancel()`, and the Dialog `onOpenChange` close path are unchanged.
- `tsc --noEmit` passes with no new errors.
  </done>
</task>

</tasks>

<verification>
- Type check: `npx tsc --noEmit` passes.
- Grep confirms `handleComplete` contains `router.push` + `router.refresh` and NO `clearParams()` call:
  `clearParams()` appears only inside `handleComplete`'s sibling functions (`useEffect` bad-projectId branch, `handleCancel`, and `onOpenChange`), not in `handleComplete`.
- Manual (optional, not blocking): On `/projects`, start a NEW project recording, complete it → lands on `/projects/[id]`. Start an EXISTING-project recording, complete it → stays on `/projects/[id]` with the new estimate visible.
</verification>

<success_criteria>
- New-project recording completion navigates to `/projects/[id]` (race fixed).
- Existing-project recording completion still refreshes and shows the new estimate.
- Popup closes after completion (params-free URL flips isOpen false).
- Cancel/close paths untouched.
- No type errors, no new dependencies.
</success_criteria>

<output>
After completion, create `.planning/quick/260527-jid-fix-new-project-recording-popup-not-open/260527-jid-SUMMARY.md`
</output>
