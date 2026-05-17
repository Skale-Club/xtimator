# Phase 71: Glassmorphism Structural Redesign — Research

**Researched:** 2026-05-17
**Domain:** Visual design system overhaul (CSS tokens + shadcn variant extension + Playwright snapshot rebaseline)
**Confidence:** HIGH (codebase-grounded; all files verified)

## Summary

This is a **pure presentation** rebuild on Next 16 + React 19 + Tailwind v4 + shadcn (radix-ui) + framer-motion 12. Tailwind v4 means the design system lives in `app/globals.css` via `@theme inline` and `@layer base`; there is **no `tailwind.config.ts`** to extend (this is a SEED/CONTEXT assumption to correct). `next-themes` drives `.dark` class on `<html>`, and three `[data-theme="..."]` scopes override semantic tokens for admin, auth, and the public estimate share view. Existing primitives are CVA-based and trivially extend with a `glass` / gradient variant. Playwright is configured for chromium + iOS + Pixel — **no visual snapshot baselines exist yet** in `tests/e2e/`; all current e2e tests are role/text assertions, so "all snapshots will break" (per SEED) is actually "no snapshots exist; we mint them for the first time in this phase."

**Primary recommendation:** (1) Add glass/gradient tokens to `app/globals.css` under a new `@layer base` block (additive only). (2) Extend each shadcn primitive's `cva` config with new variants (`variant: { ..., glass: "..." }`) — never touch `default`. (3) Introduce visual snapshot tests in this phase (greenfield baseline, not regression). (4) Correct CONTEXT.md's "Geist" decision → project ships **Inter** via `next/font/google` in `app/layout.tsx`; either swap to Geist properly or keep Inter (Geist requires `geist` npm package install + `--font-geist-sans` variable rewire).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Aesthetic: glassmorphism + vibrant gradients (Apple Watch + Stripe Dashboard hybrid). Frosted blurs on hero zones / modals / sidebar only. Gradients as accents, not page backgrounds.
- Brand: `--primary: 224 86% 60%` (#406EF1) byte-identical; logo + wordmark unchanged; dark-mode default preserved; scoped themes `[data-theme="dark-auth"]`, `[data-theme="admin-dark"]`, `[data-theme="light"]` preserved.
- Tokens are **additive** to `globals.css` (glass-bg, glass-bg-strong, glass-bg-light, glass-border, glass-blur, glass-blur-strong; gradient-brand, gradient-hero, gradient-success, gradient-warning, gradient-danger).
- Typography: `--font-display` / `--font-sans` / `--font-mono` using Geist. **GAP — see Gotcha G1.**
- Component refactors: extend shadcn primitives via new CVA variants. Never replace existing variants.
- Performance gates: `backdrop-filter` only on hero/modal/sidebar; Lighthouse ≥ 80 on `/` and `/dashboard`; FLJS < 500 KB on `/dashboard`; `prefers-reduced-transparency` solid-bg fallback; `prefers-reduced-motion` disables shimmer.
- A11y: WCAG AA (4.5:1) on every glass surface over its real backdrop.
- i18n: test EN + PT + ES on every redesigned screen.
- Snapshot strategy: re-mint baselines per wave via `npx playwright test --update-snapshots`.
- 5 waves, 10 plans. Run via `gsd:ui-phase` first to lock UI-SPEC.md.

### Claude's Discretion
- Shimmer animation curve/duration (recommend 1.2s ease-in-out).
- Gradient angles (135° default, ±20° nudge per surface OK).
- Optional grain/noise SVG texture.
- Table/list density (current is comfortable; tighten 10-15% if crowded).
- Empty-state illustration style (line/filled/duotone — pick one and apply globally).
- Stat-card framer-motion micro-interactions (recommended: scale + glow hover).
- Mobile drawer animation (slide vs fade-blur).
- Whether to add a `Surface` abstraction in `lib/` or keep glass as Tailwind utilities.

### Deferred Ideas (OUT OF SCOPE)
- Logo redesign, new brand color, custom illustrations, mascot, onboarding tour, custom font licensing, animation lib beyond framer-motion + CSS keyframes, full a11y audit, mobile-native gestures, Storybook setup.

---

## Project Constraints (from CLAUDE.md)
- Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui (already in place — Next 16, Tailwind v4).
- Zustand or React Context for state; react-hook-form + zod for forms.
- All AI server-side. (N/A this phase.)
- Mobile capture must work on iOS Safari / Android Chrome → snapshot tests must cover mobile-safari + mobile-chrome projects.
- Workflow: use `/gsd:execute-phase` for planned phase work — already in flight.

---

## Phase Requirements

This phase has no requirement IDs in `.planning/REQUIREMENTS.md`. Surface inventory + ROADMAP item #10 (performance/a11y gates) act as acceptance criteria.

---

## Current Design Token Map (verbatim from `app/globals.css`)

### `:root` (light, default)
| Token | Value |
|---|---|
| `--system-primary` | `224 86% 60%` |
| `--system-secondary` | `221 84% 73%` |
| `--background` | `0 0% 100%` |
| `--foreground` | `240 10% 3.9%` |
| `--card` / `--card-foreground` | `0 0% 100%` / `240 10% 3.9%` |
| `--popover` / `--popover-foreground` | `0 0% 100%` / `240 10% 3.9%` |
| `--primary` | `var(--system-primary)` |
| `--primary-foreground` | `0 0% 98%` |
| `--secondary` | `var(--system-secondary)` |
| `--secondary-foreground` | `240 10% 3.9%` |
| `--muted` / `--muted-foreground` | `240 4.8% 95.9%` / `240 3.8% 46.1%` |
| `--accent` / `--accent-foreground` | `240 4.8% 95.9%` / `240 5.9% 10%` |
| `--destructive` / `--destructive-foreground` | `0 84.2% 60.2%` / `0 0% 98%` |
| `--border` / `--input` | `240 5.9% 90%` |
| `--ring` | `var(--system-primary)` |
| `--radius` | `0.5rem` |
| `--success` / `-foreground` / `-muted` | `142 76% 36%` / `0 0% 100%` / `142 76% 94%` |
| `--warning` / `-foreground` / `-muted` | `38 92% 50%` / `0 0% 100%` / `48 96% 89%` |
| `--info` / `-foreground` / `-muted` | `221 83% 53%` / `0 0% 100%` / `214 95% 93%` |
| `--danger` / `-foreground` / `-muted` | `0 84% 60%` / `0 0% 100%` / `0 93% 94%` |

### `.dark` overrides
- `--background: 240 10% 3.9%`, `--foreground: 0 0% 98%`, `--card: 240 10% 3.9%`, `--popover: 240 5% 15%`, `--muted: 240 3.7% 15.9%`, `--border / --input: 240 3.7% 15.9%`, `--destructive: 0 62.8% 30.6%`. Status tokens shifted (success 142 70% 45%, warning 38 92% 60%, info 217 91% 60%, danger 0 72% 55%; `-muted` variants ~15-18% L).

### `[data-theme="admin-dark"], [data-theme="dark-auth"]` (scoped)
- `--background: 240 6% 6%` (deeper than `.dark`), `--card: 240 4% 11%`, `--popover: 240 4% 11%`, `--border: 240 4% 20%`, `--input: 240 4% 16%`, `--muted: 240 4% 16%`, `--destructive: 0 62.8% 45%`.
- `--primary: var(--platform-primary, var(--system-primary))` — **runtime override hook**: `app/(auth)/layout.tsx` and `app/admin/layout.tsx` set `--platform-primary` as inline style from `getBranding().primaryColor` via `hexToHslTriplet()`.

### `[data-theme="light"]` (forced-light scope for `/estimate/*` + PDF)
- Mirrors `:root` light tokens — used by `app/estimate/[token]/layout.tsx`.

### Phase 9 Pillar C additions (also in `globals.css`)
- Radius scale: `--radius-xs: 0.25rem` → `--radius-xl: 1rem`, `--radius-full: 9999px`.
- `--focus-shadow: 0 0 0 3px hsl(var(--ring) / 0.35)` (`.dark` / `admin-dark` / `dark-auth` bumps alpha to 0.45).
- Font-size + line-height scale `xs → 3xl`, weights 400/500/600/700, tracking tight/tighter/normal.
- Spacing hints `--space-stack-xs → -xl`.

### `@theme inline` block (Tailwind v4 mapping)
All semantic tokens re-exported as `--color-*` so utilities like `bg-card`, `text-foreground`, `border-border` resolve. `--font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif` — **font is Inter, not Geist (see G1)**.

### Keyframes / Utility CSS Already Present
- `@keyframes shimmer { 0% { translateX(-100%) } 100% { translateX(100%) } }` — used by `components/ui/skeleton.tsx`.
- `.card-hover-gradient` — Phase 11 landing-page gradient border via mask-composite. **Lift this technique into the Wave 1 token system** (gradient border on stat cards).
- `@keyframes waveform` — Phase 11 product mockup pulse, gated by `prefers-reduced-motion: no-preference`.

---

## Tailwind / Build Stack (CORRECTED)

| Item | Reality |
|---|---|
| Tailwind | **v4** (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`) — **CSS-first config in `globals.css`** |
| `tailwind.config.ts` | **DOES NOT EXIST** — config lives in `@import "tailwindcss"; @theme inline { ... }` inside `globals.css` |
| `tailwind.config.js/ts` extension | Use `@theme inline { --color-glass-bg: rgba(...); --backdrop-blur-glass: 16px; }` blocks, not `theme.extend.backgroundImage` |
| Next.js | 16.2.3 (App Router, `output: 'standalone'`) |
| React | 19.2.4 |
| TS | strict (`tsconfig.json`) |
| Font | **Inter** via `next/font/google`, exposed as `--font-inter` |
| framer-motion | 12.38.0 — used in `components/landing/{hero,how-it-works,final-cta,features}-section.tsx` only |
| next-themes | 0.4.6 (`attribute="class"`, `defaultTheme = saved ?? 'dark'`) |
| radix-ui | meta package (`radix-ui: ^1.4.3`) — imported as namespaces (`import { Dialog as DialogPrimitive } from "radix-ui"`) |
| lucide-react | 1.8.0 (icons) |
| `class-variance-authority` | 0.7.1 |
| `tailwind-merge` | 3.5.0 (used in `cn()`) |
| `@tailwindcss/typography` | 0.5.19 (loaded as `@plugin` in globals.css) |

---

## shadcn Primitive Inventory (`components/ui/`)

29 primitives. Bolded ones are listed in CONTEXT decisions and need new variants.

| File | Has CVA? | Current variants | Variant work for this phase |
|---|---|---|---|
| `alert-dialog.tsx` | inherits | (radix wrapper) | + glass overlay + glass-bg-strong on content |
| `alert.tsx` | yes | (verify) | + `variant: glass`, gradient left-border per status |
| `avatar.tsx` | no | — | optional gradient ring |
| `badge.tsx` | yes | `default / secondary / destructive / outline / ghost / link` | **+ `success / brand / warning / danger`** gradient variants |
| **`button.tsx`** | yes | `default / destructive / outline / secondary / ghost / link` × `default / xs / sm / lg / icon / icon-xs / icon-sm / icon-lg` | + `primary` (gradient-brand bg + shimmer hover); existing `default` keeps current solid `bg-primary` (backward compat) |
| `calendar.tsx` | no | — | inherit popover glass |
| **`card.tsx`** | **no CVA — plain div** | n/a | **add `cva` + variants `default / glass / hero`**; OR pass through `className` and add `<GlassCard>` wrapper |
| `checkbox.tsx` | no | — | gradient checked-state |
| `command.tsx` | no | — | glass on root popup |
| **`dialog.tsx`** | no CVA | overlay = `bg-black/50`; content = `bg-background border` | overlay → add `backdrop-blur-md`; content → `bg-[var(--glass-bg-strong)] backdrop-blur-[var(--glass-blur-strong)]` |
| `dropdown-menu.tsx` | inherits | — | glass surface |
| `form.tsx` | no | — | n/a |
| **`input.tsx`** | no CVA | focus = `focus-visible:shadow-[var(--focus-shadow)]` | focus → gradient bottom border (3px) + brand glow shadow |
| `label.tsx` | no | — | n/a |
| `navigation-menu.tsx` | partial | (verify) | glass on dropdown |
| `popover.tsx` | no | — | glass surface |
| `progress.tsx` | no | flat bar | gradient-brand fill |
| `radio-group.tsx` | no | — | gradient selected dot |
| `scroll-area.tsx` | no | — | n/a |
| `select.tsx` | inherits | — | glass dropdown |
| `separator.tsx` | no | — | optional gradient tint |
| **`sheet.tsx`** | yes (side) | `side: top/right/bottom/left` | overlay → blur; content → glass-bg-strong |
| **`skeleton.tsx`** | no | shimmer via `before:bg-[linear-gradient(90deg,transparent,hsl(var(--foreground)/0.06),transparent)]` | swap shimmer tint to `hsl(var(--primary)/0.10)` |
| `sonner.tsx` | no | — | glass + gradient left border per status |
| `switch.tsx` | no | — | gradient checked track |
| `table.tsx` | no | — | leave flat (perf); subtle row hover only |
| **`tabs.tsx`** | yes | `variant: default / line` | `line` underline `after:bg-foreground` → swap to `after:bg-[var(--gradient-brand)] after:h-[2px]` |
| `textarea.tsx` | (verify) | — | mirror input focus treatment |
| `tooltip.tsx` | no | — | glass-bg-strong + small blur |

**Key finding:** `Card` is a plain `<div>` with no CVA. Wave 1 must either (a) introduce CVA on Card OR (b) ship a parallel `<GlassCard>` wrapper. Recommendation: **add CVA to Card** — it's used in hundreds of places and a `variant="glass"` prop is cleaner than mass-import swaps.

---

## Surface Inventory (every `page.tsx` / `layout.tsx` to be touched)

Verified via filesystem traversal on 2026-05-17.

### Marketing (Wave 2)
- `app/page.tsx` → renders `<LandingPage>` from `components/landing/landing-page.tsx`
- `app/blog/page.tsx`
- `app/blog/[slug]/page.tsx`

### Auth (Wave 2)
- `app/(auth)/layout.tsx` → `data-theme="dark-auth"` + `--platform-primary` injection
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/(auth)/reset-password/page.tsx`

### Onboarding (Wave 2)
- `app/onboarding/page.tsx` (single-page wizard; no nested route per filesystem — CONTEXT mentions `/onboarding/*` but only `/onboarding` exists)

### App Shell (Wave 3)
- `app/(app)/layout.tsx` — Sidebar + Topbar + MobileHeader + BottomNav + TrialBanner + UpgradeModal + TranslationLoadingOverlay
- `components/app-shell/sidebar.tsx`
- `components/app-shell/topbar.tsx`
- `components/app-shell/mobile-header.tsx`
- `components/app-shell/bottom-nav.tsx`
- `components/app-shell/theme-toggle.tsx`
- `components/app-shell/language-toggle.tsx`
- `components/app-shell/company-selector.tsx`

### Dashboard + Collections (Wave 3)
- `app/(app)/dashboard/page.tsx`
- `app/(app)/clients/page.tsx`
- `app/(app)/clients/[id]/page.tsx`
- `app/(app)/projects/page.tsx`
- `app/(app)/projects/new/page.tsx`

### Project workspace (Wave 4)
- `app/(app)/projects/[id]/page.tsx` (5-tab workspace)
- `app/(capture)/layout.tsx`
- `app/(capture)/projects/[id]/capture/page.tsx`
- `app/(capture)/projects/[id]/describe/page.tsx`
- `app/(capture)/projects/[id]/photos-input/page.tsx`

### Public Share + Estimate (Wave 5)
- `app/estimate/[token]/layout.tsx` (`data-theme="light"`)
- `app/estimate/[token]/page.tsx`

### Settings (Wave 5)
- `app/(app)/settings/page.tsx`
- `app/(app)/settings/appearance/page.tsx`
- `app/(app)/settings/billing/page.tsx`
- `app/(app)/settings/custom-domain/page.tsx`
- `app/(app)/settings/estimate-templates/page.tsx`
- `app/(app)/settings/integrations/page.tsx`
- `app/(app)/settings/payments/page.tsx`
- `app/(app)/settings/price-book/page.tsx`
- **NOT FOUND:** `/settings/profile`, `/settings/branding`, `/settings/defaults`, `/settings/notifications`, `/settings/templates`, `/settings/language`, `/settings/notifications` (SEED mentions these but they don't exist as separate pages). Planner must reconcile against actual file list.

### Admin (Wave 5)
- `app/admin/layout.tsx` (`data-theme="admin-dark"`)
- `app/admin/page.tsx`
- `app/admin/admins/page.tsx`
- `app/admin/billing/page.tsx`
- `app/admin/branding/page.tsx`
- `app/admin/blog/page.tsx`
- `app/admin/blog/new/page.tsx`
- `app/admin/blog/[id]/page.tsx`
- `app/admin/integrations/page.tsx`
- `app/admin/landing/page.tsx`
- `app/admin/seo/page.tsx`
- **NEW (Wave 1, REDESIGN-03):** `app/admin/design-system/page.tsx` — token + variant reference gallery

### Root
- `app/layout.tsx` — `<html class="dark">` default via next-themes; loads Inter font; wraps in `<ThemeProvider>` + `<LanguageProvider>`. Font swap (if Geist adopted) lands here.

**Total surfaces:** 41 page.tsx/layout.tsx files + 7 app-shell components.

---

## Animation Patterns

### Where framer-motion is used today
Only `components/landing/{hero,how-it-works,features,final-cta}-section.tsx`. **Not used inside `(app)`, `(auth)`, `admin`, or `estimate` shells.** Adding stat-card hover micro-interactions or modal entry choreography is new ground — recommended to gate via `useReducedMotion()` from framer-motion.

### CSS keyframes already defined (in `globals.css`)
- `shimmer` — Skeleton loader (1.8s ease-in-out infinite via `animate-[shimmer_1.8s_ease-in-out_infinite]`)
- `waveform` — landing product mockup pulse (gated by `prefers-reduced-motion: no-preference`)

### New animations needed
- Button shimmer hover (CSS keyframe, ~1.2s ease-in-out, animate background-position on gradient).
- Stat card hover (framer-motion `whileHover={{ scale: 1.02 }}` + box-shadow glow).
- Modal entry — radix already drives `data-state=open → fade-in-0 zoom-in-95`; can keep CSS animations or layer framer-motion. Keep CSS to avoid bundle bloat.

### Pattern for new shimmer (button)
```css
@keyframes button-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@media (prefers-reduced-motion: no-preference) {
  .btn-shimmer:hover { animation: button-shimmer 1.2s ease-in-out infinite; }
}
```

---

## Playwright Snapshot Strategy

### Current state
- Config: `playwright.config.ts` — `testDir: './tests/e2e'`, three projects (`chromium` / `mobile-safari` iPhone 13 / `mobile-chrome` Pixel 7), `workers: 1`, `fullyParallel: false`, baseURL `http://localhost:9633`.
- Existing e2e specs (14): all use role/text assertions (`expect(heading).toBeVisible()`), zero calls to `toHaveScreenshot()` / `toMatchSnapshot()` (grep verified).
- No `__snapshots__` or `*.png` baseline files exist in `tests/e2e/`.

### Implication for this phase
"All snapshots will break" is FALSE — **there are no snapshots yet**. This phase **introduces** visual snapshot coverage for the first time. The work is:
1. Wave 1: write `tests/e2e/visual/*.spec.ts` with `await expect(page).toHaveScreenshot('dashboard.png')` per surface, per viewport.
2. Mint baselines: `bun playwright test --update-snapshots`.
3. Per-wave: regenerate baselines for surfaces redesigned in that wave.
4. CI gating: surfaces NOT touched in current wave must NOT change visually → snapshots act as cross-wave regression guard.

### Coverage gaps to fill
- Need a `visual` directory or tag (e.g., `@visual` tag + grep `--grep @visual`) to separate from behavioral specs.
- Need to disable shimmer/animations during snapshot run: `await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })` in `test.beforeEach`.
- Need fixture for auth state (login flow) so app-shell snapshots can render — `tests/e2e/fixtures/` exists, reuse pattern.
- Per-viewport: only chromium covers desktop today; iPhone 13 + Pixel 7 cover mobile. Add a `tablet` viewport (768×1024) if Wave 4 tablet treatment is needed.

### Snapshot command
```bash
bun playwright test --update-snapshots --grep @visual
# CI verification
bun playwright test --grep @visual
```

---

## Performance Baseline

**No measured Lighthouse baselines exist** for `/` or `/dashboard` in the repo (no `.lighthouserc`, no recorded scores in `.planning/`). Wave 1 must:
1. Run Lighthouse against `localhost:9633/` and `localhost:9633/dashboard` (authenticated fixture) — record scores in `71-RESEARCH-BASELINE.md` or append to this doc.
2. Record `.next/analyze` bundle output for First Load JS on `/dashboard` (run `ANALYZE=true bun run build` if `@next/bundle-analyzer` configured — **not currently installed**; either add it or use `next build` stdout summary which prints FLJS per route).

### `backdrop-filter` usage today
Grep for `backdrop-blur` / `backdrop-filter` in `app/` + `components/` returned **zero matches**. Phase 71 introduces backdrop-filter for the first time. This means:
- **Pro:** no existing GPU footprint to worry about; can budget cleanly.
- **Con:** no real-device validation history; planner must include a manual mid-range Android test step.

### Performance gate enforcement
- Add Lighthouse CI step to verify `/` and `/dashboard` ≥ 80 perf + a11y after each wave.
- For FLJS, parse `next build` output (e.g., `┌ ○ /dashboard … 480 kB`) — fail if > 500 KB.
- `backdrop-filter` allowlist: hero containers, modal/sheet content, sidebar `<aside>`, topbar `<header>`. Lint via custom ESLint rule (optional) or PR-time grep.

---

## i18n Coverage

### Mechanism
- `lib/i18n/translations.ts` — single 242-line file with `staticDict: { pt: {...}, es: {...} }` keyed by English source string. `lib/i18n/use-translation.ts` exposes `t(key)`. Anything dynamic/long-form is fetched via `lib/i18n/resolve-estimate-language.ts`.
- `LanguageProvider` wraps app in `app/layout.tsx`; toggle in `components/app-shell/language-toggle.tsx`.

### Typography pressure points (PT/ES strings ~30% longer)
Sample long translations to test against new type scale:
- `'Settings' → 'Configurações'` (sidebar, 13 chars → mobile bottom-nav width risk)
- `'New Project' → 'Novo Projeto'` / `'Nuevo Proyecto'` (header button)
- `'Upload' → 'Enviar arquivo'` (15 chars vs 6 — capture/photos upload button)
- `'Recordings' → 'Gravações'` / `'Grabaciones'` (project tab labels)
- Status badge labels: `'Sent' / 'Accepted' / 'Declined' / 'Paid'` → `Enviado / Aceito / Recusado / Pago` (capped width risk on `<Badge>` with fixed padding).
- Trial banner ("X days remaining") — full sentences, breaks early on mobile.

### Typography-sensitive surfaces
1. **Capture stepper** (`(capture)` layout) — step labels in horizontal list; PT/ES will wrap.
2. **Dashboard stat cards** — stat labels ("Active Projects" → "Projetos Ativos") need to not break the layout.
3. **Buttons** with both icon + label — verify `hero` button (`size: lg`, `clamp(48-72px)` hero context) doesn't break the gradient bg in PT.
4. **Tab labels** in project workspace (5 tabs) — PT names are longer; on mobile breakpoint already cramped.

### Recommendation
- Add Playwright `lang` parameter via cookie injection: `await context.addCookies([{ name: 'eb-language', value: 'pt', ... }])` so each visual snapshot test runs 3× (en/pt/es) per viewport.
- That gives matrix: **41 surfaces × 3 viewports × 3 langs = 369 snapshots**. Slim by snapshotting only PT (longest) for layout regression; keep EN for full visual baseline.

---

## Reduced-Transparency / Reduced-Motion

### Current support
- `prefers-reduced-motion: no-preference` gate exists for `waveform` keyframe in `globals.css` (Phase 11).
- Skeleton shimmer animation is **NOT gated** — runs always. Fix recommended as part of Wave 1.
- `prefers-reduced-transparency` — **zero usages today** (grep returned no hits in code).
- framer-motion components do not use `useReducedMotion()` hook currently.

### What this phase must add
```css
@media (prefers-reduced-transparency: reduce) {
  .glass, [data-glass] {
    background-color: hsl(var(--card)) !important;
    backdrop-filter: none !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .btn-shimmer { animation: none !important; }
  .skeleton::before { animation: none !important; }
}
```
- Plus `useReducedMotion()` from framer-motion on any new motion components.
- All new keyframes must be wrapped in `@media (prefers-reduced-motion: no-preference)` (the Phase 11 `waveform` pattern is the model).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---|---|---|
| Gradient borders on cards | DIY pseudo-elements per card | Lift the existing `.card-hover-gradient` pattern (mask-composite) from globals.css into a reusable utility class `.gradient-border` |
| Theme toggle | new `useTheme` hook | `next-themes` (already wired); just add new tokens that respect `.dark` |
| Brand color injection | DOM mutation | Existing `--platform-primary` CSS variable pattern in `(auth)/layout.tsx` + `admin/layout.tsx` |
| HSL/Hex conversion | custom | `lib/color.ts` `hexToHslTriplet()` (already used) |
| Visual snapshot diffing | custom screenshot lib | Playwright `toHaveScreenshot()` (built-in) |
| Variant typing | manual prop unions | CVA `VariantProps<typeof xxxVariants>` (existing pattern in every primitive) |
| Toast notifications | custom | `sonner` (already installed and wrapped in `components/ui/sonner.tsx`) |
| Class merging | custom | `cn()` from `lib/utils.ts` (already used everywhere) |

---

## Gotchas + Pitfalls

### G1 — Font mismatch (CONTEXT says Geist, code uses Inter) — **HIGH severity**
- CONTEXT.md decision: "`--font-display = Geist`, `--font-sans = Geist`, `--font-mono = Geist Mono`".
- Reality: `app/layout.tsx` imports `Inter` from `next/font/google` as `--font-inter`; `globals.css` `@theme inline` block sets `--font-sans: var(--font-inter), ...`.
- **Action for planner:** either (a) install Geist via `npm i geist`, swap `Inter` → `GeistSans` + `GeistMono` from `geist/font/{sans,mono}`, expose as `--font-geist-sans` / `--font-geist-mono`, update `@theme inline`; OR (b) ratify Inter as the choice and update CONTEXT.md. Geist is free, but it's a coordinated change touching `app/layout.tsx` + `globals.css` + every reference to `var(--font-inter)`.

### G2 — `tailwind.config.ts` does not exist — **HIGH severity**
- CONTEXT.md / SEED says "extend `tailwind.config.ts` — `theme.extend.backgroundImage` / `theme.extend.backdropBlur`". This is **Tailwind v3 syntax**; project is on **v4**.
- All extensions must go inside `@theme inline { ... }` in `globals.css`, OR rely on Tailwind v4 arbitrary values (`backdrop-blur-[var(--glass-blur)]`, `bg-[var(--glass-bg)]`).
- Custom utilities: write as plain CSS classes in `globals.css` under `@layer utilities`, e.g.:
  ```css
  @layer utilities {
    .glass { background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur)); border: 1px solid var(--glass-border); }
  }
  ```

### G3 — `Card` has no CVA — **MEDIUM severity**
- `components/ui/card.tsx` is a plain `<div>` (no variants). Adding `variant="glass"` requires introducing CVA on Card from scratch. Pattern is trivial (mirror Button), but every existing call site must remain backward compatible (default variant = current behavior).

### G4 — Inline `style={}` injection points — **LOW severity**
- 3 files use inline `style={}`: `app/(auth)/layout.tsx`, `app/admin/layout.tsx` (both inject `--platform-primary`), and `app/admin/branding/branding-preview-card.tsx`. These are correct — they're setting CSS custom properties at runtime. **Do not touch.** Just verify new tokens (gradients) don't conflict if a tenant overrides primary brand color.

### G5 — Hex colors in source — **LOW severity**
- Grep for `#[0-9a-fA-F]{3,6}` in `app/`: only `globals.css` (2 — `9 fff` is in a mask trick), `manifest.ts` (1, brand color), `icon.svg` (4, logo SVG), `api/estimates/[id]/send/route.ts` (1, email HTML inline color). No rogue inline hex colors in TSX components. **Clean.**

### G6 — Scoped themes consume `--platform-primary` — **MEDIUM severity**
- `[data-theme="admin-dark"]` and `[data-theme="dark-auth"]` set `--primary: var(--platform-primary, var(--system-primary))`. If we define `--gradient-brand: linear-gradient(135deg, #406EF1 0%, #7FA4F4 100%)` with hard-coded hex, **tenant brand overrides won't propagate to gradients.**
- **Fix:** define gradient tokens using `hsl(var(--primary))` instead of hard-coded hex:
  ```css
  --gradient-brand: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%);
  ```
- This makes white-label tenants' gradient buttons match their brand automatically. **CRITICAL design decision** for Wave 1.

### G7 — `[data-theme="light"]` on `/estimate/*` — **MEDIUM severity**
- The customer-facing share page is forced light mode (`app/estimate/[token]/layout.tsx`). Glass tokens defined for dark only (CONTEXT: `--glass-bg: rgba(20, 24, 33, 0.6)`) won't read well on white bg.
- **Fix:** glass tokens need light-mode counterparts in `:root` AND `[data-theme="light"]`:
  ```css
  --glass-bg: rgba(255, 255, 255, 0.65);
  --glass-bg-strong: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(15, 23, 42, 0.08);
  ```

### G8 — `disableTransitionOnChange` in ThemeProvider — **LOW severity**
- `app/layout.tsx` sets `<ThemeProvider disableTransitionOnChange>`. This is intentional to prevent theme-flip flash. New gradient/blur transitions on hover are unaffected, but if Wave 1 adds an animated dark→light gradient mode transition, this prop blocks it. **Leave as-is.**

### G9 — Tailwind v4 `--shadow-*` namespace collision — **LOW severity** (already mitigated)
- `globals.css` comments note: focus shadow was renamed from `--shadow-focus` to `--focus-shadow` to avoid Tailwind v4 wildcard utility generation (`.shadow-[var(--shadow-*)]`). Use a distinct namespace for new glow shadows: `--glow-brand`, `--glow-success`, NOT `--shadow-*`.

### G10 — `lucide-react` is at v1.8.0 — **LOW severity, VERIFY**
- That major version looks suspicious (lucide-react is typically 0.x in this era — current is ~0.4xx). Either it's a recent rewrite or a typo in package.json. Either way, icon API should be stable; just verify icons render before relying on new ones for empty-state illustrations.

### G11 — Settings sub-routes mismatch — **MEDIUM severity**
- SEED + CONTEXT enumerate `/settings/{profile, branding, defaults, notifications, templates, language}` but those files DO NOT EXIST. Actual settings pages: appearance, billing, custom-domain, estimate-templates, integrations, payments, price-book, and root.
- **Planner action:** reconcile inventory before Wave 5; either descope missing pages or confirm they live under different routes (e.g., "branding" may be a tab inside `/settings/appearance`).

### G12 — Capture full-screen shell — **MEDIUM severity**
- `app/(capture)/layout.tsx` is a separate route group designed to be full-screen (no app-shell sidebar/topbar). framer-motion is already used in the capture recorder for the gradient ring. Glass treatment here must NOT add the app-shell sidebar; respect the capture-specific layout.

### G13 — Trial banner + upgrade modal already in app shell — **LOW severity**
- `app/(app)/layout.tsx` renders `<TrialBanner>` + `<UpgradeModal>` unconditionally. New glass treatment on these is part of Wave 3, but they're not in `app/page.tsx` tree so won't show in marketing screenshots. Snapshot fixtures must control authenticated state.

---

## Code Examples

### Adding glass + gradient tokens (Tailwind v4 way)
```css
/* app/globals.css — append a new @layer base block, do not edit existing */
@layer base {
  :root {
    /* Glass — light defaults */
    --glass-bg: rgba(255, 255, 255, 0.65);
    --glass-bg-strong: rgba(255, 255, 255, 0.85);
    --glass-bg-light: rgba(15, 23, 42, 0.04);
    --glass-border: rgba(15, 23, 42, 0.08);
    --glass-blur: 16px;
    --glass-blur-strong: 24px;

    /* Gradients — reference semantic tokens so tenant brand color cascades */
    --gradient-brand: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%);
    --gradient-hero: radial-gradient(circle at top, hsl(var(--primary) / 0.33) 0%, transparent 70%);
    --gradient-success: linear-gradient(135deg, hsl(var(--success)) 0%, hsl(142 76% 60%) 100%);
    --gradient-warning: linear-gradient(135deg, hsl(var(--warning)) 0%, hsl(48 96% 70%) 100%);
    --gradient-danger:  linear-gradient(135deg, hsl(var(--danger)) 0%, hsl(0 84% 75%) 100%);

    /* Glow shadows (NOT --shadow-* — namespace collision, see G9) */
    --glow-brand:   0 0 24px hsl(var(--primary) / 0.35);
    --glow-success: 0 0 24px hsl(var(--success) / 0.35);
  }
  .dark, [data-theme="admin-dark"], [data-theme="dark-auth"] {
    --glass-bg: rgba(20, 24, 33, 0.6);
    --glass-bg-strong: rgba(20, 24, 33, 0.85);
    --glass-bg-light: rgba(255, 255, 255, 0.04);
    --glass-border: rgba(255, 255, 255, 0.08);
  }
  [data-theme="light"] {
    --glass-bg: rgba(255, 255, 255, 0.65);
    --glass-bg-strong: rgba(255, 255, 255, 0.85);
    --glass-border: rgba(15, 23, 42, 0.08);
  }
}

@layer utilities {
  .glass {
    background-color: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
  }
  .glass-strong {
    background-color: var(--glass-bg-strong);
    backdrop-filter: blur(var(--glass-blur-strong));
    -webkit-backdrop-filter: blur(var(--glass-blur-strong));
    border: 1px solid var(--glass-border);
  }
  .gradient-brand { background-image: var(--gradient-brand); }
  .gradient-hero  { background-image: var(--gradient-hero);  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass, .glass-strong {
    background-color: hsl(var(--card));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
```

### Extending Button with `primary` gradient variant
```ts
// components/ui/button.tsx — add to existing cva variant block
variant: {
  default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 ...", // unchanged
  primary: "gradient-brand text-primary-foreground shadow-[var(--glow-brand)] hover:scale-[1.01] active:scale-100 relative overflow-hidden btn-shimmer",
  // ...rest unchanged
}
```

### Snapshot test pattern (Wave 1 introduces)
```ts
// tests/e2e/visual/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Freeze animations for deterministic screenshots
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })
})

test('@visual dashboard — dark, en', async ({ page }) => {
  // (auth fixture sets cookie)
  await page.goto('/dashboard')
  await expect(page).toHaveScreenshot('dashboard-dark-en.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
})
```

---

## Validation Architecture

Phase 71 has `nyquist_validation` enabled (assumed — no project config override seen).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit/integration) + Playwright 1.59.1 (e2e/visual) |
| Config files | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `bun run test` (vitest run) |
| Visual mint | `bun playwright test --update-snapshots --grep @visual` |
| Visual verify | `bun playwright test --grep @visual` |
| Full e2e | `bun run test:e2e` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|--------------|
| REDESIGN-tokens | Glass + gradient tokens defined; reduced-transparency fallback works | unit (CSS load) | `bun run test` | ❌ Wave 1 must create `tests/unit/design-system/tokens.test.ts` |
| REDESIGN-variants | Button/Badge/Card/Dialog new variants render expected classes | unit (RTL) | `bun run test` | ❌ Wave 1 must add component snapshot tests |
| REDESIGN-surfaces | Every redesigned surface matches its visual baseline per (viewport × lang) | visual e2e | `bun playwright test --grep @visual` | ❌ ALL — no `tests/e2e/visual/` directory exists |
| REDESIGN-perf | Lighthouse ≥ 80 perf+a11y on `/` and `/dashboard` | manual + CI | (add `scripts/lighthouse.mjs` Wave 1) | ❌ |
| REDESIGN-flj | First Load JS for `/dashboard` < 500 KB | parse next build | `bun run build` + grep dashboard line | ✅ exists implicitly |
| REDESIGN-a11y-glass | Every glass surface ≥ 4.5:1 contrast over its real backdrop | manual (axe-playwright optional) | — | ❌ |

### Sampling Rate
- **Per task commit:** `bun run test` (vitest) — fast unit + RTL.
- **Per wave merge:** `bun run test:e2e` + `bun playwright test --grep @visual --update-snapshots`, then commit baselines.
- **Phase gate:** Full suite green + Lighthouse manual check on `/` and `/dashboard` before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/e2e/visual/` — new directory; per-surface specs
- [ ] `tests/unit/design-system/tokens.test.ts` — verify CSS custom props resolve in jsdom
- [ ] `tests/e2e/fixtures/authenticated-state.json` — pre-baked auth cookies for app-shell snapshots
- [ ] `scripts/lighthouse.mjs` — Lighthouse runner for perf gate
- [ ] Add `@visual` tag convention to Playwright (no config change needed; uses `--grep`)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node + Bun | dev/test runner | ✓ (Bun lockfile present) | — | npm/pnpm |
| Playwright browsers | visual snapshots | ⚠ verify | 1.59.1 | `bunx playwright install` Wave 1 |
| Lighthouse CLI | perf gate | ✗ likely | — | `bunx lighthouse <url>` per-run |
| `geist` npm package | font swap (if G1 chosen path A) | ✗ | — | Keep Inter (path B) |
| Real mid-range Android device | backdrop-filter perf validation | ✗ | — | Chrome DevTools 4× CPU throttle |

**Missing with no fallback:** none — all gaps have reasonable substitutes.

---

## Open Questions

1. **Geist vs Inter — locked which?**
   CONTEXT says Geist; code is Inter. Resolve before Wave 1 typography work.

2. **Settings sub-route reconciliation**
   SEED enumerates 9 settings pages; only 8 exist. Confirm "profile / branding / defaults / notifications / language" are tabs under existing pages, separate seeds, or deferred.

3. **Custom font weight handling for `--font-display`?**
   Inter (and Geist) ships variable; `clamp(48-72)` hero headlines need a designated weight (700/800). Document in UI-SPEC.

4. **Should `Card` get CVA, or do we ship `<GlassCard>` alongside?**
   Recommendation: CVA on Card. Confirm with planner.

5. **i18n snapshot matrix size — 369 baselines or trimmed?**
   Recommendation: snapshot all surfaces in EN dark + EN light, only longest-string surfaces (badges, buttons, stepper, bottom-nav) in PT.

---

## Sources

### Primary (HIGH confidence — filesystem-verified)
- `app/globals.css` (full file, 292 lines)
- `app/layout.tsx`, `app/(app)/layout.tsx`, `app/(auth)/layout.tsx`, `app/admin/layout.tsx`, `app/estimate/[token]/layout.tsx`
- `components/ui/{button,card,badge,dialog,input,tabs,skeleton,sheet}.tsx`
- `package.json`, `next.config.ts`, `playwright.config.ts`
- `components/app-shell/*` directory listing
- `lib/i18n/translations.ts` (242 lines)
- Filesystem traversal of `app/**/{page,layout}.tsx`
- Grep results: `backdrop-blur`, `framer-motion`, `toHaveScreenshot`, `prefers-reduced-*`, hex colors, `style={`, `data-theme=`

### Secondary (MEDIUM confidence)
- Tailwind v4 CSS-first config patterns (Tailwind official docs, training-data verified by file structure)
- shadcn CVA variant extension pattern (consistent across this codebase's primitives)

---

## Metadata

**Confidence breakdown:**
- Token map + surface inventory: HIGH (filesystem-verified)
- shadcn primitive variant work: HIGH (CVA pattern visible in source)
- Snapshot strategy: HIGH (Playwright config + grep verified)
- Performance baseline: MEDIUM (no historical Lighthouse data; need to mint)
- Font situation (G1): HIGH (contradiction is unambiguous)
- Settings route inventory (G11): HIGH (filesystem mismatch is real)

**Research date:** 2026-05-17
**Valid until:** 2026-06-16 (30 days; longer if Next/Tailwind/shadcn don't ship breaking changes)
