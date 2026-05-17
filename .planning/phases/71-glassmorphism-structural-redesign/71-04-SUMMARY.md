---
phase: 71
plan: 04
subsystem: auth-onboarding
tags: [glassmorphism, auth, onboarding, playwright-visual, wave-2]
dependency_graph:
  requires:
    - "71-01 tokens (--gradient-hero, --glass-bg, --gradient-brand, .gradient-hero utility, shadow-glow-brand)"
    - "71-02 primitive variants (Card variant='glass', Button variant='primary', Input gradient focus)"
  provides:
    - "Glass-styled /login, /signup, /reset-password (scoped data-theme=dark-auth)"
    - "Glass-styled /onboarding survey shell (10-step) + legacy onboarding-card/wizard (3-step) for backward compat"
    - "Gradient progress bar on survey + gradient step indicator on legacy wizard"
    - "tests/e2e/visual/auth.spec.ts — @visual spec covering 3 auth surfaces + onboarding (gated)"
    - "27 minted PNG baselines under tests/e2e/visual/auth.spec.ts-snapshots/"
  affects:
    - "Tenant brand cascade: gradient-hero retints automatically when --platform-primary inline-injected on dark-auth root"
    - "Future Wave 2-5 surfaces continue consuming the same primitives — no new tokens introduced"
tech_stack:
  added: []
  patterns:
    - "Auth gradient-hero backdrop via `<div aria-hidden className='absolute inset-0 -z-10 gradient-hero' />` sibling on `relative isolate` parent"
    - "Card variant='glass' replaces ad-hoc `bg-black/40 backdrop-blur-xl` (single source of truth)"
    - "Button variant='primary' size='lg' for all auth/onboarding primary CTAs (gradient + shimmer + glow)"
    - "Survey progress: outer `bg-[var(--glass-bg-light)]` track + inner `gradient-brand` fill"
    - "Step indicator (legacy wizard): active/completed circles use `gradient-brand` + `shadow-glow-brand`; connector line uses `gradient-brand`"
key_files:
  created:
    - tests/e2e/visual/auth.spec.ts
    - tests/e2e/visual/auth.spec.ts-snapshots/ (27 PNGs)
    - .planning/phases/71-glassmorphism-structural-redesign/71-04-SUMMARY.md
  modified:
    - app/(auth)/layout.tsx
    - components/auth/auth-card.tsx
    - app/(auth)/login/login-form.tsx
    - app/(auth)/signup/signup-form.tsx
    - app/(auth)/reset-password/reset-password-form.tsx
    - components/onboarding/onboarding-card.tsx
    - components/onboarding/onboarding-wizard.tsx
    - components/onboarding/step-indicator.tsx
    - components/onboarding/survey/survey-shell.tsx
    - components/onboarding/survey/survey-progress.tsx
decisions:
  - "RESEARCH G4 preserved: (auth)/layout.tsx inline `style={{ '--platform-primary': ... }}` UNTOUCHED — only added a backdrop sibling div above existing markup; data-theme=dark-auth preserved"
  - "AuthCard switched from ad-hoc `bg-black/40 backdrop-blur-xl` to `<Card variant='glass'>` — single source of truth via primitive variant from 71-02, no inline style additions"
  - "Two onboarding code paths kept in sync: survey-shell (the live /onboarding route per app/onboarding/page.tsx → OnboardingSurvey) AND legacy onboarding-card/onboarding-wizard (kept consistent in case it's revived). Both now use glass + gradient-hero"
  - "Survey progress bar fill switched from solid `bg-primary` to `gradient-brand` so the brand cascade tints the bar via --primary"
  - "Onboarding visual baselines DEFERRED — /onboarding redirects unauth users to /login. Same auth-fixture gap noted in 71-02. Spec ships now and skips gracefully via URL check; mints when fixture lands in a later wave"
  - "27 auth baselines minted on chromium (3 surfaces x 3 viewports x 3 langs) — mobile-safari/mobile-chrome projects intentionally not run in this plan (chromium is the canonical baseline; cross-browser comes in Wave 5 perf/a11y gate)"
metrics:
  duration_seconds: 480
  tasks_completed: 4
  files_created: 2
  files_modified: 10
  tests_added: 0
  tests_passing: 27
  completed: "2026-05-17T15:30:00Z"
---

# Phase 71 Plan 04: Auth + Onboarding Glass Redesign Summary

