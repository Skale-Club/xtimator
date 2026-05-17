---
phase: 71
plan: 03
subsystem: marketing
tags: [glassmorphism, marketing, landing, blog, gradient-hero, useReducedMotion, primitive-consumer]
dependency_graph:
  requires:
    - "71-01 tokens (--gradient-hero, --glass-bg, --glass-border, .gradient-brand, .gradient-hero utilities)"
    - "71-02 Card variant='glass' + Button variant='primary'"
  provides:
    - "Hero pattern recipe applied to /: gradient-hero backdrop + display headline + primary CTA"
    - "Glass feature cards with backdrop-blur-none override (perf gate for landing scroll)"
    - "Glass blog index card grid + glass article container with gradient-hero backdrop on /blog and /blog/[slug]"
    - "framer-motion useReducedMotion gating on hero + final-cta + features + how-it-works"
    - "tests/e2e/visual/marketing.spec.ts — 27-baseline matrix (3 surfaces x 3 viewports x 3 langs)"
  affects:
    - "REDESIGN-04 marked partial-complete (marketing surfaces done; auth/onboarding portion lands in 71-04)"
    - "Establishes glass-without-blur perf-gate recipe that 71-05/71-06 mid-scroll surfaces should follow"
tech_stack:
  added: []
  patterns:
    - "Glass-without-blur on landing — variant='glass' + className='backdrop-blur-none' to keep glass tokens (bg + border + shadow) but drop GPU-heavy blur per UI-SPEC perf gate"
    - "Hero gradient backdrop — sibling absolute div: <div aria-hidden className='absolute inset-0 -z-10 gradient-hero' /> behind relative isolate parent"
    - "framer-motion motion gate — initial={reduce ? false : ...} to skip entry animation under prefers-reduced-motion (RESEARCH motion gate)"
    - "Display headline scale — text-[clamp(40px,8vw,72px)] font-semibold leading-[1.05] tracking-[-0.025em] (PT/ES clamp minimum 40px to avoid mobile clip)"
    - "Gradient brand circle for icons — inline-flex size-12 rounded-full gradient-brand text-white (replaces tinted bg/icon combo)"
key_files:
  created:
    - tests/e2e/visual/marketing.spec.ts
  modified:
    - components/landing/hero-section.tsx
    - components/landing/features-section.tsx
    - components/landing/how-it-works-section.tsx
    - components/landing/final-cta-section.tsx
    - app/blog/page.tsx
    - app/blog/[slug]/page.tsx
    - .planning/REQUIREMENTS.md
    - .planning/phases/71-glassmorphism-structural-redesign/deferred-items.md
decisions:
  - "Landing hero uses clamp(40px, 8vw, 72px) — minimum lowered from spec's 48px to 40px so longer PT/ES translations don't clip at 375 mobile viewport"
  - "Features + how-it-works cards consume <Card variant='glass'> but force backdrop-blur-none via className override — honors UI-SPEC perf gate (no blur on landing-scale GPU surfaces) while preserving glass-bg + glass-border + shadow-glass tokens"
  - "Blog index + blog post KEEP the default variant='glass' blur — low scroll volume, no perf concern per plan note"
  - "Removed backdrop-blur-md from hero mockup panel (was inherited from previous design) to ensure zero blur utilities on landing per perf gate"
  - "Final CTA section padding switched to py-[clamp(64px,12vw,96px)] hero-scale to match new hero rhythm"
  - "Visual baselines NOT minted this plan — Playwright webServer (bun run dev) boot exceeded 30s in executor sandbox during parallel wave; spec is well-formed and ready to mint in one command once dev server is running (deferred-items.md has exact command)"
  - "Step icons in how-it-works switched from tinted-bg circle to solid gradient-brand circle with glow shadow — matches UI-SPEC empty-state icon pattern"
metrics:
  duration_seconds: 360
  tasks_completed: 4
  files_created: 1
  files_modified: 7
  tests_added: 0
  tests_passing: 72
  completed: "2026-05-17T15:27:03Z"
---

# Phase 71 Plan 03: Marketing Glass Redesign Summary

Applies the Phase 71 glass + gradient system to public marketing surfaces (`/`, `/blog`, `/blog/[slug]`). Hero now has a `--gradient-hero` radial backdrop, display-scale headline, and primary gradient CTA. Feature/how-it-works cards consume `<Card variant="glass">` with `backdrop-blur-none` override to honor the landing perf gate. Blog uses glass cards + gradient-hero header backdrops. `useReducedMotion` gates all framer-motion entry animations. Visual snapshot spec authored for 27-baseline coverage (3 surfaces × 3 viewports × 3 langs); baselines deferred to dev-server run.

## What Was Built

### Landing — Hero (`components/landing/hero-section.tsx`)

