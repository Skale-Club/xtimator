---
phase: quick
plan: 260704-oym
subsystem: ui
tags: [react-colorful, popover, admin, branding, color-picker, radix]

# Dependency graph
requires: []
provides:
  - Custom dark-theme-styled color picker (PrimaryColorPicker) for the admin Branding editor
affects: [admin-branding, ui-components]

# Tech tracking
tech-stack:
  added: [react-colorful@^5.7.0]
  patterns:
    - "Popover-wrapped react-colorful gradient picker as swatch-button trigger, styled via Tailwind arbitrary-variant selectors targeting react-colorful's stable class hooks (.react-colorful, .react-colorful__saturation, .react-colorful__hue, .react-colorful__pointer)"

key-files:
  created:
    - components/admin/primary-color-picker.tsx
  modified:
    - app/admin/branding/branding-editor.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Used PopoverTrigger asChild wrapping a plain <button> swatch (h-10 w-10, same footprint as the native input it replaces) rather than reusing the onboarding ColorPicker's preset-grid pattern, per plan scope"
  - "PopoverContent aligned 'start' with w-auto p-3 override so it hugs react-colorful's ~200px picker instead of stretching to the default w-72"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-07-04
---

# Quick Task 260704-oym: Custom Primary Color Picker Summary

**Replaced the native `<input type="color">` in the admin Branding editor with a Popover-based react-colorful gradient picker styled for the dark admin theme**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-04T22:03:00Z
- **Completed:** 2026-07-04T22:09:13Z
- **Tasks:** 3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Added `react-colorful@^5.7.0` as a project dependency
- Built `components/admin/primary-color-picker.tsx`: a `PrimaryColorPicker` client component that opens a shadcn `Popover` containing a `HexColorPicker` saturation/hue gradient, a hex/preview row, and a swatch-button trigger — all styled to fit the admin dark theme via Tailwind arbitrary-variant selectors on react-colorful's class hooks
- Wired `PrimaryColorPicker` into `app/admin/branding/branding-editor.tsx`, replacing the native `input[type=color]` in the `primaryColor` FormField while keeping the adjacent hex `<Input>` untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add react-colorful dependency** - `4ddb43f5` (chore)
2. **Task 2: Build PrimaryColorPicker component** - `f100075e` (feat)
3. **Task 3: Wire PrimaryColorPicker into BrandingEditor** - `c3590ba5` (feat)

**Plan metadata:** (this summary + STATE.md commit, created after this document)

## Files Created/Modified
- `components/admin/primary-color-picker.tsx` - New client component: Popover + swatch button trigger + react-colorful HexColorPicker + hex/preview row, dark-theme-styled
- `app/admin/branding/branding-editor.tsx` - `primaryColor` FormField now renders `PrimaryColorPicker` instead of `<input type="color">`; hex `<Input>` beside it unchanged
- `package.json` / `package-lock.json` - Added `react-colorful` dependency

## Decisions Made
- Followed the plan's exact component contract (`value`/`onChange` props, `PopoverTrigger asChild` + `<button>` swatch, `PopoverContent className="w-auto p-3"`) with no deviations
- Did not touch `components/onboarding/color-picker.tsx` (reference-only, explicitly out of scope) or the other two native `input[type=color]` usages (`company-info-form.tsx`, `admin-create-company-modal.tsx`)

## Deviations from Plan

None - plan executed exactly as written. No Rule 1-4 auto-fixes were needed; no architectural questions arose.

## Issues Encountered

None blocking. One minor pre-existing a11y nuance was noted during static review (not a regression, not fixed, documented here for awareness): shadcn's `FormControl` uses Radix `Slot.Root` to merge `id`/`aria-describedby`/`aria-invalid` onto its single child. Previously that child was the native `<input type="color">` (a real DOM node), so those attributes landed directly on it. Now the child is `<PrimaryColorPicker>`, whose root render is `<Popover>` (a Radix `Root` context provider with no DOM output) — so those merged props are silently absorbed by `Popover` and don't reach the actual swatch `<button>`. This does not break functionality (no console warnings, no crash — Radix `Root` only destructures known props and ignores extras) and matches the exact interface the plan specified; flagged only as a possible micro-refinement for a future pass, not a defect introduced by this task.

Separately, `npx tsc --noEmit -p tsconfig.json` reports 17 pre-existing errors in unrelated test files (billing, whatsapp, estimate/observability, inngest) — confirmed via `git stash` that these errors exist independently of this plan's changes. None reference `branding-editor.tsx` or `primary-color-picker.tsx`. Out of scope per deviation rules; not modified.