Apply Phase 71 glass/gradient system to `(auth)/{login,signup,reset-password}` and `/onboarding`. Auth pages now render a glass `Card` centered on a `gradient-hero` radial backdrop within the existing `data-theme="dark-auth"` scope; onboarding survey shell wraps each step in glass with a gradient-brand progress bar. Tenant `--platform-primary` cascade preserved end-to-end.

## What Was Built

### Auth layout backdrop (`app/(auth)/layout.tsx`)

- Added `relative isolate` + `py-12` to outer container.
- Inserted gradient-hero backdrop sibling: `<div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />`.
- `data-theme="dark-auth"` attribute + inline `style={{ '--platform-primary': triplet }}` UNCHANGED (RESEARCH G4).
- Back-link bumped to `z-10` so it sits above the backdrop.

### AuthCard (`components/auth/auth-card.tsx`)

- Replaced ad-hoc `rounded-[1.5rem] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl` with `<Card variant="glass" className="rounded-[1.5rem]">`. The primitive variant (from 71-02) already provides `border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] shadow-glass`.
- Title weight: `font-bold` → `font-semibold` (matches UI-SPEC weight rule: 400/500/600 only).
- Wrapper bumped to `z-10` so it sits above the gradient backdrop.

### Auth forms

| File | Change |
|------|--------|
| `app/(auth)/login/login-form.tsx` | Submit `Sign in to Xtimator`: ad-hoc gradient/shadow classes → `<Button variant="primary" size="lg" className="mt-2 w-full text-base font-semibold">`. Inputs already inherit Phase 71 gradient focus via the Input primitive (71-02). |
| `app/(auth)/signup/signup-form.tsx` | Submit `Create account`: default variant → `variant="primary" size="lg"`. |
| `app/(auth)/reset-password/reset-password-form.tsx` | Both submits (`Send reset link` + `Update password`): default → `variant="primary" size="lg"`. |

All copy strings preserved (no t() key changes — copy is currently inline English; existing pattern untouched).

### Onboarding (live route — `OnboardingSurvey`)

- **`survey-shell.tsx`** — wrapped step content in `<Card variant="glass" className="mx-auto w-full max-w-2xl"><CardContent className="p-6 md:p-10">…`; added gradient-hero backdrop on `relative isolate` parent; widened container `max-w-lg` → `max-w-2xl` to match UI-SPEC onboarding card size. Next/Complete buttons now `variant="primary"`; Back stays ghost; Skip stays outline.
- **`survey-progress.tsx`** — outer track `bg-muted` → `bg-[var(--glass-bg-light)]`; fill `bg-primary` → `gradient-brand` with `rounded-full`.

### Onboarding (legacy 3-step wizard — kept in sync for backward compat)

- **`onboarding-card.tsx`** — added `relative isolate` + gradient-hero backdrop; Card → `variant="glass"`; bg switched from `bg-muted/40` to `bg-background` (the backdrop carries the visual).
- **`onboarding-wizard.tsx`** — Next/Complete CTAs → `variant="primary"`.
- **`step-indicator.tsx`** — active/completed step circles: `bg-primary` → `gradient-brand` + `shadow-glow-brand` on active; connector line `bg-primary` → `gradient-brand`.

### Visual test scaffold + baselines

- **`tests/e2e/visual/auth.spec.ts`** — mirrors `tokens.spec.ts` pattern. Two describe blocks:
  - `@visual auth surfaces` — `/login`, `/signup`, `/reset-password` × 3 viewports × 3 langs. `test.use({ storageState: { cookies: [], origins: [] } })` so logged-in cookies don't redirect to dashboard.
  - `@visual onboarding surfaces` — `/onboarding` × 3 viewports × 3 langs, auto-`skip` when post-goto URL no longer contains `/onboarding` (i.e. unauth redirect).
- **27 PNG baselines minted** under `tests/e2e/visual/auth.spec.ts-snapshots/` (chromium, 3 × 3 × 3 = 27).
- 9 onboarding tests skipped cleanly pending auth fixture.

## Verification

| Check | Result |
|-------|--------|
| `grep -rn 'variant="primary"' app/(auth)/ app/onboarding/ components/onboarding/ components/auth/` | 8 occurrences (plan required ≥ 3) |
| `grep -c gradient-hero` across modified surfaces | 6 (layout 2 + survey-shell 2 + onboarding-card 2) — required ≥ 1 per surface |
| `bunx playwright test tests/e2e/visual/auth.spec.ts --update-snapshots --project=chromium` | 27 passed, 9 skipped (onboarding auth-gated) |
| `git ls-files tests/e2e/visual/auth.spec.ts-snapshots \| grep -c auth-` | 27 (plan required ≥ 9) |
| `bunx tsc --noEmit` filtered to plan files | zero errors |
| Manual: tenant brand cascade — `--gradient-hero` is `radial-gradient(... hsl(var(--primary) / 0.28) ...)` and `--primary` resolves to `var(--platform-primary, var(--system-primary))` on `[data-theme="dark-auth"]` | Cascade preserved by construction; inline style on layout still injects the triplet |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Plan modified `components/onboarding/onboarding-wizard.tsx` but live `/onboarding` uses `OnboardingSurvey` (different code path)**

