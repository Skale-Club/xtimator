# Phase 11: Marketing Landing Page - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the dark-mode public marketing page at `/` that explains the product and drives sign-ups.

Covers:
- Replace `app/page.tsx` hard-redirect with the landing page itself
- Exempt `/` from middleware's auth-redirect so unauthenticated visitors can see it
- Redirect authenticated visitors from `/` to `/dashboard`
- Navbar, Hero, How It Works, Features/Benefits, Bottom CTA band, Footer

Out of scope:
- Pricing section (pricing model not yet defined — deferred)
- Testimonials / social proof stats (deferred to v1.3)
- Blog, /about, /contact pages
- i18n wiring (Phase 12 adds `t()` wrappers on top of the English strings built here)

</domain>

<decisions>
## Implementation Decisions

### Navigation Bar
- **D-01:** Navbar contains: wordmark/logo left, "Sign In" ghost link + "Get Started" primary button right.
- **D-02:** Navbar is sticky on scroll with a `backdrop-blur` + semi-transparent background so content below is visible while scrolling.
- **D-03:** Authenticated users hitting `/` are redirected to `/dashboard` — handled in the page component (server-side check via `getClaims()`) or middleware. Route: `/` must be added to the middleware exemption list alongside `/estimate/*`.

### Hero Section
- **D-04:** Hero visual: dark near-black background + `#406EF1` radial gradient glow behind the headline text. No screenshot or mockup — pure atmosphere with accent lighting.
- **D-05:** Headline direction: outcome-focused — **"Professional estimates in 5 minutes."** Subheadline: *"Record a job site walkthrough. Add photos. AI writes the estimate. Send it before you leave the driveway."*
- **D-06:** Primary CTA: "Get Started Free" — links to `/auth/signup`. Secondary link: "Sign In" — links to `/auth/login`.
- **D-07:** Hero is full-viewport-height (100svh) on desktop; slightly shorter on mobile to avoid scroll hiding the CTA.

### Page Sections (in order)
- **D-08:** Section order: Navbar → Hero → How It Works → Features/Benefits → Bottom CTA band → Footer.
- **D-09:** "How It Works" presents the 3-step flow: (1) Record audio on-site → (2) Add photos → (3) Receive AI estimate. Use numbered cards or a horizontal step-line layout — planner's discretion.
- **D-10:** "Features/Benefits" is a grid of cards. Features to highlight: AI estimate generation, branded PDF output, shareable link, mobile-first use. Icon per feature — planner chooses icons from Lucide (already installed).
- **D-11:** Bottom CTA band: full-width conversion strip before the footer — "Ready to send estimates in 5 minutes?" with a "Get Started Free" primary button. Same messaging as hero to reinforce after full scroll.
- **D-12:** Footer: minimal — copyright line + Sign In / Sign Up links. No links to pages that don't exist yet (/about, /pricing, /contact).

### Animations
- **D-13:** Scroll-triggered fade-in animations as sections/cards enter the viewport. Implemented via Intersection Observer API — no Framer Motion dependency. Pure Tailwind CSS transition classes toggled by a small utility hook/component.
- **D-14:** Navbar fade-in on mount. Hero content animates in on load (slight delay stagger between headline, subheadline, CTA). All other sections fade in on scroll.

### Theme & CSS
- **D-15:** Landing page is always dark — does NOT respect the user's `eb-theme` cookie preference. The page uses the global `.dark` class context (root layout already defaults to dark) and is not wrapped in a `[data-theme]` scoped override.
- **D-16:** App name shown in navbar pulled from `getBranding().appName` (already wired in root layout) — no hardcoded "Xtimator" string.

### Routing & Middleware
- **D-17:** `proxy.ts` (middleware) must exempt `/` from the catch-all auth redirect. Pattern: add `pathname === '/'` to the public-route guard alongside `isAuthRoute` and `isPublicEstimate`.
- **D-18:** `app/page.tsx` becomes the landing page itself (no more `redirect('/auth/login')`). Authenticated-user redirect handled server-side in the page component.

### Claude's Discretion
- Exact Lucide icon names for the Features grid
- Card shadow/border treatment on How It Works and Features sections (subtle border or glow border)
- Whether "How It Works" uses a horizontal timeline (desktop) + vertical stack (mobile) or pure card grid
- Footer layout (single centered row or two-column)
- Exact Tailwind gradient values for the `#406EF1` radial glow (start opacity, spread radius)
- Intersection Observer hook — whether to use a custom hook, a shared utility, or inline refs

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project core
- `.planning/PROJECT.md` — vision, v1.2 milestone goal, landing page design skill constraints
- `.planning/REQUIREMENTS.md` — LAND-01 through LAND-05 (the acceptance criteria for this phase)
- `.planning/ROADMAP.md` §"Phase 11" — canonical scope, success criteria, UI hint flag
- `CLAUDE.md` — tech stack constraints, GSD workflow enforcement