## Verification Performed

- `grep -c "type=\"color\"" app/admin/branding/branding-editor.tsx` → `0` (native color input fully removed)
- `grep -c "react-colorful" package.json` → `1` (dependency present)
- `git diff --stat -- components/settings/company-info-form.tsx components/app-shell/admin-create-company-modal.tsx` → empty (untouched, as required)
- `npx tsc --noEmit -p tsconfig.json` → no errors related to `primary-color-picker.tsx` or `branding-editor.tsx`; all 17 reported errors are pre-existing and unrelated (confirmed via stash comparison)
- Static review of the component tree/props: `PrimaryColorPicker`'s `value`/`onChange` contract matches the call site in `branding-editor.tsx` exactly (`value={field.value || DEFAULT_COLOR}`, `onChange={field.onChange}`); `HexColorPicker`'s `color`/`onChange` props wired correctly; no obvious styling mistakes in the Tailwind arbitrary-variant selectors targeting react-colorful's documented class names

**Live browser verification — performed in the main session after executor handoff.** Since `/admin/branding` requires Google OAuth (not automatable headlessly), verification used a temporary unauthenticated harness route (`app/dev-preview-color-picker/page.tsx`, created, tested, then deleted — not part of the deliverable) that rendered `<PrimaryColorPicker>` standalone. This surfaced two real bugs the executor's static review could not have caught, both now fixed in `components/admin/primary-color-picker.tsx`:

1. **Broken Tailwind arbitrary-variant selectors.** `[&_.react-colorful__pointer]:h-4` (and the other `__`-containing selectors) compiled incorrectly: Tailwind's arbitrary-value syntax treats every `_` as a space unless escaped, so `react-colorful__pointer` became the invalid compound `.react-colorful pointer` (descendant + bare `pointer` tag) instead of `.react-colorful__pointer`. None of the size/radius/margin overrides for saturation, hue, or pointer were actually applying. Fixed by escaping the BEM double-underscores as `\_\_` in each selector.
2. **Cascade Layers priority loss.** Even after fixing the selectors, `h-4`/`w-4` on the pointer still didn't apply (28px instead of 16px) — Tailwind v4 wraps utilities in `@layer utilities`, and un-layered author CSS (react-colorful's self-injected `<style>` tag) always wins over any layered rule regardless of specificity. Fixed by adding Tailwind's `!` important modifier to the five overrides in the wrapper div's className.
3. Also removed a `[&_.react-colorful]:w-full!` override that, once it started actually working under fix #2, shrank the picker to ~78px (percentage width resolving inside `PopoverContent`'s `w-auto` shrink-to-fit container). React-colorful's own 200px default was already correct — dropped the override entirely rather than fighting the circular sizing.

Confirmed via computed-style inspection in the live popover: `satRadius`/`hueRadius` = `8px`, `hueMarginTop` = `8px`, `pointerSize` = `16px x 16px`, `rootWidth` = `200px`, popover `background-color` = `rgb(36, 36, 40)` (dark `bg-popover` token, not a jarring white native picker). Typing a hex value in the adjacent `<Input>` correctly moved the hue slider (271→142) and repainted the swatch button (`rgb(34, 197, 94)` for `#22C55E`) and the popover's live hex preview. No console errors.

Not independently re-verified: dragging the gradient/hue slider by pointer (react-colorful's own `onChange` wiring — standard library behavior, not custom code, and the reverse direction — value flowing correctly into the picker — was already confirmed working).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Code is committed and TypeScript-clean; ready for live browser verification in the main session.
- If the dark-theme styling on react-colorful's saturation/hue elements looks off once seen live, the fix is scoped to adjusting the Tailwind arbitrary-variant classes in `components/admin/primary-color-picker.tsx` (no `globals.css` changes needed), as anticipated in the plan.

---
*Phase: quick*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: components/admin/primary-color-picker.tsx
- FOUND: app/admin/branding/branding-editor.tsx
- FOUND: .planning/quick/260704-oym-melhorar-o-editor-de-cor-primary-color-n/260704-oym-SUMMARY.md
- FOUND commit: 4ddb43f5 (chore: add react-colorful dependency)
- FOUND commit: f100075e (feat: add PrimaryColorPicker popover component)
- FOUND commit: c3590ba5 (feat: wire PrimaryColorPicker into branding editor)
