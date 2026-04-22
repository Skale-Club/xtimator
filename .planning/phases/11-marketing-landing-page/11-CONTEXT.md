# Phase 11: Marketing Landing Page - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a public, dark-mode marketing landing page at `/` that explains EstimateBuilder Pro and drives sign-up. Scope: Hero+CTA, How It Works (3-step flow), Features/Benefits grid, responsive on iOS Safari and Android Chrome, production-grade visual quality using the `#406EF1` design system. Pricing, testimonials, client portal, and i18n are explicitly out of scope — covered by other milestones or phases.

</domain>

<decisions>
## Implementation Decisions

### Auth-aware routing for `/`
- **D-01:** `/` becomes a public route. Update `proxy.ts` (middleware equivalent) to exclude `/` from the auth-redirect branch in `lib/supabase/proxy.ts` — currently it redirects unauthenticated visitors to `/login`.
- **D-02:** Authenticated visitors to `/` are redirected to `/dashboard` via the middleware. The landing page itself never runs auth checks.
- **D-03:** `app/page.tsx` becomes a pure static server component that renders the landing. The existing `redirect("/auth/login")` line is removed.
- **D-04:** This supersedes the original D-04 decision ("no landing page in v1") documented in STATE.md — intentional per v1.2 milestone scope.

### Hero visual strategy
- **D-05:** Hero uses a subtle dark gradient backdrop (composable with the `[data-theme="dark"]` token palette) plus a product mockup — a phone or browser frame showing the audio-waveform → estimate-PDF transition that represents the core value prop ("record audio → AI estimate").
- **D-06:** No video, no animated illustration, no real product screenshot. The mockup is a stylized SVG/CSS composition, not a captured screenshot (avoids screenshot-maintenance cost as the app evolves).
- **D-07:** Headline leads with the core promise ("5-minute estimate from a job-site audio recording" or similar — exact copy is planner/writer's call). Subheadline explains audience (US service businesses) and mechanism (AI). Single primary CTA in hero.

### Nav + CTA structure
- **D-08:** Top navigation bar, sticky on scroll with backdrop blur. Layout: Logo (left) + anchor links ("How It Works", "Features") + "Sign In" (ghost button) + **"Get Started"** (primary button in `#406EF1`) on the right.
- **D-09:** Primary hero CTA ("Get Started Free" or equivalent) routes to `/auth/signup`. Sign In button routes to `/auth/login`. No other entry points needed.
- **D-10:** Anchor links scroll to in-page sections (`#how-it-works`, `#features`) — no additional routes.
- **D-11:** Mobile nav uses a `Sheet` (already in `components/ui/sheet.tsx`) triggered by a hamburger icon; primary CTA remains visible in the bar.

### Content visual style — How It Works + Features
- **D-12:** "How It Works" section: 3 steps, each rendered as a card with a lucide icon (`Mic`, `Camera`, `Sparkles` — or a Claude-discretion equivalent set), number badge, title, and short description. No custom illustrations, no screenshots.
- **D-13:** "Features/Benefits" section: grid of 4 cards, each with a lucide icon + title + 1-2 sentence benefit copy. The four must cover AI estimate generation, branded PDF output, shareable link, and mobile-first use (maps to REQUIREMENTS.md LAND-03).
- **D-14:** Cards use the Phase 9 design token vocabulary (`--card`, `--border`, radius/shadow scale) with ui-ux-pro-max micro-treatments (gradient borders, hover elevation, subtle `#406EF1` accent glow) to deliver production polish without art-asset burden.

### Design skill invocation
- **D-15:** vercel-labs web-design-guidelines and ui-ux-pro-max skills MUST be active during implementation of the landing-page UI components (SEED-002 requirement). Planner should include this as a task precondition.

### Claude's Discretion
- Exact headline, subheadline, CTA button copy, step copy, and feature copy — planner/writer's call within the goal constraints.
- Exact lucide icon choices for steps and features (examples given above are suggestions).
- Exact gradient colors for the hero backdrop, subject to staying inside the `--background` + `--primary` palette.
- Micro-animations on scroll (fade-in, stagger) — lightweight and taste-driven; no heavy parallax.
- Breakpoints and grid column counts for the features section (will follow Tailwind 4 defaults).
- Whether to include a lightweight footer (logo + copyright line) — not required by LAND-01–05, but fine to add if it takes <10 minutes; anything larger is deferred.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 11: Marketing Landing Page" — goal, success criteria, dependencies
- `.planning/REQUIREMENTS.md` §"Landing Page" — LAND-01 through LAND-05 acceptance criteria
- `.planning/PROJECT.md` §"Current Milestone: v1.2" — milestone goal, English-first constraint, design-skill constraint

### Design foundation (carry forward)
- `.planning/seeds/SEED-002-landing-page-global-brand-identity.md` — Color system (Primary #406EF1, Secondary #7FA4F4, Background near-black #0A0A0F / #0D0D14, Surface #13131A / #1A1A24), required design skills, breadcrumbs to existing fallbacks
- `.planning/phases/10-global-brand-tokens/10-VERIFICATION.md` — Confirms `--primary: 224 86% 60%` locked in `:root`, `.dark`, `[data-theme="dark-auth"]`, `[data-theme="admin-dark"]`, `[data-theme="light"]`
- `.planning/phases/09-system-wide-dark-mode-default/09-07-PLAN.md` / `09-08-PLAN.md` — Primitives redesign patterns, design-token consumption rules (arbitrary-value Tailwind syntax, no `dark:*` variants inside scoped themes)
- `app/globals.css` — Live CSS token source of truth (brand + radius/shadow/typography scales)

### Implementation references
- `.planning/seeds/SEED-002-landing-page-global-brand-identity.md` §"Breadcrumbs" — file pointers for `app/page.tsx`, `app/(auth)/layout.tsx`, `app/admin/layout.tsx`, Phase 08 UI-SPEC pattern
- External design skills (MUST be invoked during implementation):
  - `https://skills.sh/vercel-labs/agent-skills/web-design-guidelines`
  - `https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/button.tsx` — Primary, ghost, and outline variants already styled on Phase 9 design tokens; consume directly for CTAs and nav buttons.
- `components/ui/card.tsx` — Card/CardHeader/CardContent primitives for "How It Works" steps and features grid.
- `components/ui/navigation-menu.tsx` + `components/ui/sheet.tsx` — Desktop nav + mobile drawer patterns already shadcn-aligned.
- `components/ui/separator.tsx` — Useful for optional section dividers.
- `lib/platform-config.ts` `getBranding()` — Returns `{ appName, logo, primaryColor, ... }`; already used in `app/layout.tsx` for runtime title/logo. Landing can reuse for the nav logo + wordmark.
- `app/layout.tsx` — Root `ThemeProvider` and `Toaster` already in place; landing inherits dark-theme defaults without custom wiring.

### Established Patterns
- Dark-mode-first via `next-themes` with `eb-theme` cookie SSR hydration (Phase 9) — landing inherits this and renders dark by default. User's saved preference is respected.
- `#406EF1` applied as `--primary: 224 86% 60%` globally (Phase 10) — consume via `hsl(var(--primary))` or Tailwind `bg-primary` / `text-primary` / `ring-primary`.
- Design-token vocabulary (Phase 9 Pillar C in `app/globals.css`): radius scale (`--radius-xs` through `--radius-full`), shadow scale (`--shadow-xs` through `--shadow-lg`, `--shadow-focus`), typography scale (`--font-size-xs` through `--font-size-3xl` + weights + tracking), spacing hints. Landing components should consume these, not hard-code.
- Server components by default; `'use client'` only when interactivity is required (mobile nav drawer, scroll-based sticky behavior).
- lucide icon pack already in use across the app — icon-only visual style is consistent with existing UX.

### Integration Points
- `app/page.tsx` — Replace the `redirect("/auth/login")` body with the landing composition. Stays as a server component.
- `proxy.ts` (repo root) + `lib/supabase/proxy.ts` — Update `updateSession()` public-route list to include `/` (exact match) so the landing is reachable anonymously. Add authenticated `/` → `/dashboard` redirect, either in `proxy.ts` wrapper or inside `updateSession`.
- `tests/unit/middleware.test.ts` — Add test cases asserting `/` is a public route and authenticated `/` redirects to `/dashboard` (maintains Phase 1 D-05 route protection test discipline).
- No `app/layout.tsx` change required — the root layout is already neutral enough to host the landing under the same dark-theme defaults used everywhere else.

</code_context>

<specifics>
## Specific Ideas

- Production-polish bar is explicit: "NOT generic AI SaaS look" (SEED-002). The ui-ux-pro-max skill is the mechanism for reaching that bar without custom illustrations.
- Hero mockup tells the audio-to-estimate story in a single visual — the core value prop ("5-minute estimate from job-site audio") should be readable from the mockup alone.
- Reference points for quality bar: Linear, Vercel, Supabase — sticky nav with backdrop blur, strong type hierarchy, subtle gradient accents, icon-based feature grid, restrained use of primary color for CTAs and focus only.

</specifics>

<deferred>
## Deferred Ideas

- **Footer (full)** — Product / Company / Legal / Social columns. Claude's discretion allows a minimal logo + copyright line if trivial; anything larger is deferred to a future polish phase.
- **Theme override on landing** — forcing dark regardless of user preference is not required; current next-themes behavior (respect saved pref, default dark) is kept.
- **Trust signals** — stats bar ("5-minute estimates" metric chip, business-count placeholder) or brand-logo strip are not in scope; feature-first is the current direction.
- **Pricing section** — out of scope per REQUIREMENTS.md; pricing model not yet defined.
- **Testimonials / social proof** — deferred to v1.3 per REQUIREMENTS.md.
- **Hero video** — out of scope; stylized mockup is the chosen direction.
- **Blog / changelog / documentation links** — not in scope for v1.2.

</deferred>

---

*Phase: 11-marketing-landing-page*
*Context gathered: 2026-04-22*