- Section wrapped in `relative isolate` with `gradient-hero` backdrop layer (sibling div, `-z-10`)
- Headline → `text-[clamp(40px,8vw,72px)] font-semibold leading-[1.05] tracking-[-0.025em]` (display scale, PT/ES-safe min)
- Sub-headline → `text-base sm:text-lg leading-[1.55] max-w-2xl`
- Primary CTA → `<Button variant="primary" size="lg">` (gradient + shimmer + glow consumed from 71-02)
- Vertical rhythm → `py-[clamp(64px,12vw,96px)]`
- `useReducedMotion()` from framer-motion gates BOTH the headline stagger AND the mockup-panel scale/rotate entry — `initial={reduce ? false : ...}`
- Removed `backdrop-blur-md` from mockup panel wrapper (perf gate)

### Landing — Final CTA (`components/landing/final-cta-section.tsx`)

- Same gradient-hero backdrop pattern, same py-clamp rhythm
- Headline → `text-[clamp(40px,7vw,64px)] font-semibold` (display scale on the conversion card)
- Primary CTA → `<Button variant="primary" size="lg">` (replaces hand-rolled bg-primary button)
- `useReducedMotion()` gates the whileInView entry animation

### Landing — Features (`components/landing/features-section.tsx`)

- Each feature card converted from raw `<motion.div className="border bg-white/[0.02] ...">` to `<Card variant="glass" className="backdrop-blur-none ...">`
- Title typography → `text-2xl font-semibold tracking-tight`
- Icon container → `inline-flex size-12 rounded-full gradient-brand text-white` (replaces `bg-primary/10` tinted box)
- Section heading scale → `text-[clamp(28px,5vw,48px)] font-semibold`
- `useReducedMotion()` gates per-card whileInView entry

### Landing — How It Works (`components/landing/how-it-works-section.tsx`)

- Step card → `<Card variant="glass" className="backdrop-blur-none ...">`
- Step number circle → solid `gradient-brand` with `shadow-[0_0_24px_hsl(var(--primary)/0.45)]` glow (replaces `border-white/10 bg-background` ring)
- Section heading scale matches features
- `useReducedMotion()` gating applied

### Blog Index (`app/blog/page.tsx`)

- Wrapped in `relative isolate` with top `gradient-hero` backdrop (480px tall)
- H1 → `text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.025em]`
- Post preview cards → `<Card variant="glass" className="overflow-hidden p-0">` with image + content stacked
- Default glass variant retains backdrop-blur (low scroll volume, no perf concern)

### Blog Post (`app/blog/[slug]/page.tsx`)

- Wrapped in `relative isolate` with 520px `gradient-hero` top backdrop
- H1 display scale matches blog index
- Cover image gets `rounded-2xl border border-[var(--glass-border)] shadow-glass`
- Article body wrapped in `<Card variant="glass" className="p-8 sm:p-10">` containing `<BlogContent>` (prose typography preserved)

### Visual Snapshot Spec (`tests/e2e/visual/marketing.spec.ts`)

- `@visual`-tagged spec covering `/`, `/blog`, `/blog/[slug]`
- 3 viewports (desktop 1440×900, tablet 768×1024, mobile 375×812) × 3 langs (en/pt/es) × 3 surfaces = up to 27 baselines
- Reuses `freezeAnimations`, `setLang`, `viewports`, `langs` helpers from 71-01
- Blog post test gracefully `test.skip`s if no published post is discoverable on `/blog`
- `maxDiffPixelRatio: 0.02` per playwright.config.ts default

## Verification

- `grep "variant=\"primary\"" components/landing/hero-section.tsx components/landing/final-cta-section.tsx` → 2 matches (1 per file) ✓
- `grep -rn 'variant="glass"' components/landing/ app/blog/ | wc -l` → **5** (≥4 required) ✓
- `grep -n "backdrop-blur" components/landing/hero-section.tsx components/landing/final-cta-section.tsx` → 0 hits (perf gate: no blur on landing surfaces, only `backdrop-blur-none` overrides in features/how-it-works) ✓
- `bun run test tests/unit/components/` → **72 passed | 3 todo (75)** — zero regressions in primitive variant suite ✓
- `bunx tsc --noEmit` filtered to landing/blog files → **zero errors** ✓
- `git ls-files tests/e2e/visual/marketing.spec.ts` → file tracked ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Removed `backdrop-blur-md` from hero mockup panel**
- **Found during:** Task 2 (hero refactor)
- **Issue:** Existing hero mockup-panel wrapper had `backdrop-blur-md` from previous design. Plan's perf gate is "0 hits of backdrop-blur on hero" — leaving it would silently violate the gate even though plan only listed swap to gradient backdrop + display headline.
- **Fix:** Stripped `backdrop-blur-md` from the mockup panel; visual depth preserved by retained `shadow-[0_0_60px_hsl(var(--primary)/0.15)]` and `from-primary/20 via-transparent to-secondary/20 blur-xl` decorative blur (the latter is a filter on a sibling, not a backdrop-filter).
- **Files modified:** `components/landing/hero-section.tsx`
- **Commit:** `5acbf9d` (bundled with Task 2)

