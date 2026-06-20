---
phase: quick-260620-lqh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/settings/account-section.tsx
  - app/(app)/settings/(tabs)/account/loading.tsx
autonomous: true
requirements:
  - QUICK-LQH-01
user_setup: []

must_haves:
  truths:
    - "The account settings panel shows Change Password and Change Email, but NO Danger Zone / Delete Account section"
    - "The account loading skeleton matches the new layout (no Danger Zone card)"
    - "Project compiles under TypeScript strict with no unused-import or unused-var lint errors"
  artifacts:
    - path: "components/settings/account-section.tsx"
      provides: "Account section with only Change Password + Change Email blocks"
      contains: "Change Email"
    - path: "app/(app)/settings/(tabs)/account/loading.tsx"
      provides: "Account loading skeleton without Danger Zone card"
  key_links:
    - from: "components/settings/account-section.tsx"
      to: "@/lib/actions/settings"
      via: "import"
      pattern: "changePassword, changeEmail"
---

<objective>
Remove the self-account-deletion UI affordance ("Danger Zone" / "Delete Account") from the account settings panel. The user decided this control does not belong in the settings UI.

Purpose: Eliminate the UI path for self-deletion while leaving the backend `deleteAccount` server action untouched (it may be wired to other flows or kept for future admin use).
Output: Cleaned `account-section.tsx` (Danger Zone block + now-unused imports/state removed) and a matching `loading.tsx` skeleton.

Scope guardrails (do NOT exceed):
- UI-only change. No backend, route, or DB changes.
- Do NOT remove or modify the `deleteAccount` export in `lib/actions/settings.ts` — it stays in place (unused).
- Keep the Change Password and Change Email blocks fully intact.
- Only remove imports/state/handlers that are GENUINELY no longer referenced after the deletion — verify each before removing.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/settings/account-section.tsx
@app/(app)/settings/(tabs)/account/loading.tsx

<facts>
Verified during planning (current state of the files):

components/settings/account-section.tsx
- Lines 209-242 contain the Delete Account block: a `{/* Delete Account */}` `<div className="grid ...">` wrapping the Danger Zone heading, description, and the `<AlertDialog>` with the Delete Account button.
- Line 207 is the `<Separator />` that precedes the Delete Account block (between Change Email and Danger Zone). It must be removed together with the Delete Account block (otherwise a trailing separator dangles after Change Email).
- Line 174 has another `<Separator />` between Change Password and Change Email — this one STAYS. The `Separator` import (line 17) remains used.
- `deleteAccount` is imported on line 11 alongside `changePassword, changeEmail`. After removal, change the import to `import { changePassword, changeEmail } from '@/lib/actions/settings'`.
- `useRouter` is imported on line 4. `const router = useRouter()` on line 54. `router` is used ONLY on line 109 inside `onDeleteAccount` (confirmed via grep — only two occurrences: the declaration and the .push call). Both the import and the const become unused → remove both.
- `const [isPendingDelete, startDeleteTransition] = useTransition()` on line 57 is used only by the delete flow → remove. `useTransition` import (line 3) STAYS (still used by password + email transitions).
- `onDeleteAccount` handler is lines 102-112 → remove entirely.
- AlertDialog* imports (lines 18-28): `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogTrigger` — all used ONLY inside the Delete Account block → remove the whole import statement.
- `Loader2` (line 8) STAYS — still used by password + email submit buttons.
- `toast` (line 9) and `useTranslation`/`t` STAY — used by remaining blocks.

app/(app)/settings/(tabs)/account/loading.tsx
- Lines 47-52 contain a dedicated Danger Zone skeleton: `<SettingsCard className="border-destructive/30">` with `<SettingsSection title="Danger Zone" ... />` → remove this entire `<SettingsCard>...</SettingsCard>` block.
- The doc comment (lines 9-14) lists "Delete Account danger card" — update the comment to drop that line so it stays accurate.
- `Skeleton`, `SettingsShellSkeleton`, `SettingsPageSkeleton`, `SettingsSection`, `SettingsCard` imports all remain used by the Password and Email skeleton cards → keep all imports.
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Danger Zone block and now-unused code from account-section.tsx</name>
  <files>components/settings/account-section.tsx</files>
  <action>
Edit components/settings/account-section.tsx to remove the self-deletion UI and everything that becomes unused. Make these precise changes:

1. Remove the JSX: delete the `<Separator />` at line 207 (the one immediately before the `{/* Delete Account */}` comment) AND the entire Delete Account block (`{/* Delete Account */}` comment + the `<div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">...</div>` that contains the Danger Zone heading, description, and the `<AlertDialog>...</AlertDialog>`). After this, the JSX ends with the Change Email block, then `</CardContent></Card>`. Do NOT remove the `<Separator />` at line 174 (between Change Password and Change Email).

2. Fix the settings import (line 11): change `import { changePassword, changeEmail, deleteAccount } from '@/lib/actions/settings'` to `import { changePassword, changeEmail } from '@/lib/actions/settings'`.

3. Remove the entire `AlertDialog*` import statement (the multi-line `import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'`).

4. Remove the `useRouter` import line (`import { useRouter } from 'next/navigation'`) AND the `const router = useRouter()` line — both are now unused (grep confirmed router was only referenced inside onDeleteAccount).

5. Remove `const [isPendingDelete, startDeleteTransition] = useTransition()`. Keep `useTransition` imported (still used by password/email).

6. Remove the entire `onDeleteAccount` handler function.

Keep intact: `useTransition` import, `Separator` import, `Loader2`, `toast`, `useTranslation`, the password and email schemas/forms/handlers, and both remaining blocks. Do not touch `lib/actions/settings.ts`.
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && npx tsc --noEmit -p tsconfig.json && npx eslint components/settings/account-section.tsx</automated>
  </verify>
  <done>account-section.tsx renders only Change Password and Change Email blocks. No references remain to deleteAccount, onDeleteAccount, isPendingDelete, startDeleteTransition, useRouter, router, or any AlertDialog* symbol. tsc --noEmit passes; eslint reports no unused-import/unused-var errors for the file.</done>
</task>

<task type="auto">
  <name>Task 2: Remove Danger Zone skeleton from account loading.tsx</name>
  <files>app/(app)/settings/(tabs)/account/loading.tsx</files>
  <action>
Edit app/(app)/settings/(tabs)/account/loading.tsx:

1. Remove the entire Danger Zone skeleton card — the `<SettingsCard className="border-destructive/30">...</SettingsCard>` block that contains `<SettingsSection title="Danger Zone" ... />` and its `<Skeleton className="h-10 w-36 rounded-md" />`. After removal, the skeleton ends with the Change Email `<SettingsCard>` followed by `</SettingsPageSkeleton></SettingsShellSkeleton>`.

2. Update the doc comment block at the top of the function: remove the `- Delete Account danger card` bullet so the comment accurately describes the remaining Password + Email skeleton layout.

Keep all imports (Skeleton, SettingsShellSkeleton, SettingsPageSkeleton, SettingsSection, SettingsCard) — they are still used by the Password and Email skeleton cards.
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && npx eslint "app/(app)/settings/(tabs)/account/loading.tsx" && grep -c "Danger Zone" "app/(app)/settings/(tabs)/account/loading.tsx"</automated>
  </verify>
  <done>loading.tsx no longer contains a Danger Zone skeleton card (grep count is 0). All imports still resolve and are used. eslint reports no unused-import errors.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (TypeScript strict, no errors) across the project.
- `npx eslint components/settings/account-section.tsx "app/(app)/settings/(tabs)/account/loading.tsx"` reports no errors (specifically no `@typescript-eslint/no-unused-vars` for removed symbols).
- Manual grep confirms account-section.tsx and loading.tsx contain no remaining references to: `deleteAccount`, `onDeleteAccount`, `isPendingDelete`, `startDeleteTransition`, `useRouter`, `AlertDialog`, `Danger Zone`, `Delete Account`.
- `lib/actions/settings.ts` is UNCHANGED — `deleteAccount` export still present.
</verification>

<success_criteria>
- The /settings account panel renders only Change Password and Change Email — no Danger Zone / Delete Account UI.
- The account loading skeleton matches the new two-card layout.
- Project compiles under TypeScript strict with zero unused-import / unused-var lint errors.
- `deleteAccount` server action remains intact in lib/actions/settings.ts.
</success_criteria>

<output>
After completion, create `.planning/quick/260620-lqh-remove-danger-zone-delete-account-sectio/260620-lqh-SUMMARY.md`
</output>