- **Found during:** Task 3 (inspecting onboarding component graph)
- **Issue:** The plan's `files_modified` lists `components/onboarding/onboarding-wizard.tsx`, but `app/onboarding/page.tsx` renders `<OnboardingSurvey>` (not `<OnboardingWizard>`). Without touching the survey, the live onboarding flow would have stayed un-redesigned.
- **Fix:** Restyled BOTH paths — `OnboardingSurvey`/`SurveyShell`/`SurveyProgress` (live) and `OnboardingCard`/`OnboardingWizard`/`StepIndicator` (legacy, in case revived). Both end up with: gradient-hero backdrop, glass Card, gradient progress, primary CTAs.
- **Files modified:** `components/onboarding/survey/survey-shell.tsx`, `components/onboarding/survey/survey-progress.tsx` (extra files beyond plan's list)
- **Commit:** `b821ecf`

### Scope deferred

- **Onboarding visual baselines** — `/onboarding` requires auth fixture; same gap noted in 71-02. Spec ships now and `test.skip`s when redirected; baselines mint automatically once fixture lands.
- **Cross-browser baselines** — only chromium baselines minted in this plan. mobile-safari/mobile-chrome projects exist in `playwright.config.ts` but are not part of REDESIGN-04 acceptance; cross-browser comes in Wave 5 perf/a11y gate.

## Authentication Gates

None — fully autonomous execution. (Snapshot mint required dev server running, which Playwright spawned via the existing `webServer` config — no manual auth required for the public auth pages.)

## Commits

| # | Hash      | Type  | Subject |
|---|-----------|-------|---------|
| 1 | `ce5fdb0` | test  | add auth + onboarding visual spec scaffold (RED) |
| 2 | `b821ecf` | feat  | glass redesign for auth + onboarding surfaces |
| 3 | `2de8309` | chore | mint auth visual baselines (27 PNG) |

All commits used `--no-verify` per parallel wave directive.

## Downstream Notes

1. **Auth fixture is now visibly a Wave-0 dependency** for 71-05+ snapshot work (sidebar/topbar/dashboard all require login). Recommend shipping `tests/e2e/fixtures/authenticated-state.json` early in Wave 3.
2. **AuthCard `<Card variant="glass">`** is now the canonical pattern for any new auth-adjacent surfaces (e.g. magic-link landing, OAuth error page). Don't add inline blur/border classes.
3. **Gradient backdrop recipe** for any new full-screen centered surface: wrap in `relative isolate` parent, drop `<div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />` as first child.
4. **Tenant cascade verified by construction** — no inline `--platform-primary` plumbing needed downstream; cascade flows through `hsl(var(--primary))` in token definitions from 71-01.

## Known Stubs

None. All redesigned surfaces consume real data; no placeholder/mock UI introduced.

## Self-Check: PASSED

Files verified on disk:
- `tests/e2e/visual/auth.spec.ts` (created)
- `tests/e2e/visual/auth.spec.ts-snapshots/` (27 PNGs created)
- `app/(auth)/layout.tsx` (modified — gradient-hero backdrop)
- `components/auth/auth-card.tsx` (modified — Card variant glass)
- `app/(auth)/login/login-form.tsx` (modified — primary submit)
- `app/(auth)/signup/signup-form.tsx` (modified — primary submit)
- `app/(auth)/reset-password/reset-password-form.tsx` (modified — both primary submits)
- `components/onboarding/onboarding-card.tsx` (modified — glass + backdrop)
- `components/onboarding/onboarding-wizard.tsx` (modified — primary CTAs)
- `components/onboarding/step-indicator.tsx` (modified — gradient steps)
- `components/onboarding/survey/survey-shell.tsx` (modified — glass card wrapper + backdrop)
- `components/onboarding/survey/survey-progress.tsx` (modified — gradient fill)

Commits verified in `git log`:
- `ce5fdb0` — test(71-04) RED
- `b821ecf` — feat(71-04) GREEN
- `2de8309` — chore(71-04) baselines
