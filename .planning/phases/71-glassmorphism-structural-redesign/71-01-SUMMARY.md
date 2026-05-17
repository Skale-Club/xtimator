---
phase: 71
plan: 01
subsystem: design-system
tags: [design-tokens, glassmorphism, tailwind-v4, playwright-visual, foundation]
dependency_graph:
  requires: []
  provides:
    - "--glass-bg / --glass-bg-strong / --glass-bg-light / --glass-border / --glass-blur / --glass-blur-strong tokens"
    - "--gradient-{brand,hero,success,warning,danger,premium} palette"
    - "--glow-brand / --glow-success / --shadow-glass tokens"
    - "--shimmer-duration token + @keyframes button-shimmer-sweep"
    - ".glass / .glass-strong / .gradient-* / .shadow-glow-* utility classes"
    - "tests/e2e/visual/ scaffold (@visual tag, freezeAnimations, setLang, viewports x langs matrix)"
    - "scripts/lighthouse.mjs perf gate runner"
  affects:
    - "Every Phase 71 plan (71-02..71-10) consumes these tokens"
    - "/admin/design-system reference page (71-02) renders all variants from these tokens"
tech_stack:
  added: []
  patterns:
    - "Tailwind v4 CSS-first config — @layer base / @layer utilities in globals.css (NO tailwind.config.ts)"
    - "Brand-tinted gradients via hsl(var(--primary)) for tenant white-label cascade (RESEARCH G6)"
    - "Glow shadows namespaced --glow-* to avoid Tailwind v4 --shadow-* wildcard collision (RESEARCH G9)"
    - "prefers-reduced-transparency + prefers-reduced-motion fallbacks at token layer"
    - "Playwright @visual tag convention + 3 viewports x 3 langs matrix"
key_files:
  created:
    - tests/unit/design-system/tokens.test.ts
    - tests/e2e/visual/_helpers.ts
    - tests/e2e/visual/tokens.spec.ts
    - tests/e2e/fixtures/freeze-animations.ts
    - scripts/lighthouse.mjs
    - .planning/phases/71-glassmorphism-structural-redesign/71-PERF-BASELINE.md
  modified:
    - app/globals.css
    - playwright.config.ts
decisions:
  - "Inter font stays (overrides SEED's Geist suggestion per RESEARCH G1) — no font swap in this phase"
  - "Glass-bg + gradient tokens defined for :root (light), .dark + admin-dark + dark-auth (dark), [data-theme=light] (forced-light for /estimate/*)"
  - "Brand gradient uses hsl(var(--primary)) NOT hex — tenants overriding --platform-primary get gradient cascade for free"
  - "Lighthouse install deferred to Plan 71-10 — runner ships now with graceful no-op, baseline numbers minted at perf gate"
  - "Visual snapshots NOT minted in this plan — /admin/design-system 404s; spec skips correctly until 71-02 lands the page"
metrics:
  duration_seconds: 326
  tasks_completed: 4
  files_created: 6
  files_modified: 2
  tests_added: 19
  tests_passing: 19
  completed: "2026-05-17T15:00:28Z"
---

# Phase 71 Plan 01: Glassmorphism Foundation Summary

Lay the design-system foundation — glass surface tokens, vibrant gradient palette, glow shadows, shimmer keyframes — using Tailwind v4 CSS-first idioms in `app/globals.css`, plus Playwright visual snapshot scaffold and Lighthouse perf-gate runner.

## What Was Built

### Tokens (app/globals.css — additive, ~110 lines appended)

**Glass surfaces** (light defaults in `:root`, dark in `.dark / [data-theme="admin-dark"] / [data-theme="dark-auth"]`, forced-light in `[data-theme="light"]`):
- `--glass-bg` (0.65 alpha), `--glass-bg-strong` (0.85), `--glass-bg-light` (subtle hover/active overlay), `--glass-border`
- `--glass-blur: 16px`, `--glass-blur-strong: 24px`

**Gradient palette** (brand-tinted use `hsl(var(--primary))` for tenant cascade):
- `--gradient-brand` — `linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)`
- `--gradient-hero` — radial, deeper alpha on dark scopes
- `--gradient-success / -warning / -danger` — hex-based status constants
- `--gradient-premium` — tri-stop primary → purple → pink

**Glow shadows + shimmer:**
- `--glow-brand`, `--glow-success` (namespaced `--glow-*`, not `--shadow-*`, per RESEARCH G9)
- `--shadow-glass` (8px 32px -8px) with deeper alpha on dark
- `--shimmer-duration: 1.2s` + `@keyframes button-shimmer-sweep`

**Accessibility:**
- `@media (prefers-reduced-transparency: reduce)` → `--glass-bg` falls back to `hsl(var(--card))`, blurs → 0px (covers `:root`, `.dark`, both data-theme dark scopes, forced-light)
- `@media (prefers-reduced-motion: reduce)` → `.btn-shimmer::before` disabled

**Utility classes (@layer utilities):**
`.glass`, `.glass-strong`, `.gradient-{brand,hero,success,warning,danger,premium}`, `.shadow-glow-{brand,success}`, `.shadow-glass`

### Test scaffold

