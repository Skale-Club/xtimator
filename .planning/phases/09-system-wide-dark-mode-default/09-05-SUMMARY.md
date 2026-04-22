---
phase: 09-system-wide-dark-mode-default
plan: 05
subsystem: onboarding
tags: [onboarding, survey, ux, wizard, client-component]
dependency-graph:
  requires:
    - lib/actions/company.ts (createOrUpdateCompany — Phase 2)
    - lib/schemas/onboarding.ts (OnboardingValues type — Phase 2)
    - components/onboarding/industry-selector.tsx (Phase 2)
    - components/onboarding/color-picker.tsx (Phase 2)
    - components/onboarding/logo-uploader.tsx (Phase 2)
    - components/ui/button.tsx (Phase 1)
    - components/ui/input.tsx (Phase 1)
    - components/ui/label.tsx (Phase 1)
  provides:
    - components/onboarding/survey/use-survey-state.ts
    - components/onboarding/survey/survey-config.ts
    - components/onboarding/survey/survey-shell.tsx
    - components/onboarding/survey/survey-progress.tsx
    - components/onboarding/survey/survey-step.tsx
    - components/onboarding/onboarding-survey.tsx
  affects:
    - app/onboarding/page.tsx (now renders OnboardingSurvey instead of OnboardingWizard)
tech-stack:
  added: []
  patterns:
    - "Survey-style one-question-per-screen wizard (state machine in custom hook)"
    - "Semantic-token-only styling (no hardcoded colors) for theme compatibility"
    - "CSS-keyframe transition between steps (no framer-motion dependency)"
    - "Optional-field 'Skip' affordance paired with per-step validation gate"
key-files:
  created:
    - components/onboarding/survey/survey-config.ts
    - components/onboarding/survey/use-survey-state.ts
    - components/onboarding/survey/survey-shell.tsx
    - components/onboarding/survey/survey-progress.tsx
    - components/onboarding/survey/survey-step.tsx
    - components/onboarding/survey/steps/company-name-step.tsx
    - components/onboarding/survey/steps/owner-name-step.tsx
    - components/onboarding/survey/steps/phone-step.tsx
    - components/onboarding/survey/steps/email-step.tsx
    - components/onboarding/survey/steps/industry-step.tsx
    - components/onboarding/survey/steps/brand-color-step.tsx
    - components/onboarding/survey/steps/logo-step.tsx
    - components/onboarding/survey/steps/location-step.tsx
    - components/onboarding/survey/steps/defaults-step.tsx
    - components/onboarding/survey/steps/review-step.tsx
    - components/onboarding/onboarding-survey.tsx
    - tests/e2e/onboarding-survey.spec.ts
    - tests/unit/components/onboarding-survey.test.tsx
  modified:
    - app/onboarding/page.tsx
decisions:
  - "Kept legacy OnboardingWizard + step-* files on disk (not imported) so any surprise references can be caught in a dedicated cleanup phase without risk to this plan."
  - "Used CSS-only keyframe animation instead of framer-motion or tw-animate to avoid a new dependency; respects prefers-reduced-motion via motion-safe: gating."
  - "Location and defaults are rendered as multi-input single-topic steps rather than splitting into 4+ micro-steps each — matches 'one topic per screen' interpretation in the plan behavior spec."
  - "Validation is pushed into SURVEY_STEPS[].validate closures (mirrors zod rules) so the survey hook stays independent of react-hook-form / zod."
metrics:
  duration: "~8m49s"
  completed: 2026-04-22
tasks-completed: 2
tasks-total: 2
---

# Phase 9 Plan 5: Survey-Style Onboarding Flow Summary

One-liner: Replaced the 3-step react-hook-form wizard with a mobile-first, one-question-per-screen survey (10 steps including a review) driven by a custom `useSurveyState` hook, preserving the existing `createOrUpdateCompany` server-action submission contract.

## What Was Built

### Framework (components/onboarding/survey/)