**2. [Rule 2 - Missing critical functionality] Headline clamp minimum lowered from 48px to 40px**
- **Found during:** Task 2 (typography sizing decision)
- **Issue:** Plan said `clamp(48px, 8vw, 72px)`. UI-SPEC i18n gate requires PT-BR and ES (~30% longer) to not clip at 375px mobile viewport. 48px × ~12 PT chars overflows the safe area at 375px.
- **Fix:** Lowered min to 40px in hero, kept 40px floor in features/how-it-works/blog headlines as well. Desktop max (72px) preserved. Documented in decisions.
- **Files modified:** `components/landing/hero-section.tsx`, `components/landing/final-cta-section.tsx`, `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`
- **Commit:** `5acbf9d`, `a61f690`

### Scoped out

**Baseline minting deferred** — see `deferred-items.md` Plan 71-03 section. Spec authored, well-formed, and ready to mint via:
```bash
bun run dev &
VISUAL=1 bunx playwright test tests/e2e/visual/marketing.spec.ts --grep @visual --update-snapshots --project=chromium
```
Cause: Playwright `webServer` boot exceeded the 30s timeout in this executor's sandbox during the parallel wave. Same pattern as 71-01/71-02 baseline deferrals.

**Lighthouse perf check deferred** to 71-10 per scripts/lighthouse.mjs install gate from 71-01.

## Authentication Gates

None — marketing routes are public; fully autonomous execution.

## Commits

| # | Hash      | Type | Subject |
|---|-----------|------|---------|
| 1 | `2910b19` | test | RED — marketing visual snapshot spec (landing + blog + post) |
| 2 | `5acbf9d` | feat | glass-up hero + final CTA — gradient backdrop, display headline, primary CTA, useReducedMotion |
| 3 | `a61f690` | feat | glass cards on features/how-it-works + blog index/post with gradient-hero backdrops |

## Downstream Notes for 71-04..10

1. **REDESIGN-04 is shared.** 71-04 owns the auth + onboarding half. Mark REDESIGN-04 fully complete only after 71-04 ships.
2. **Glass-without-blur recipe** — copy/paste pattern for other mid-scroll surfaces:
   ```tsx
   <Card variant="glass" className="backdrop-blur-none ...">
   ```
   Use this on collections (`/clients`, `/projects` list rows in 71-05), and any list with > ~6 rows on screen. Keep blur on hero/modal/sidebar/topbar/dropdown/toast (perf gate top surfaces).
3. **Hero pattern recipe** — wrap section in `relative isolate` with sibling `<div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />`. Headline `clamp(40px, 8vw, 72px)`. Use this for `/dashboard` (71-05), `/estimate/[token]` (71-09), `/settings/billing` (71-10).
4. **`useReducedMotion` gate** — required on every framer-motion `motion.*` entry animation per RESEARCH motion gate. Pattern:
   ```tsx
   const reduce = useReducedMotion()
   <motion.div initial={reduce ? false : { opacity: 0, y: 20 }} ... />
   ```
5. **Display headline floor at 40px**, not 48px — keep clamp min at 40 for i18n safety on mobile (PT/ES are ~30% longer).
6. **Marketing baselines need minting** before Wave 5 visual-regression CI gate — bundle with the next plan that runs Playwright successfully (likely 71-05's auth fixture work).

## Known Stubs

None. All marketing surfaces use real Card/Button variants from 71-02 wired to live token values from 71-01. Blog uses real data from `getBlogPosts` / `getBlogPost` queries.

## Self-Check: PASSED

Files verified on disk:
- `components/landing/hero-section.tsx` (modified)
- `components/landing/features-section.tsx` (modified)
- `components/landing/how-it-works-section.tsx` (modified)
- `components/landing/final-cta-section.tsx` (modified)
- `app/blog/page.tsx` (modified)
- `app/blog/[slug]/page.tsx` (modified)
- `tests/e2e/visual/marketing.spec.ts` (created)
- `.planning/REQUIREMENTS.md` (modified — REDESIGN-04 marked Partial)
- `.planning/phases/71-glassmorphism-structural-redesign/deferred-items.md` (appended)

Commits verified in `git log --oneline -5`:
- `2910b19` — test(71-03) RED spec
- `5acbf9d` — feat(71-03) hero + final CTA
- `a61f690` — feat(71-03) features + how-it-works + blog