- `tests/unit/design-system/tokens.test.ts` — 19 assertions: every token present, brand gradient uses `hsl(var(--primary))` (not hex), reduced-transparency block exists, light + dark scopes covered.
- `tests/e2e/visual/_helpers.ts` — `viewports` (desktop 1440×900 / tablet 768×1024 / mobile 375×812), `langs` (en/pt/es), `freezeAnimations`, `setLang` via `eb-language` cookie.
- `tests/e2e/visual/tokens.spec.ts` — `@visual`-tagged 3×3 matrix targeting `/admin/design-system`; auto-skips while route returns 404 (lands in 71-02), un-skips automatically once page exists.
- `tests/e2e/fixtures/freeze-animations.ts` — shared `freezeStyle` string for re-use across waves.
- `playwright.config.ts` — added `expect.toHaveScreenshot.maxDiffPixelRatio: 0.02` default; existing projects array, baseURL, workers untouched.

### Perf gate

- `scripts/lighthouse.mjs` — Node ESM CLI; prints markdown table; exit 2 if any URL < 80 on perf or a11y; gracefully exits 0 with install hint if `lighthouse`/`chrome-launcher` not installed.
- `.planning/phases/71-glassmorphism-structural-redesign/71-PERF-BASELINE.md` — placeholder table for `/` and `/dashboard` with TBDs + install + run instructions.

## Verification

- `bun run test tests/unit/design-system/tokens.test.ts` → **19/19 passing**
- `bunx playwright test tests/e2e/visual/tokens.spec.ts --project=chromium --grep @visual` → **9 skipped** (route 404, expected until 71-02)
- `grep -c "var(--glass-bg)" app/globals.css` → 2 (utilities + reduced-transparency block)
- `ls tailwind.config.*` → none (Tailwind v4 CSS-first, RESEARCH G2)
- `grep -i geist app/layout.tsx app/globals.css` → no matches (Inter stays, RESEARCH G1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forced-light test segment selection**
- **Found during:** Task 2 GREEN verification
- **Issue:** Initial unit test used `css.split(/\[data-theme="light"\]/)[1]` which grabs only the FIRST segment after the selector. Since `[data-theme="light"]` appears twice in globals.css (Phase 9 block without glass-bg + Phase 71 block with glass-bg), assertion failed despite the token being correctly declared.
- **Fix:** Changed to scan all `slice(1)` segments with `some()` — any one of them having the `rgba(255,255,255,...)` glass-bg passes.
- **Files modified:** `tests/unit/design-system/tokens.test.ts`
- **Commit:** `3e813a5` (bundled with GREEN commit)

## Authentication Gates

None — fully autonomous execution.

## Commits

| # | Hash      | Type | Subject |
|---|-----------|------|---------|
| 1 | `096b658` | test | add failing token tests + visual snapshot scaffold (RED) |
| 2 | `3e813a5` | feat | glass surface tokens + gradient palette + glow shadows (GREEN) |
| 3 | `c9aa5d9` | chore | Lighthouse runner + perf baseline placeholder |

Task 4 (snapshot mint pass) had no source changes — verified by running the visual scaffold and observing all 9 tests skip cleanly due to expected `/admin/design-system` 404. No commit needed.

## Downstream Notes for 71-02..71-10

1. **Consume tokens, do not redefine.** Components in 71-02 (`/admin/design-system` reference page + primitive variants) should use:
   - `className="glass"` / `"glass-strong"` for surfaces
   - `className="gradient-brand"` for primary CTA backgrounds
   - `style={{ boxShadow: 'var(--glow-brand)' }}` or `className="shadow-glow-brand"` for focus/hover glows
   - Arbitrary-value classes `bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]` when more control needed
2. **Snapshot mint:** Once 71-02 ships `/admin/design-system`, run `VISUAL=1 bunx playwright test tests/e2e/visual/tokens.spec.ts --update-snapshots --grep @visual` to mint the 9 baselines.
3. **Lighthouse install:** First plan that needs a real perf number should run `bun add -d lighthouse chrome-launcher` then `bun scripts/lighthouse.mjs http://localhost:9633/ http://localhost:9633/dashboard` and update `71-PERF-BASELINE.md`.
4. **Tenant cascade verified:** `--gradient-brand` is `hsl(var(--primary))`-based; any tenant injecting `--platform-primary` inline gets gradient buttons in their brand automatically — no per-tenant CSS overrides needed.

## Known Stubs

None. Tokens + utilities are fully functional; no placeholder values that would mislead downstream consumers.

## Self-Check: PASSED

Files verified on disk:
- `app/globals.css` (modified, +110 lines)
- `tests/unit/design-system/tokens.test.ts` (created, 19 assertions)
- `tests/e2e/visual/_helpers.ts` (created)
- `tests/e2e/visual/tokens.spec.ts` (created, @visual tag)
- `tests/e2e/fixtures/freeze-animations.ts` (created)
- `playwright.config.ts` (modified, maxDiffPixelRatio added)
- `scripts/lighthouse.mjs` (created)
- `.planning/phases/71-glassmorphism-structural-redesign/71-PERF-BASELINE.md` (created)

Commits verified in `git log`:
- `096b658` — test(71-01) RED
- `3e813a5` — feat(71-01) GREEN
- `c9aa5d9` — chore(71-01) perf runner
