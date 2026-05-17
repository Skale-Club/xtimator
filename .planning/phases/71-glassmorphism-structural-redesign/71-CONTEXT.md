# Phase 71: Glassmorphism Structural Redesign - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Mode:** Auto-generated from SEED-022 (decisions locked during seed planting)

<domain>
## Phase Boundary

Ship a complete visual overhaul that takes Xtimator from "functional shadcn SaaS" to "premium Stripe-Dashboard-tier" across every surface a paying customer touches — without changing information architecture, navigation, route structure, or copy. Information stays where it is; presentation gets a Stripe-Dashboard-tier glow-up.

**In scope:**
- New design system layer (glass surface tokens + vibrant gradient palette + typography upgrade) added ON TOP of existing semantic tokens (zero replacement)
- Every shadcn primitive in `components/ui/*` gains optional glass/gradient variants
- All marketing surfaces (`/`, `/blog/[slug]`)
- All auth + onboarding surfaces (`/login`, `/signup`, `/reset-password`, `/onboarding/*`)
- App shell (sidebar, top bar, bottom-nav, dropdowns, toggles)
- Dashboard + collections (`/dashboard`, `/clients`, `/projects`)
- Project surfaces (`/projects/[id]` 5-tab workspace, `/capture`, `/describe`, `/photos-input`, estimate editor inline)
- Customer-facing share page (`/estimate/[token]`) including Pay Now button from Phase 70
- All settings surfaces (every `/settings/*` sub-page including `/settings/payments`)
- All admin surfaces (every `/admin/*` sub-page including new `/admin/design-system` reference page)
- Billing page tier cards with per-tier gradients
- Playwright visual snapshot baselines re-minted for every redesigned surface
- Performance + accessibility gates (Lighthouse ≥80, FLJS <500KB, prefers-reduced-transparency honored)

