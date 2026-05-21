---
phase: quick-260521-nkp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/workspace/estimate/estimate-floating-actions.tsx
autonomous: false
requirements:
  - QUICK-260521-NKP-01
must_haves:
  truths:
    - "On a clean draft (idle/error state), the floating cluster is visible with Consolidate enabled and Save draft + Discard disabled."
    - "Right after saving a dirty draft (status === 'saved'), the green 'Saved' pulse pill still appears."
    - "After the saved pulse expires (or any other clean non-saved state), the full cluster reappears."
    - "On a dirty draft, the cluster works as before (Discard, Save draft, Consolidate all enabled, with Save disabling itself when not dirty)."
    - "On a consolidated current version, only the 'New Version' floating button renders (unchanged)."
    - "On a non-current version, nothing renders (unchanged)."
  artifacts:
    - path: "components/workspace/estimate/estimate-floating-actions.tsx"
      provides: "EstimateFloatingActions component with always-visible Consolidate on drafts"
      contains: "Consolidate"
  key_links:
    - from: "components/workspace/estimate/estimate-floating-actions.tsx"
      to: "EstimateFloatingActions consumers (estimate-editor.tsx)"
      via: "props (workflowStatus, isCurrent, isDirty, status, onConsolidate)"
      pattern: "EstimateFloatingActions"
---

<objective>
Fix the bug where users with a saved-but-not-consolidated draft cannot reach the Consolidate button without faking an edit. Make Consolidate always visible on a current draft, while Save Draft and Discard correctly disable themselves when there is nothing to save/discard. Preserve the brief "Saved" pulse feedback right after a successful save.

Purpose: Removes a sharp edge in the estimate workflow where users had to artificially dirty a draft to consolidate it.
Output: A 1-file diff (≲ 10 lines net) to `components/workspace/estimate/estimate-floating-actions.tsx`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@components/workspace/estimate/estimate-floating-actions.tsx
@components/workspace/estimate/estimate-editor.tsx
@components/workspace/send/send-tab.tsx

<interfaces>
<!-- Existing props on EstimateFloatingActions (from estimate-floating-actions.tsx:17-29). -->
<!-- Do NOT change this interface — only the internal render logic. -->

```typescript
type Status = 'idle' | 'saving' | 'saved' | 'error'

interface EstimateFloatingActionsProps {
  workflowStatus: 'draft' | 'consolidated'
  isCurrent: boolean
  isDirty: boolean
  status: Status
  onSaveDraft: () => void
  onConsolidate: () => void
  onDiscard: () => void
  onNewVersion: () => void
  isNewVersionPending?: boolean
}
```

<!-- Caller (estimate-editor.tsx:430-442) already passes the correct props — no caller changes needed. -->
<!-- send-tab.tsx is downstream of `workflow_status` flipping but reads `estimate.workflow_status` directly from server data; no coupling to floating actions. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Always render the action cluster on a current draft; show "Saved" pulse only briefly</name>
  <files>components/workspace/estimate/estimate-floating-actions.tsx</files>
  <action>
Modify `EstimateFloatingActions` so that on a current draft (`isCurrent === true` and `workflowStatus === 'draft'`) the full action cluster (Discard / Save draft / Consolidate) renders for every state EXCEPT the brief post-save success window, which keeps showing the green "Saved" pulse pill.

Concretely, in `components/workspace/estimate/estimate-floating-actions.tsx`:

1. Replace the current clean-branch guard (currently lines 77-91):
   ```ts
   // Draft, clean: brief "Saved" pulse, otherwise nothing.
   if (!isDirty && status !== 'saving') {
     if (status === 'saved') {
       return ( /* saved pulse */ )
     }
     return null
   }
   ```
   with a narrower branch that ONLY short-circuits for the saved pulse:
   ```ts
   // Draft: show the brief "Saved" pulse right after a successful save.
   // Every other draft state (clean+idle, clean+error, dirty, saving) falls
   // through to the action cluster below.
   if (!isDirty && status === 'saved') {
     return ( /* unchanged saved-pulse JSX */ )
   }
   ```
   Keep the saved-pulse JSX identical (same classes, same icon, same wrapper, same `paddingBottom: 'env(safe-area-inset-bottom)'`).

