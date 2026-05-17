# Phase 71 — Performance Baseline

Recorded by `scripts/lighthouse.mjs` against `localhost:9633` (`bun run dev`).
Final values gate REDESIGN-10 (≥80 perf+a11y on / and /dashboard, FLJS < 500 KB on /dashboard).

## Lighthouse Scores

| Wave | Date | URL | Perf | A11y | BP | SEO |
|------|------|-----|------|------|----|-----|
| pre-71 | — | / | not run | not run | — | — |
| pre-71 | — | /dashboard | not run | not run | — | — |
| post-71 | 2026-05-17 | / | deferred (see below) | deferred | — | — |
| post-71 | 2026-05-17 | /dashboard | deferred (see below) | deferred | — | — |

## First Load JS

| Wave | URL | FLJS | Target |
|------|-----|------|--------|
| post-71 | /dashboard | deferred (see below) | < 500 KB |

## Numeric Lighthouse + FLJS Deferred — Rationale

`bun run build` fails at module-resolution for `stripe`, `inngest`, `inngest/next`, and `@aws-sdk/*` packages. These imports exist in `lib/billing/stripe-client.ts`, `lib/inngest/client.ts`, and `lib/storage/s3-provider.ts` but the corresponding dependencies are not yet present in `package.json`. The condition pre-dates Phase 71 (documented in `deferred-items.md` since Plan 71-02 for the test suite; surfaces again in `next build`).

Lighthouse against `bun run dev` produces inflated dev-mode numbers (unminified bundles, no tree-shaking, dev overlay) and would not be a credible gate. Numeric measurement is therefore **deferred to the v3.1.1 deploy milestone**, where Phase 69 PERF-01 / PERF-02 explicitly own the post-deploy perf audit against a real production build.

`scripts/lighthouse.mjs` (shipped in 71-01) is in place and ready to run.

## REDESIGN-10 Structural Gates — VERIFIED

These are the gates that DO NOT require a build, and they all pass:

### 1. `backdrop-filter` restricted to allowed surfaces (PASSED)

Grep audit on 2026-05-17 over `app/ components/` (excluding tests + snapshots) returns matches only in the following allowed surface types:

| Allowed surface | File | Note |
|-----------------|------|------|
| Glass utility | `app/globals.css` | `.glass` / `.glass-strong` utility class definitions only |
| Sidebar | `components/admin/admin-nav.tsx` | Glass sidebar (71-10) |
| Sidebar | `components/app-shell/*` | Existing app shell (71-05) |
| Topbar | `components/admin/admin-topbar.tsx` | Glass topbar (71-10) |
| Topbar | `components/landing/landing-nav.tsx`, `top-nav.tsx` | Landing top bar |
| Modal / Sheet | `components/ui/dialog.tsx`, `sheet.tsx` | Backdrop blur + glass-strong content (71-02) |
| Toast | `components/ui/sonner.tsx` | Glass toaster (71-02) |
| Glass card primitive | `components/ui/card.tsx` | Variant definitions; consumed per surface contract |
| Capture stepper (hero card) | `components/capture/capture-stepper.tsx` | Single glass card per capture screen (71-08) |

The landing `features-section.tsx` and `how-it-works-section.tsx` use `backdrop-blur-none` to explicitly DISABLE blur on inline cards — the inline comment in each file ("Glass surface tokens WITHOUT backdrop-blur — perf gate for landing scroll") confirms intentional restriction.

The mobile bottom-nav uses solid bg (no blur — perf gate honored — see comment in `components/app-shell/bottom-nav.tsx`).

NO matches found on: list rows, table cells, inline badges, estimate editor rows, capture viewfinder. The audit passes.

### 2. `prefers-reduced-transparency` fallback (PASSED — Plan 71-01)

`app/globals.css` includes a `@media (prefers-reduced-transparency: reduce)` block that replaces `--glass-bg` / `--glass-bg-strong` with `hsl(var(--card))` and sets blur values to `0px` across `:root`, `.dark`, both `data-theme` dark scopes, and `[data-theme="light"]`. Verified by unit test `tests/unit/design-system/tokens.test.ts`.

### 3. Brand identity LOCKED (PASSED)

- `--primary: 224 86% 60%` (#406EF1) unchanged in `app/globals.css`
- Logo SVG (`icon.svg`, auth-card inline SVG) byte-identical
- Wordmark "Xtimator" unchanged
- Dark-mode default preserved (`<html class="dark">` via next-themes)
- Scoped themes `[data-theme="admin-dark"]`, `[data-theme="dark-auth"]`, `[data-theme="light"]` all functional and consumed in 71-10 (admin layout still injects `--platform-primary` inline; estimate share still in light scope)

## i18n Smoke

EN + PT + ES translations exist in `lib/i18n/translations.ts`. PT (longest-string proxy) is included in the settings visual spec matrix and the tier card grid renders correctly with "Mais popular" / "Más popular" — the `<Badge variant="brand">` has `whitespace-nowrap` to prevent clip on long locales. Full visual baseline mint blocks on auth fixture (see `deferred-items.md`).

## Notes

- `lighthouse` + `chrome-launcher` not installed as devDeps — install before first numeric run: `bun add -d lighthouse chrome-launcher`
- Build deps to install (blocking issue, see deferred-items.md): `bun add stripe inngest @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- Once both are resolved:
  ```
  bun run dev          # in one shell
  bun scripts/lighthouse.mjs http://localhost:9633/ http://localhost:9633/dashboard
  bun run build 2>&1 | grep -E "/dashboard\s+"
  ```
- For true CI gating on `/dashboard`, wire Lighthouse to use an auth cookie (see RESEARCH `tests/e2e/fixtures/authenticated-state.json` Wave 0 gap).
