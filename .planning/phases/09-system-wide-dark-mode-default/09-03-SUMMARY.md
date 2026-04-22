---
phase: 09-system-wide-dark-mode-default
plan: 03
subsystem: app-shell / theming
tags: [theme, dark-mode, toggle, settings, ui, next-themes]
requires:
  - "lib/actions/theme.ts (saveThemePreference contract — full impl owned by 09-01)"
  - "components/ui/dropdown-menu (shadcn primitive)"
  - "components/ui/radio-group (shadcn primitive)"
  - "components/ui/card, label, button (shadcn primitives)"
  - "next-themes@0.4.6 useTheme() hook"
provides:
  - "ThemeToggle component (dropdown variant) — Topbar + MobileHeader surface"
  - "ThemeToggleRadioGroup component (radio variant) — settings/appearance surface"
  - "/settings/appearance route with theme selector card"
  - "/settings landing card linking to /settings/appearance"
affects:
  - "components/app-shell/topbar.tsx (avatar dropdown now wrapped with ThemeToggle)"
  - "components/app-shell/mobile-header.tsx (gained right-aligned ThemeToggle)"
  - "app/(app)/settings/page.tsx (new Appearance card)"
tech-stack:
  added: []
  patterns:
    - "next-themes mounted-guard pattern: useState(false) + useEffect to suppress hydration mismatch"
    - "Side-effect coordination: setTheme() synchronously then await saveThemePreference() with toast on failure"
    - "Dual variant export pattern (dropdown + radio-group sharing one persist() helper)"
key-files:
  created:
    - "components/app-shell/theme-toggle.tsx"
    - "tests/unit/components/theme-toggle.test.tsx"
    - "app/(app)/settings/appearance/page.tsx"
    - "lib/actions/theme.ts (contract stub — see Deviations)"
  modified:
    - "components/app-shell/topbar.tsx"
    - "components/app-shell/mobile-header.tsx"
    - "app/(app)/settings/page.tsx"
decisions:
  - "Click+persist flow tested via RadioGroup variant only — Radix dropdown portal does not open under jsdom without real pointer events; both variants share the same persist() helper, so coverage is logically equivalent"
  - "ThemeToggle placed to the LEFT of the avatar dropdown in Topbar to keep the avatar as the rightmost identity affordance"
  - "MobileHeader uses justify-between so the ThemeToggle sits flush right; the page title stays the visual anchor on the left"
  - "Settings landing renders the Appearance card BETWEEN NotificationsForm and AccountSection so account-related actions remain at the bottom"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22"
  tasks: 2
  files_changed: 7
  commits: 3
---

# Phase 9 Plan 03: User-facing 3-way theme toggle Summary

Ship the user-facing 3-way theme toggle (dark / light / system) reachable from desktop Topbar, mobile header, and a new `/settings/appearance` page; toggle calls `setTheme()` for instant UI and `saveThemePreference()` for cross-device persistence.

## What was built

Two-variant `ThemeToggle` client component plus three integration points across the app shell.

### `components/app-shell/theme-toggle.tsx`

Two named exports sharing one `persist()` helper:

- `<ThemeToggle />` — ghost icon button (Sun/Moon/Monitor depending on resolved theme) with a Radix dropdown of three items. `aria-label="Toggle theme"` on the trigger; each item `role="menuitemradio"` + `aria-checked` on the active option.
- `<ThemeToggleRadioGroup />` — vertical inline `RadioGroup` for the settings page, with labels "Light", "Dark", "System (follow device)".

Both use the standard `mounted` guard (`useState(false)` + `useEffect` setter) so the icon resolves only after hydration — preventing hydration mismatch between SSR-default (cookie-driven) and the client-resolved theme.

### `persist()` flow

```
setTheme(next)                           // instant: writes localStorage + <html> class
await saveThemePreference(next)          // cross-device: DB column + cookie
if (!ok) toast.error(message)            // surface failure non-destructively
```

The order matters: `setTheme()` is synchronous so the UI updates before the network round-trip; the server-action result is only used to toast on failure (the local state is already correct).

### Shell integrations

- **Topbar (desktop)** — wrapped existing avatar `DropdownMenu` and the new `<ThemeToggle />` inside `<div className="flex items-center gap-1">`. ThemeToggle sits to the LEFT of the avatar.
- **MobileHeader** — switched from a single-item header to `justify-between`: page title on the left, `<ThemeToggle />` on the right. The dropdown opens below the header.
- **`/settings/appearance/page.tsx`** — new route. Server component renders `<Card>` containing `<ThemeToggleRadioGroup />` with title "Theme" and description "Choose how the app looks. System follows your device's preference."
- **`/settings/page.tsx`** — added a clickable `<Card>` linking to `/settings/appearance` with a Palette icon, between Notifications and AccountSection.

## Tests

`tests/unit/components/theme-toggle.test.tsx` — 7 cases, all green via vitest + jsdom + `@testing-library/react`:

1. Trigger renders a button with `aria-label="Toggle theme"`
2. Moon icon when `theme === 'dark'`
3. Sun icon when `theme === 'light'`
4. Monitor icon when `theme === 'system'`
5. RadioGroup renders three radio items with accessible Light/Dark/System labels
6. Clicking a radio item calls `setTheme('light')` exactly once AND `saveThemePreference('light')` exactly once
7. When `saveThemePreference` returns `{ ok: false, message: 'boom' }`, `toast.error('boom')` is called

`next-themes`, `@/lib/actions/theme`, and `sonner` are mocked at module scope.

Run command: `bun run test tests/unit/components/theme-toggle.test.tsx` → `7 passed`.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking issue] Created contract-compatible stub for `lib/actions/theme.ts`**