2. Update the in-file comment block at the top of the function body (lines 31-38 doc comment and inline comments) so it reflects the new behavior:
   - Change "Draft + clean: hidden (status briefly shown after save)" → "Draft + clean: Save Draft & Discard disabled, Consolidate enabled"
   - Update the inline `// Draft, dirty (or currently saving): show the action cluster.` comment (line 93) to `// Draft: render the action cluster (Save/Discard disabled when clean, Consolidate always enabled).`

3. In the Discard `<Button>` (currently line 107), change `disabled={isSaving}` to `disabled={isSaving || !isDirty}`. This mirrors the Save draft button's disabled condition so users cannot "discard" when there is nothing to discard.

4. Leave the Save draft button untouched (already `disabled={isSaving || !isDirty}`).

5. Leave the Consolidate button untouched (already `disabled={isSaving}` — clickable on a clean draft).

6. Do NOT touch:
   - The `!isCurrent` early return (line 51).
   - The `workflowStatus === 'consolidated'` branch (lines 54-75).
   - The component signature, the props interface, the imports, or any caller.
   - `estimate-editor.tsx`, `send-tab.tsx`, the reducer, or `handleConsolidate`.

Diff should be ≲ 10 net lines (a few line removals, a few comment tweaks, and one `|| !isDirty` addition).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `components/workspace/estimate/estimate-floating-actions.tsx` compiles under `tsc --noEmit` with no new errors.
- The clean-draft guard short-circuits ONLY when `!isDirty && status === 'saved'`; all other branches fall through to the cluster.
- The Discard button's `disabled` is `isSaving || !isDirty`.
- The Save draft button's `disabled` is unchanged (`isSaving || !isDirty`).
- The Consolidate button's `disabled` is unchanged (`isSaving`).
- The `!isCurrent` early return and the consolidated branch are byte-identical to before.
- Props interface and component signature are byte-identical to before.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
EstimateFloatingActions now always exposes the Consolidate button on a current draft, with Save Draft and Discard correctly disabled when the draft is clean. The "Saved" pulse pill is still shown briefly right after `handleSaveDraft` succeeds.
  </what-built>
  <how-to-verify>
Run the dev server (e.g. `npm run dev` or the project's standard dev command — uses proxy.ts + Inngest local setup per the user's MEMORY note) and exercise these states on an estimate page:

1. **Clean draft, idle** — Open an existing draft estimate (or reload right after a save so the in-memory state is clean). Expected: bottom-right shows the cluster with Discard (disabled, greyed), Save draft (disabled, greyed), Consolidate (enabled). Clicking Consolidate opens the confirmation dialog.

2. **Dirty draft** — Edit any field (e.g. summary or an item quantity). Expected: all three buttons enabled. Save draft and Discard now usable.

3. **Saved pulse** — From a dirty state, click Save draft. Expected: the cluster is replaced by the green "Saved" pulse pill for ~2.5s, then the cluster reappears with Save/Discard disabled (clean state) and Consolidate enabled.

4. **Consolidated current** — Consolidate the estimate. Expected: only the "New Version" floating button shows (unchanged behavior).

5. **Old version (non-current)** — Switch to a previous version via the version selector. Expected: nothing renders in the floating area (unchanged).

6. **Saving in flight** — While Save draft is in flight, all three buttons should be disabled (existing `isSaving` behavior must still apply to Discard and Consolidate).

Confirm: in case 1, you can now click Consolidate without first editing anything — this is the bug fix.
  </how-to-verify>
  <resume-signal>Type "approved" if all six states behave as described, or describe any issue (e.g. "saved pulse no longer appears", "Discard stays enabled on clean state").</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no new errors introduced by this change.
- Manual verification (above) confirms all six rendering states behave correctly.
- The diff is constrained to `components/workspace/estimate/estimate-floating-actions.tsx` only.
</verification>

<success_criteria>
- Bug fixed: a clean-but-saved draft can be consolidated without manufacturing a fake edit.
- No regressions: Saved pulse, consolidated branch, non-current branch, saving-in-flight state all unchanged.
- No new component, no prop rename, no caller change, no reducer / server-action change.
- Net diff under ~10 lines in a single file.
</success_criteria>

<output>
After completion, create `.planning/quick/260521-nkp-sempre-mostrar-consolidate-em-drafts-no-/260521-nkp-SUMMARY.md` documenting:
- The 4 narrow changes (guard narrowing, two comment tweaks, Discard disabled condition).
- The 6 verified rendering states.
- Any deviation from the implementation hint (there should be none).
</output>