1. `survey-config.ts` — ordered `SURVEY_STEPS` array (10 entries) with per-step `validate()` closures that mirror `lib/schemas/onboarding.ts` (companyName min 2, email when non-empty, tax rate 0-100, validity >= 1).
2. `use-survey-state.ts` — `useSurveyState(initial)` returns step index, values, `setValue`, `goNext`/`goBack`, `error`, `logoFile`/`logoPreview`, `isFirst`/`isLast`. `goNext()` runs the step's `validate` against the freshest values (captured via `setValues` callback) so the gate is race-safe.
3. `survey-progress.tsx` — "Step N of M" + percentage + semantic bg-primary fill bar, `aria-label` and `aria-live="polite"` on the wrapper.
4. `survey-step.tsx` — shared heading + helper + error wrapper with `role="alert"` on error and `aria-live="polite"` on `<h1>`.
5. `survey-shell.tsx` — mobile-first layout (`max-w-lg min-h-screen flex-col px-4 py-6`), header wordmark, progress, keyed transition container with a `motion-safe` keyframe `surveyFadeIn` (opacity + 8px slide), footer with Back / Skip / Next / Complete.

### Step components (components/onboarding/survey/steps/)

10 leaf components, each of which receives `{ values, setValue, onNext, ... }` and handles `Enter` to advance:
- `company-name-step` (required, autoFocus)
- `owner-name-step`
- `phone-step`
- `email-step`
- `industry-step` (reuses `IndustrySelector`)
- `brand-color-step` (reuses `ColorPicker`)
- `logo-step` (reuses `LogoUploader`, revokes blob URLs on swap/remove)
- `location-step` (4-input grid: address / city / state / zip)
- `defaults-step` (4-input grid: tax / validity / payment terms / warranty)
- `review-step` (read-only `<dl>` with every captured value + logo preview)

### Orchestration

- `components/onboarding/onboarding-survey.tsx` — client component that composes `useSurveyState` + `SurveyShell`, drives `handleComplete` inside a `useTransition` that uploads the optional logo to `logos/{user.id}/logo.{ext}` then calls `createOrUpdateCompany`.
- `app/onboarding/page.tsx` — updated to render `<OnboardingSurvey />`; still server-side fetches branding and enforces auth via `getClaims()`. The old `OnboardingWizard` import is gone; legacy wizard files are left untouched on disk for a follow-up cleanup phase.

### Tests

- `tests/unit/components/onboarding-survey.test.tsx` — 10 vitest cases covering `SURVEY_STEPS` shape (length 10, exact key order, only `companyName` required), `useSurveyState` (initial state, required-step gate, advance on valid input, back preserves value, email validation path) and `SurveyProgress` (label text + aria-label). All 10 pass.
- `tests/e2e/onboarding-survey.spec.ts` — 4 Playwright cases covering progress-visible, required-gate, Enter-advances, Back-preserves-value. Tests auto-skip when `/onboarding` redirects to `/auth/login` (no test-auth helper in this project).

## Acceptance Criteria

- 15 framework files + onboarding-survey + page + e2e all created (filesystem `accessSync`): PASS
- `SURVEY_STEPS` has exactly 10 entries in documented order (unit-tested): PASS
- `use-survey-state.ts` exports `useSurveyState` (grep + import at test): PASS
- `survey-progress.tsx` exposes `aria-label="Step N of M"` (unit-tested): PASS
- Every step component lives under `components/onboarding/survey/steps/`: PASS
- No hardcoded color classes or hex literals in the new framework (`grep -rE "bg-(gray|green|red|blue|yellow|purple)-[0-9]{3}|#[0-9a-fA-F]{6}" components/onboarding/survey/` returns 0 matches): PASS
- `bunx tsc --noEmit` reports zero errors in `components/onboarding/survey/**`, `components/onboarding/onboarding-survey.tsx`, `app/onboarding/page.tsx`, `tests/unit/components/onboarding-survey.test.tsx`, `tests/e2e/onboarding-survey.spec.ts`: PASS
- `bunx next build` compiles successfully (TypeScript phase complete, static build exported including `/onboarding`): PASS
- Full vitest suite: 170 pre-existing passes + 10 new passes, 1 pre-existing failure in `tests/integration/missing-key-ux.test.ts` unrelated to onboarding (see Deferred Issues).
- `app/onboarding/page.tsx` imports `OnboardingSurvey` and NOT `OnboardingWizard`: PASS (verified by grep).
- E2E spec file contains 4 `test(` blocks AND the substrings `Step 1 of`, `Enter`, `Back`: PASS.

## Must-Haves (truths)

