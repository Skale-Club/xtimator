---
phase: quick-260520-jg0
plan: 01
subsystem: auth-ui
tags: [a11y, forms, radix, shadcn, signup, login]
dependency_graph:
  requires:
    - components/ui/form.tsx (FormControl = Radix Slot.Root forwarding id to first DOM child)
  provides:
    - "Correct label/htmlFor->input id wiring on all three password fields"
  affects:
    - app/(auth)/signup/signup-form.tsx
    - app/(auth)/login/login-form.tsx
tech_stack:
  added: []
  patterns:
    - "Relative-wrapper-OUTSIDE-FormControl pattern for input + adornment-button composition with Radix Slot.Root"
key_files:
  created: []
  modified:
    - app/(auth)/signup/signup-form.tsx
    - app/(auth)/login/login-form.tsx
decisions:
  - "Place <div className=\"relative\"> OUTSIDE <FormControl> so Radix Slot.Root forwards id={formItemId} to <Input> (the actual <input>) instead of the wrapper div"
  - "Preserve all classNames, autoComplete, placeholder, disabled, handlers, aria-labels, tabIndex, and {...field} spreads byte-identically"
  - "components/ui/form.tsx UNTOUCHED — fix is purely at the call site"
metrics:
  duration_min: 2.5
  completed: 2026-05-20
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
requirements:
  - QUICK-260520-JG0
---

# Quick Task 260520-jg0: Fix `<label htmlFor=...>` mismatch on signup + login Summary

One-liner: Inverted `FormControl`/relative-wrapper nesting on 3 password fields (signup x2, login x1) so the Radix `Slot.Root` id lands on the actual `<input>`, repairing the `<FormLabel htmlFor>` link and silencing the DevTools "Incorrect use of `<label for=FORM_ELEMENT>`" warning on `/signup` and `/login`.

## What Changed

Three JSX regions were restructured following the same pattern:

**BEFORE (broken — id leaked to wrapper div):**
```tsx
<FormControl>
  <div className="relative">
    <Input ... {...field} />
    <button type="button" ...>...</button>
  </div>
</FormControl>
```

**AFTER (fixed — id lands on `<input>`):**
```tsx
<div className="relative">
  <FormControl>
    <Input ... {...field} />
  </FormControl>
  <button type="button" ...>...</button>
</div>
```

### Region 1: `app/(auth)/signup/signup-form.tsx` — `password` field (lines ~95-125)
- Toggled by `showPassword` / `setShowPassword`
- Input className `input-glow-strong min-h-[44px] pr-10 transition-all`, autoComplete `new-password`
- Button className uses `right-3`, `hover:text-foreground`; icons use `h-4 w-4`

### Region 2: `app/(auth)/signup/signup-form.tsx` — `confirmPassword` field (lines ~126-156)
- Toggled by `showConfirm` / `setShowConfirm` (preserved exactly)
- Same Input/Button styling as Region 1 (signup pattern)

### Region 3: `app/(auth)/login/login-form.tsx` — `password` field (lines ~97-127)
- Toggled by `showPassword` / `setShowPassword`
- Input className `input-glow-strong min-h-[48px] border-white/10 bg-white/5 px-4 pr-12 text-white transition-all focus-visible:bg-white/10`, autoComplete `current-password`
- Button className uses `right-4`, `transition-colors hover:text-white`; icons use `size-4` (not `h-4 w-4`)

## Constraint Compliance

- `components/ui/form.tsx` **NOT modified** — the fix lives entirely at the call sites.
- The `email` fields on both pages were NOT touched — they were already correct (Input is the direct child of FormControl).
- All preserved props remain byte-identical: `className`, `autoComplete`, `placeholder`, `disabled`, `{...field}` spread, `aria-label`, `tabIndex={-1}`, `onClick`, icon JSX.
- Pre-existing uncommitted modifications on main (`components/clients/client-sheet.tsx`, `components/settings/company-info-form.tsx`, and `.planning/research/*`) were left untouched.

## Commits

| Task | Description                                              | Commit    |
| ---- | -------------------------------------------------------- | --------- |
| 1    | `fix(auth): route password input id to <input> on signup form` | `dea6091` |
| 2    | `fix(auth): route password input id to <input> on login form`  | `2e21a8a` |

## Verification

**Automated (executor-run):**
- `npx tsc --noEmit -p tsconfig.json` — zero errors on `app/(auth)/signup/signup-form.tsx`
- `npx tsc --noEmit -p tsconfig.json` — zero errors on `app/(auth)/login/login-form.tsx`

**Manual (pending — Task 3 is a `checkpoint:human-verify` gate, not auto-completable):**

> **Task 3 is PENDING HUMAN VERIFICATION.** Per the plan's checkpoint specification and execution constraints, the visual + DevTools verification on `/signup` and `/login` cannot be completed autonomously by the executor. The orchestrator should drive Task 3 manually using the steps in the PLAN.md `<how-to-verify>` block:
>
> 1. Start dev server, open browser with DevTools (Console + Elements panels)
> 2. On `/signup`: confirm no "Incorrect use of `<label for=FORM_ELEMENT>`" warning in Console; confirm Password label `for` attribute matches `<input type="password">` `id`; same for Confirm password pair; confirm eye toggles still pinned right-edge, vertically centered; confirm typing/autofill/submission/mismatch validation work
> 3. On `/login`: confirm no warning; confirm label/`for` matches input `id`; confirm eye toggle pinned at `right-4` with white/transparent styling; confirm email field unchanged
> 4. (Optional) Lighthouse / axe DevTools a11y audit — confirm no new "Form elements must have labels" violations

## Deviations from Plan

None — both auto tasks executed exactly as written. No bugs surfaced, no missing critical functionality, no blocking issues, no architectural decisions required.

## Follow-Ups (potential next quick tickets)

The same `<FormControl><div className="relative"><Input/>...</div></FormControl>` anti-pattern may exist elsewhere — worth a quick grep audit:

- `/reset-password` page (password + confirm fields)
- `/settings/security` or equivalent password-change form (if present)
- Any profile/account form that uses an adornment-button-over-input pattern (e.g., search icons inside Input, currency prefix toggles, dropdowns inside Input)

A future quick task could grep for `<FormControl>\s*<div className="relative"` to identify and fix all remaining occurrences in one sweep.

## Threat Flags

None. This change only re-routes a non-secret, auto-generated React id attribute from a wrapper `<div>` to the actual `<input>`. No new network surface, no auth path changes, no schema or trust-boundary modifications. STRIDE register (T-quick-260520-jg0-01 through -03) was already pre-classified in the plan; this change implements the planned mitigation for T-quick-260520-jg0-03 (Spoofing — label/input association).

## Self-Check: PASSED

- File `app/(auth)/signup/signup-form.tsx` modified — FOUND (commit `dea6091`)
- File `app/(auth)/login/login-form.tsx` modified — FOUND (commit `2e21a8a`)
- Commit `dea6091` — FOUND in `git log`
- Commit `2e21a8a` — FOUND in `git log`
- `components/ui/form.tsx` — UNCHANGED (verified via `git status` — not in modified list)
- Email fields — UNCHANGED on both pages (verified via the `Read` tool — only the password FormField regions were altered)
- Tasks 1 and 2 auto-tasks: COMPLETE
- Task 3 checkpoint:human-verify: PENDING (out of executor scope)
