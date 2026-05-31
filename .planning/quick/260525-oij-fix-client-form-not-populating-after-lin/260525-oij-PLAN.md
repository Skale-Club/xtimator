---
phase: quick-260525-oij
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/workspace/client-tab.tsx
autonomous: false
requirements:
  - QUICK-OIJ-01
must_haves:
  truths:
    - "After selecting an existing client in LinkClientCard, the ClientTab name/email/phone fields auto-populate with that client's data on the same screen (no manual reload)."
    - "When the linked client's underlying record changes (e.g. edited in another tab and the workspace re-renders), the ClientTab form reflects the updated values."
    - "The Save button still successfully calls patchClientContactAction with the values shown in the form (submission behavior unchanged)."
  artifacts:
    - path: "components/workspace/client-tab.tsx"
      provides: "useForm call configured with `values` (not `defaultValues`) sourced from project.client so the form re-syncs whenever the parent re-renders with a newly linked or updated client."
      contains: "values:"
  key_links:
    - from: "components/workspace/link-client-card.tsx"
      to: "components/workspace/client-tab.tsx"
      via: "linkProjectToClient -> router.refresh() -> server re-fetch -> ProjectDetail.client populated -> ClientTab re-renders -> useForm({ values: { name, email, phone } }) syncs form state"
      pattern: "values:\\s*\\{"
---

<objective>
Fix bug where, after linking an existing client to a project via `LinkClientCard`, the `ClientTab` form fields (name, email, phone) remain empty instead of auto-populating with the linked client's contact data.

Purpose: react-hook-form's `defaultValues` is captured once on mount. When `ClientTab` first mounts with `project.client = null` (no client linked), the form initializes empty. After `linkProjectToClient` succeeds and `router.refresh()` re-fetches with the client populated, the early return at line 51 no longer fires — but the form state is still the empty initial mount state. The fix is to use `values` (the documented react-hook-form API for keeping form state synced with a changing external source) instead of `defaultValues`.

Output: `components/workspace/client-tab.tsx` updated so the form re-syncs whenever `project.client` changes; manual verification confirms the form populates immediately after linking.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@components/workspace/client-tab.tsx
@components/workspace/link-client-card.tsx
@lib/actions/project.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from the codebase. -->
<!-- Use these directly — no further exploration needed. -->

From components/workspace/client-tab.tsx (current, buggy):
```tsx
const form = useForm({
  defaultValues: {
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
  },
})
```

From lib/queries/project.ts (ProjectDetail shape — relevant fields only):
```ts
// project.client is either null or:
// { id: string; name: string; email: string | null; phone: string | null; ... }
```

From lib/actions/client.ts:
```ts
export async function patchClientContactAction(
  clientId: string,
  patch: { name: string; email: string | null; phone: string | null }
): Promise<{ error?: string }>;
```