1. User sees exactly one question per screen: PASS — each step renders one focused question (location/defaults are single topics grouped into one screen per plan interpretation).
2. Progress indicator showing "N of M" visible on every step: PASS — `SurveyProgress` is outside the keyed transition container so it persists.
3. Cannot advance without valid current step: PASS — `goNext` runs `currentStep.validate` and sets `error` without incrementing the index on failure.
4. Back returns to N-1 with the value preserved: PASS — `values` state is plan-level, not step-level.
5. Pressing Enter advances: PASS — every text input wires `onKeyDown` => `onNext` on Enter.
6. Final step is review + submits via `createOrUpdateCompany`: PASS — `ReviewStep` renders the `<dl>`; the shell's Complete-setup button calls `handleComplete` which invokes `createOrUpdateCompany(values, logoUrl?)`.
7. /onboarding is NOT wrapped in the `[data-theme="dark-auth"]` tree: PASS — `app/onboarding/page.tsx` is untouched by auth-theme plumbing and renders `<OnboardingSurvey />` at the top level of the route subtree, inheriting the root app theme.

## Deviations from Plan

Plan executed substantially as written. Minor adjustments:

1. **[Rule 3 - Blocking] Missing .env.local in worktree blocked `next build`.** Copied `.env.local` from the parent repo root into this worktree so static prerender of `/_not-found` (which evaluates `supabaseUrl` at module scope) could succeed. `.env.local` is `.gitignore`d and was NOT committed.
2. **[Rule 3 - Blocking] `node_modules/` was empty in the worktree.** Ran `bun install --frozen-lockfile` to hydrate dependencies so vitest / tsc / next build could run.
3. **Plan suggested `animate-in fade-in slide-in-from-right-2` (tailwindcss-animate).** These utilities are not installed in `@tailwindcss/postcss` v4 in this repo. Used the documented fallback: a CSS `@keyframes surveyFadeIn` inside `<style jsx>` gated by `motion-safe:` — same visual result, no new dependency.

## Deferred Issues (out of scope for 09-05)

Documented in `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`:

- `tests/e2e/auth.spec.ts` lines 65 and 69: `test.todo` usage triggers a TS2339 on Playwright's `TestType`. Pre-existing on main.
- `tests/unit/env.test.ts:14`: `startsWith` called on a `keyof ProcessEnv` union; pre-existing typing mismatch.
- `tests/integration/missing-key-ux.test.ts:89`: expected `/not configured/i` in an error body that now reads "Email sending isn't available right now…". Copy drift, pre-existing.

None of these files were touched by 09-05 and all errors exist prior to this plan.

## Authentication Gates

None. No auth, API keys, or interactive human actions required.

## Known Stubs

None. Every captured value flows into the existing `createOrUpdateCompany` action via the already-tested `OnboardingValues` shape — no placeholder data paths, no "not available" copy, no unwired props.

## Self-Check: PASSED

- FOUND: components/onboarding/survey/survey-config.ts
- FOUND: components/onboarding/survey/use-survey-state.ts
- FOUND: components/onboarding/survey/survey-shell.tsx
- FOUND: components/onboarding/survey/survey-progress.tsx
- FOUND: components/onboarding/survey/survey-step.tsx
- FOUND: components/onboarding/survey/steps/company-name-step.tsx
- FOUND: components/onboarding/survey/steps/owner-name-step.tsx
- FOUND: components/onboarding/survey/steps/phone-step.tsx
- FOUND: components/onboarding/survey/steps/email-step.tsx
- FOUND: components/onboarding/survey/steps/industry-step.tsx
- FOUND: components/onboarding/survey/steps/brand-color-step.tsx
- FOUND: components/onboarding/survey/steps/logo-step.tsx
- FOUND: components/onboarding/survey/steps/location-step.tsx
- FOUND: components/onboarding/survey/steps/defaults-step.tsx
- FOUND: components/onboarding/survey/steps/review-step.tsx
- FOUND: components/onboarding/onboarding-survey.tsx
- FOUND: tests/e2e/onboarding-survey.spec.ts
- FOUND: tests/unit/components/onboarding-survey.test.tsx
- FOUND commit f5078c0 (RED: failing tests)
- FOUND commit a0377bf (GREEN: framework implementation)
- FOUND commit a873ed2 (E2E spec)
- FOUND commit 7ce2f8b (GREEN: OnboardingSurvey + page wiring)
- FOUND commit a6237e4 (deferred-items documentation)