### Design skills (REQUIRED by PROJECT.md for landing page quality)
- `skills.sh/vercel-labs/agent-skills/web-design-guidelines` — visual quality bar for the landing page
- `skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max` — UI/UX production polish guidelines

### Existing code (key files to read before planning)
- `app/page.tsx` — currently redirects to `/auth/login`; will be replaced entirely
- `proxy.ts` — middleware with `updateSession` + admin gate; `/` must be added to public-route exemptions
- `lib/supabase/proxy.ts` — `updateSession` source; contains the `isAuthRoute` / `isPublicEstimate` guard pattern to extend
- `app/layout.tsx` — root layout with `ThemeProvider`, `getBranding()` call, and Inter font setup
- `app/globals.css` — full CSS token system (`--primary: 224 86% 60%`, `.dark` vars, scoped themes)
- `components/ui/button.tsx` — Button component (used for CTAs)
- `components/ui/card.tsx` — Card component (used for How It Works + Features sections)
- `lib/platform-config.ts` — `getBranding()` loader for dynamic app name/logo

### Prior phase context
- `.planning/phases/08-platform-admin-panel-for-centralized-api-integrations/08-CONTEXT.md` §D-10 — platform brand vs company brand boundary (landing page = platform brand)
- `.planning/phases/10-global-brand-tokens/10-RESEARCH.md` — `#406EF1` (224 86% 60%) token decision and CSS scope documentation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`components/ui/button.tsx`** — Button already has `default` (primary filled) and `ghost` variants. Hero CTAs and navbar buttons use these directly.
- **`components/ui/card.tsx`** — Card with `CardHeader`, `CardContent` — ideal for How It Works steps and Features grid items.
- **`components/ui/badge.tsx`** — Available for tags or small labels if needed in Features section.
- **`components/ui/separator.tsx`** — For visual section dividers.
- **`lib/platform-config.ts` `getBranding()`** — Returns `{ appName, logoUrl, primaryColor }`. Navbar wordmark uses `appName` dynamically.

### Established Patterns
- **Server-side auth check** — `supabase.auth.getClaims()` pattern used in all app layouts. Same pattern handles authenticated-user redirect in `app/page.tsx`.
- **Route group layout scoping** — `(app)`, `(auth)` route groups each have their own `layout.tsx`. A `(marketing)` group is an option, but landing page can also live directly at `app/page.tsx` with `app/(marketing)/` for any future marketing sub-pages.
- **CSS token consumption** — Tailwind arbitrary-value syntax `bg-[hsl(var(--primary))]` established in Phase 9. Radial glow implemented similarly: `bg-[radial-gradient(ellipse_at_center,_hsl(var(--primary)/0.3)_0%,_transparent_70%)]`.
- **Dark theme always-on** — Root layout defaults to `dark`; landing page inherits this without additional wrappers.
- **`getBranding()` in server components** — Already called in `app/layout.tsx`; safe to call in `app/page.tsx` as well.

### Integration Points
- `proxy.ts` — single file to edit for the `/` public-route exemption (line ~22, `isPublicEstimate` condition)
- `app/page.tsx` — replaced entirely with the landing page component
- `app/layout.tsx` — no change needed; `ThemeProvider` and `getBranding()` already handle global context
- `app/(app)/layout.tsx` — no change; authenticated app shell is untouched
- Lucide React — already installed as a dependency; use for feature/step icons

</code_context>

<specifics>
## Specific Ideas

- Headline: **"Professional estimates in 5 minutes."** — locked copy from discussion
- Subheadline: *"Record a job site walkthrough. Add photos. AI writes the estimate. Send it before you leave the driveway."*
- Bottom CTA band copy: *"Ready to send estimates in 5 minutes? Get started free."*
- Primary CTA button: "Get Started Free" → `/auth/signup`
- Secondary link: "Sign In" → `/auth/login`
- `#406EF1` radial glow: centered behind headline text, fading to transparent by ~70% radius — the signature visual of the hero
- Design quality bar: vercel-labs + ui-ux-pro-max skills must be consulted before finalizing component design decisions

</specifics>

<deferred>
## Deferred Ideas

- **Stats / trust bar** — "5 min average, Mobile-first, PDF ready" strip between Hero and How It Works. User did not select it; noted for v1.3 when real usage numbers exist.
- **Testimonials / social proof** — Already deferred in REQUIREMENTS.md to v1.3.
- **Pricing section** — Deferred until pricing model is defined (per PROJECT.md out-of-scope).
- **/about, /blog, /contact pages** — Future marketing sub-pages; out of scope for this phase.
- **Language toggle on landing page** — Phase 12 (i18n) adds `t()` wrappers on the English strings built here; no language toggle needed in this phase.

</deferred>

---

*Phase: 11-marketing-landing-page*
*Context gathered: 2026-04-24*