**Hard boundary — what is OUT of scope:**
- Brand identity overhaul (logo, color palette, wordmark stay byte-identical)
- New illustrations or mascot work
- Onboarding tour / product walkthrough flow (separate seed if wanted)
- Custom font licensing (Geist stays as it's free)
- Animation library beyond CSS keyframes + framer-motion already installed
- A11y deep-dive beyond WCAG AA contrast on new glass surfaces
- Mobile-native gestures (swipe, pinch, etc.)
- Information architecture changes (same routes, same nav, same copy)
- Database/schema changes (pure presentation)
- Server logic changes (no API contract changes)

</domain>

<decisions>
## Implementation Decisions

### Aesthetic Direction
- **Glassmorphism + vibrant gradients** (Apple Watch + Stripe Dashboard hybrid)
- Frosted blurs on hero zones, modals, sidebar — NOT every card (GPU constraint)
- Vibrant gradients used as ACCENTS on hero elements, primary buttons, status badges — NOT as backgrounds (Stripe model)
- Stronger typography hierarchy with more variance (display vs body vs micro)
- Generous whitespace, fewer per-screen elements
- Dark-mode default preserved; light mode receives same visual treatment with adjusted opacity

### Brand Identity (LOCKED — do NOT change)
- `--primary: 224 86% 60%` (= #406EF1) stays the brand primary
- Logo SVG byte-identical
- Wordmark "Xtimator" unchanged
- Dark-mode default preserved
- Scoped themes preserved: `[data-theme="dark-auth"]`, forced-light `/estimate/*`, admin dark accent

### Design System Tokens (ADD ON TOP — do NOT replace)
- **Glass surface tokens** (new, in globals.css):
  - `--glass-bg: rgba(20, 24, 33, 0.6)` (dark-mode glass)
  - `--glass-bg-strong: rgba(20, 24, 33, 0.85)` (modal, dialog)
  - `--glass-bg-light: rgba(255, 255, 255, 0.04)` (hover/active overlay)
  - `--glass-border: rgba(255, 255, 255, 0.08)`
  - `--glass-blur: 16px`
  - `--glass-blur-strong: 24px`
- **Gradient palette** (new, in globals.css):
  - `--gradient-brand: linear-gradient(135deg, #406EF1 0%, #7FA4F4 100%)` (primary CTAs)
  - `--gradient-hero: radial-gradient(circle at top, #406EF155 0%, transparent 70%)` (hero backdrops)
  - `--gradient-success: linear-gradient(135deg, #10B981 0%, #34D399 100%)` (paid badge, success states)
  - `--gradient-warning: linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)` (trial banner)
  - `--gradient-danger: linear-gradient(135deg, #EF4444 0%, #F87171 100%)` (errors, danger CTAs)
- Light mode counterparts: same colors with adjusted opacity (dark-bg → light-bg ratios)
- Existing semantic tokens (`--primary`, `--background`, `--card`, `--border`, etc.) untouched

### Typography Upgrade
- `--font-display` = Geist (hero headlines, big numbers — clamp(48px, 8vw, 72px))
- `--font-sans` = Geist (body — current default)
- `--font-mono` = Geist Mono (code, IDs, dimensions)
- Scale: hero clamp(48-72), title 32, h2 24, h3 18, body 14, micro 12
- Geist is already used (Vercel-favored, free, modern); no new licensing

### Component Refactors (extend shadcn primitives, do NOT replace)
- `<Card variant="glass">` — backdrop-blur + glass-border + glass-bg
- `<Button variant="primary">` — gradient-brand bg + subtle shimmer hover animation
- `<Dialog>` / `<Sheet>` — backdrop-blur + glass-bg-strong
- `<Input>` focused state — gradient-brand bottom border (3px) + subtle glow shadow
- `<Badge>` new gradient variants — `success`, `brand`, `warning`, `danger` per gradient palette
- `<Tabs>` underline indicator — thin gradient-brand bar (replaces solid)
- All existing variants (`default`, `outline`, `ghost`, `secondary`, etc.) untouched — backward compat

### Surface-Level Patterns
- **Hero zones** (top of dashboard, share page, landing) — radial gradient-hero backdrop
- **Stat cards** (dashboard, billing) — glass + gradient top-border (3px brand-gradient)
- **Modals / dialogs** — glass-bg-strong + 24px blur (existing semi-translucent → full glass)
- **Sidebar** — glass surface + gradient highlight on active nav (1.5px gradient left border)
- **Empty states** — gradient illustration accents (svg with gradient fill)
- **Loading skeletons** — keep shimmer animation, switch grey tint to brand-gradient tint
- **Toasts** — glass + gradient left border (color matches status)
- **Tier cards** (billing) — per-tier gradient bg (Free neutral, Pro brand, Business premium-gradient mix)

### Performance Constraints (HARD GATES)
- `backdrop-filter: blur()` restricted to top surfaces ONLY: hero zones, modals, sidebar, top bar
- NOT on every list row, NOT on table cells, NOT on inline badges
- `prefers-reduced-transparency` media query → fallback to solid `--card` bg
- Lighthouse Performance + Accessibility ≥ 80 on `/` and `/dashboard` post-redesign
- First Load JS for `/dashboard` < 500 KB (current baseline)
- All new CSS goes through Tailwind utilities (no inline styles in components)

### Accessibility Constraints
- Every glass surface tested against WCAG AA (4.5:1 contrast minimum) over its actual backdrop
- Focus rings stay clearly visible (gradient-brand glow on inputs, brand-color outline on buttons)
- Reduced-motion support: shimmer animations disabled when `prefers-reduced-motion`
- All new pattern variants documented in `/admin/design-system` page (REDESIGN-03)

### i18n Constraints
- Test EN + PT-BR + ES on every redesigned screen — PT/ES strings are ~30% longer
- Typography scale changes (new display/title/h2/h3 sizes) MUST not clip translations
- LanguageToggle remains in topbar (no relocation)

### Snapshot Strategy
- ALL existing Playwright visual snapshots WILL break — expected and acceptable
- Re-mint baselines in each wave's verification task
- Use `npx playwright test --update-snapshots` after wave lands and verification passes
- CI must show zero false-positive visual regressions after wave 5

### Claude's Discretion
- Exact shimmer animation curve and duration (recommend 1.2s ease-in-out)
- Exact gradient angle if 135° doesn't look right per surface (free to nudge ±20°)
- Whether to add subtle background noise/grain texture (small SVG; defer if marginal)
- Density of redesigned tables/lists (current is comfortable; can tighten 10-15% if it looks crowded)
- Empty state illustration style (line vs filled vs duotone — pick one consistent style and apply everywhere)
- Whether to add framer-motion micro-interactions on stat cards (recommended: subtle scale + glow on hover)
- Mobile drawer animation (slide vs fade-blur)
- Whether to add a new "Surface" type/abstraction in lib/ or keep glass as just Tailwind classes

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/globals.css` — root CSS with semantic tokens, `[data-theme]` scopes; extend with glass + gradient blocks
- `components/ui/*` — full shadcn New York primitives library (button, card, dialog, input, badge, tabs, etc.) — all CVA-based, easy to extend with new variants
- `tailwind.config.ts` — extend `theme.extend.backgroundImage` + `theme.extend.backdropBlur` for glass utilities
- `lib/branding.ts` (via `getBranding()`) — runtime brand color override (must continue working with new gradient tokens)
- `next-themes` — theme toggle already wired; new tokens must respect light/dark
- `framer-motion` — installed and used in capture screen (gradient ring); reuse for shimmer/hover animations
- `tests/e2e/` — Playwright snapshot infrastructure (will need `--update-snapshots` after each wave)
- `tests/unit/components/` — existing component snapshot/RTL pattern

### Established Patterns
- shadcn primitives are CVA-based — adding a variant is `variant: { ..., glass: "..." }` in the cva() call
- Semantic tokens use HSL triplets (`--primary: 224 86% 60%`) so opacity modifiers work (`bg-primary/50`)
- Scoped themes via `[data-theme="x"]` selectors — must NOT collide with new tokens
- Server components first; client components only when interactive
- Loading.tsx files use skeleton primitives (extend shimmer pattern with brand-gradient tint)
- Empty states use existing `<EmptyState>` component pattern (extend with optional gradient accent prop)
- Animation: CSS keyframes for repeating (shimmer, pulse); framer-motion for stateful (modal entry, hover)
- i18n: `t()` calls everywhere; no hard-coded English

### Integration Points
- `app/globals.css` — single source of truth for tokens (add new blocks, don't touch existing)
- `components/ui/button.tsx` (and siblings) — extend cva() variants
- `tailwind.config.ts` — extend with new utility classes
- `next.config.mjs` — no changes expected
- `app/(app)/layout.tsx` — sidebar + topbar will receive glass surface treatment
- `app/(marketing)/page.tsx` — landing hero will get gradient-hero radial backdrop
- `app/admin/layout.tsx` — admin shell receives glass treatment (preserves admin dark accent)
- `tests/e2e/playwright.config.ts` — snapshot baseline storage (per-browser, per-viewport)

### Existing Surfaces That Already Have Visual Polish (light touch only)
- `app/(app)/dashboard/page.tsx` — Phase 17 (streaming, Suspense, skeletons)
- `app/estimate/[token]/page.tsx` — Phase 70 added Pay Now button + success banner (style into new system)
- `/onboarding/*` — Phase 2 + survey-style restyle in Phase 9
- All these get re-styled but logic + structure preserved

</code_context>

<specifics>
## Specific Ideas

**See `.planning/seeds/SEED-022-glassmorphism-structural-redesign.md` for full architecture spec, reference visuals, and risk management.**

Key references:
- **Stripe Dashboard** (https://dashboard.stripe.com) — gold standard reference; pin screenshots in 71-RESEARCH.md
- **Apple visionOS** (translucent UI principles) — for glass card patterns
- **Linear** (https://linear.app) — for typography hierarchy and density discipline
- **shadcn/ui docs** (https://ui.shadcn.com) — for CVA variant extension patterns
- **Geist font** (https://vercel.com/font) — already used; lean into display weight

**Plan structure (10 plans across 5 waves):**

| Wave | Plans | Surfaces |
|------|-------|----------|
| 1 | 71-01, 71-02 | Design system foundation: tokens + primitive variants + `/admin/design-system` reference page |
| 2 | 71-03, 71-04 | Public/onboarding: landing, blog, auth (login/signup/reset), onboarding wizard |
| 3 | 71-05, 71-06 | App shell + collections: sidebar, topbar, dashboard, clients list, projects list |
| 4 | 71-07, 71-08 | Project surfaces: workspace tabs, capture screens, estimate editor, send tab |
| 5 | 71-09, 71-10 | Share page, settings (all sub-pages), admin (all sub-pages), billing |

**After each wave:** Playwright visual snapshot regression baseline update via `npx playwright test --update-snapshots` + commit; manual review checkpoint (auto-approved per memory).

**Skills to leverage during planning:**
- `ui-ux-pro-max` — for design system + component-level guidance
- `frontend-design` — for production-grade frontend with anti-AI-aesthetic
- `vercel-react-best-practices` — for Next.js performance during the heavy CSS refactor

</specifics>

<deferred>
## Deferred Ideas

- **Logo redesign** — explicitly out (brand identity locked)
- **New brand color** — explicitly out (#406EF1 preserved)
- **Custom illustrations + mascot** — could be follow-up seed; current redesign uses gradient-tinted icons from lucide-react
- **Onboarding tour / product walkthrough** — separate UX feature, separate phase
- **Dark/light per-page granularity** — current 3-mode system stays
- **A11y deep audit** — beyond WCAG AA contrast on new surfaces; full keyboard nav + screen reader audit is separate phase
- **Mobile-native gestures** — swipe between tabs, pinch on photos; out of scope here
- **Animation library upgrade** — framer-motion + CSS keyframes are enough; no Motion One or Lottie
- **Storybook setup** — `/admin/design-system` page serves as lightweight component gallery; full Storybook is heavier infra (separate seed if wanted)

</deferred>