react-hook-form `values` prop (per https://react-hook-form.com/docs/useform#values):
- Like `defaultValues`, but reactively updates form state whenever the `values` reference changes.
- Submission flow (`form.handleSubmit(onSubmit)`) is identical — `values` only affects how external prop changes propagate into the form.
- Caveat: `values` overrides user-edited fields when it changes. That is the desired behavior here — when the parent re-renders with a freshly linked client, we want the form to reflect that client's data.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace `defaultValues` with `values` in ClientTab useForm</name>
  <files>components/workspace/client-tab.tsx</files>
  <action>
In `components/workspace/client-tab.tsx`, change the `useForm` call (currently lines 26-32) from `defaultValues` to `values`:

```tsx
const form = useForm({
  values: {
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
  },
})
```

Rationale: `defaultValues` is read once at mount. `values` re-syncs whenever the object's contents change across renders. When `LinkClientCard` calls `linkProjectToClient` + `router.refresh()`, the parent server component re-fetches `ProjectDetail` with `project.client` populated, and ClientTab re-renders. With `values`, the form state will pick up `client.name/email/phone` on that re-render instead of remaining stuck on the initial empty mount state.

Notes / non-goals:
- Do NOT change the JSX, the early `if (!client) return <LinkClientCard />` branch, the `onSubmit` handler, or `patchClientContactAction` invocation. The submission flow is unaffected by `values` vs `defaultValues` (react-hook-form processes both identically at submit time).
- Do NOT add a `useEffect` + `form.reset(...)` workaround — `values` is the idiomatic react-hook-form API for this exact case (controlled external source).
- Do NOT touch `link-client-card.tsx` or `lib/actions/project.ts`. The link path (server action + `router.refresh()`) already works correctly; the bug is purely on the form-sync side.
- Keep the existing `client?.name ?? ''` fallbacks — these handle the brief render window after `router.refresh()` where `client` may transiently be null again, and also keep TypeScript happy with `null`-able email/phone.
  </action>
  <verify>
    <automated>cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && npx tsc --noEmit -p . 2>&1 | head -50 && npx vitest run tests/unit --reporter=basic 2>&1 | tail -30</automated>
  </verify>
  <done>
- File `components/workspace/client-tab.tsx` contains `values:` (not `defaultValues:`) on the `useForm` call.
- `npx tsc --noEmit` passes with no new errors related to this file.
- Existing unit tests under `tests/unit/` continue to pass (no regressions; no tests target this specific component, and the change is API-equivalent for submission semantics).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manual verification — link client, confirm form populates</name>
  <what-built>
ClientTab's `useForm` now uses `values` instead of `defaultValues`, so the name/email/phone fields auto-populate when an existing client is linked via LinkClientCard (which calls `router.refresh()` after `linkProjectToClient`).
  </what-built>
  <how-to-verify>
1. Start the dev server: `npm run dev` (or `bun dev`).
2. Sign in and open (or create) a project that has NO linked client. The Client tab should show the "Link a Client" card.
3. Click "Link Client" → search for an existing client that has name + email + phone populated → select it.
4. **Expected:** Toast "Client linked successfully" appears, the LinkClientCard is replaced by the contact form, and the Name / Email / Phone fields are **pre-filled with the selected client's data** (not empty).
5. Edit a field (e.g. append a character to name) and click Save → toast "Client updated" appears; the saved value persists after refresh.
6. **Regression check:** Open a separate project that already has a linked client → confirm the form still pre-populates on initial load (no regression on the existing-client path).
7. **Regression check:** In a project with a linked client, edit the email field but DO NOT save. Then navigate to another tab and back. Note: with `values`, the form will re-sync from `project.client` and discard the un-saved edit — this is the expected behavior (the source of truth is the server). Confirm this matches expectations.
  </how-to-verify>
  <resume-signal>Type "approved" if all three checks pass, or describe any issue (e.g. "fields still empty after link", "regression on existing-client load").</resume-signal>
</task>

</tasks>

<verification>
- TypeScript clean (`npx tsc --noEmit`).
- Existing `tests/unit/` suite passes (no behavioral test for this component currently; the fix is a small API-equivalent change covered by manual UX verification).
- Manual: linking flow produces a populated form in one render cycle, with no page reload.
</verification>

<success_criteria>
- ClientTab form fields auto-populate immediately after linking an existing client (the bug described in `<root_cause>` is gone).
- Existing-client load path (open a project that already has a client) continues to populate correctly — no regression.
- Save flow continues to work: `patchClientContactAction` is called with current form values and the toast/refresh path is unchanged.
- `npx tsc --noEmit` and the existing `tests/unit/` suite both pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260525-oij-fix-client-form-not-populating-after-lin/260525-oij-SUMMARY.md` documenting:
- The one-line fix (`defaultValues` → `values`).
- Why this is the correct react-hook-form idiom (link to the docs URL referenced in constraints).
- The behavioral trade-off documented in Task 2 step 7 (unsaved edits get discarded if the parent re-renders with new `project.client` data — acceptable because the server is the source of truth and the user has an explicit Save button).
</output>