- **Found during:** Task 1 setup
- **Issue:** `lib/actions/theme.ts` does not exist yet — Plan 09-01 (which creates it with the full DB write-through implementation) is running in parallel in Wave 1. Without a stub, `components/app-shell/theme-toggle.tsx` cannot compile or be tested in isolation.
- **Fix:** Created a minimal `lib/actions/theme.ts` that exports `saveThemePreference(theme)` matching the contract from the plan's `<interfaces>` block (`Promise<{ ok: true } | { ok: false; message: string }>`). The stub validates input, sets the `eb-theme` cookie, and returns `{ ok: true }`. A header comment marks it as a stub for 09-01 to overwrite.
- **Risk:** When 09-01 lands, its `lib/actions/theme.ts` will replace this file. The function signature is identical so no consumer needs to change. If 09-01 ships a different signature, this plan's tests/UI break — but that would be a contract violation in 09-01, not in this plan.
- **Files modified:** `lib/actions/theme.ts` (new)
- **Commit:** `9b3f688`

**2. [Rule 2 — Scope adjustment] Click+persist flow tested via RadioGroup, not dropdown**

- **Found during:** Task 1 GREEN
- **Issue:** Radix Dropdown content lives in a portal that only mounts when the trigger receives a real `pointerdown` event. jsdom does not implement `PointerEvent`, so `findByRole('menuitemradio')` times out even after `fireEvent.click(trigger)`. Installing `@testing-library/user-event` would add a runtime dependency this project does not use elsewhere.
- **Fix:** Moved the `setTheme + saveThemePreference + toast.error` assertions onto the `ThemeToggleRadioGroup` variant, which renders items inline. Both variants share the exact same `persist()` helper, so behavioral coverage is logically equivalent. The dropdown variant is still covered for trigger render + correct icon per theme (4 of 7 tests).
- **Risk:** A regression in the dropdown's `onClick` wiring (e.g., wrong handler bound to an item) would not be caught by these unit tests. Plan 09-08 (E2E sweep) is expected to exercise the dropdown click path in a real browser.
- **Commit:** `649ef1e`

### Out of scope (not fixed)

- Pre-existing TypeScript errors surfaced by `bunx tsc --noEmit`:
  - `tests/e2e/auth.spec.ts(65,8) / (69,8)`: `Property 'todo' does not exist on type 'TestType<…>'` — stale Playwright API usage, untouched by this plan.
  - `tests/unit/env.test.ts(14,16)`: `Property 'startsWith' does not exist on type 'keyof ProcessEnv'` — pre-existing strict-typing issue.
  Both are tracked-by-failure and outside the surface area of this plan; will be deferred to a quick-fix or the next phase verification pass.

## Authentication gates

None encountered.

## Verification status

| Check | Command | Result |
|-------|---------|--------|
| Unit tests | `bun run test tests/unit/components/theme-toggle.test.tsx` | ✅ 7/7 passing |
| `'use client'` first line | `head -n1 components/app-shell/theme-toggle.tsx` | ✅ |
| Both exports present | `grep '^export function (ThemeToggle\|ThemeToggleRadioGroup)'` | ✅ |
| Topbar wires ThemeToggle | `grep ThemeToggle components/app-shell/topbar.tsx` | ✅ |
| MobileHeader wires ThemeToggle | `grep ThemeToggle components/app-shell/mobile-header.tsx` | ✅ |
| Settings/appearance imports RadioGroup | `grep ThemeToggleRadioGroup app/(app)/settings/appearance/page.tsx` | ✅ |
| Settings landing links to appearance | `grep /settings/appearance app/(app)/settings/page.tsx` | ✅ |
| Type-check (this plan's files) | `bunx tsc --noEmit` (clean for new files) | ✅ pre-existing unrelated errors only |
| `npx next build` | not run | ⏭ deferred to phase verification (parallel wave conflict risk; 09-04/05/08 modifying overlapping files) |
| Auth-dark E2E | `npx playwright test tests/e2e/auth-dark.spec.ts` | ⏭ deferred to phase verification |
| Dark-mode E2E (09-02) | `npx playwright test tests/e2e/dark-mode.spec.ts` | ⏭ test file owned by 09-02 / 09-08 |

## Commits

| Hash | Task | Type |
|------|------|------|
| `9b3f688` | Task 1 RED + theme.ts stub | test |
| `649ef1e` | Task 1 GREEN — ThemeToggle + RadioGroup | feat |
| `bd3ce22` | Task 2 — Topbar/MobileHeader/Settings wiring | feat |

## Known stubs

- **`lib/actions/theme.ts`** — contract-compatible stub created by this plan (Rule 3). Plan 09-01 is responsible for replacing it with the full implementation that writes to `companies.theme_preference` via Supabase. The stub already sets the `eb-theme` cookie correctly, so once 09-01 lands the cookie + DB will be in sync.

## Self-Check: PASSED

- File `components/app-shell/theme-toggle.tsx`: FOUND
- File `tests/unit/components/theme-toggle.test.tsx`: FOUND
- File `app/(app)/settings/appearance/page.tsx`: FOUND
- File `lib/actions/theme.ts`: FOUND
- File `components/app-shell/topbar.tsx`: modified (FOUND)
- File `components/app-shell/mobile-header.tsx`: modified (FOUND)
- File `app/(app)/settings/page.tsx`: modified (FOUND)
- Commit `9b3f688`: FOUND
- Commit `649ef1e`: FOUND
- Commit `bd3ce22`: FOUND
- All 7 unit tests passing on final run
