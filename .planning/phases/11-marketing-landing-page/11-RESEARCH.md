# Phase 11: Marketing Landing Page - Research

**Researched:** 2026-04-22
**Domain:** Next.js 16 App Router marketing page, Tailwind CSS v4, shadcn/ui, dark-mode design, middleware auth routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `/` becomes a public route. Update `proxy.ts` to exclude `/` from the auth-redirect branch in `lib/supabase/proxy.ts` — currently it redirects unauthenticated visitors to `/login`.
- **D-02:** Authenticated visitors to `/` are redirected to `/dashboard` via the middleware. The landing page itself never runs auth checks.
- **D-03:** `app/page.tsx` becomes a pure static server component that renders the landing. The existing `redirect("/auth/login")` line is removed.
- **D-04:** This supersedes the original D-04 decision ("no landing page in v1").
- **D-05:** Hero uses a subtle dark gradient backdrop plus a product mockup — a stylized SVG/CSS composition showing audio-waveform → estimate-PDF transition. No video, no real screenshot.
- **D-06:** No video, no animated illustration, no real product screenshot. The mockup is a stylized SVG/CSS composition.
- **D-07:** Headline leads with the core promise. Subheadline explains audience and mechanism. Single primary CTA in hero. (Exact copy: "From Job Site to Professional Estimate in 5 Minutes" — from UI-SPEC.)
- **D-08:** Top navigation bar, sticky on scroll with backdrop blur. Logo (left) + anchor links + "Sign In" (ghost) + "Get Started" (primary `#406EF1`) on right.
- **D-09:** Primary hero CTA routes to `/auth/signup`. Sign In button routes to `/auth/login`.
- **D-10:** Anchor links scroll to `#how-it-works`, `#features` — no additional routes.
- **D-11:** Mobile nav uses `Sheet` (already in `components/ui/sheet.tsx`) triggered by hamburger icon.
- **D-12:** "How It Works" section: 3 steps, card with lucide icon + number badge + title + description. No custom illustrations.
- **D-13:** "Features/Benefits" section: grid of 4 cards covering AI generation, branded PDF, shareable link, mobile-first use.
- **D-14:** Cards use Phase 9 design token vocabulary with gradient borders, hover elevation, subtle `#406EF1` glow.
- **D-15:** vercel-labs web-design-guidelines and ui-ux-pro-max skills MUST be active during implementation. This is a task precondition.

### Claude's Discretion

- Exact headline, subheadline, CTA button copy, step copy, and feature copy (already resolved in UI-SPEC).
- Exact lucide icon choices for steps and features (resolved in UI-SPEC: Mic, Camera, Sparkles; Brain, FileText, Share2, Smartphone).
- Exact gradient colors for the hero backdrop (within `--background` + `--primary` palette).
- Micro-animations on scroll (fade-in, stagger) — lightweight, no heavy parallax.
- Breakpoints and grid column counts (follow Tailwind 4 defaults — resolved in UI-SPEC).
- Whether to include a lightweight footer (logo + copyright line) — not required by LAND-01–05, fine if < 10 min.

### Deferred Ideas (OUT OF SCOPE)

- Full multi-column footer (Product / Company / Legal / Social)
- Theme override forcing dark on landing (inherit next-themes behavior)
- Trust signals / stats bar / brand-logo strip
- Pricing section
- Testimonials / social proof (v1.3)
- Hero video
- Blog / changelog / documentation links
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAND-01 | Visitor can see a hero section with a strong headline, subheadline, and a signup/login CTA button | `app/page.tsx` replacement with static server component; `components/ui/button.tsx` already provides primary/ghost variants on `#406EF1` tokens |
| LAND-02 | Visitor can read a "How It Works" section showing the 3-step flow | `components/ui/card.tsx` reused for step cards; lucide-react already installed; no new components needed |
| LAND-03 | Visitor can explore a features/benefits grid highlighting AI generation, branded PDF, shareable links, mobile-first use | Same card primitives as LAND-02; 4-card grid with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` |
| LAND-04 | Landing page is fully responsive and functions correctly on iOS Safari and Android Chrome | Mobile-first Tailwind breakpoints; Sheet for mobile nav; 44px minimum touch targets; `@media (hover: hover)` gate on hover states |
| LAND-05 | Landing page uses dark theme with `#406EF1` primary and near-black background; visual quality meets production standards | `--primary: 224 86% 60%` already locked globally in globals.css; dark mode default inherited from ThemeProvider; ui-ux-pro-max + vercel-labs skills invoked |
</phase_requirements>

---

## Summary

Phase 11 delivers a public marketing landing page at `/` replacing the current `redirect("/auth/login")` in `app/page.tsx`. The project already has all required UI primitives installed and styled — no new `shadcn` components need to be added. The primary work is: (1) updating the middleware in `proxy.ts` and `lib/supabase/proxy.ts` to make `/` public and redirect authenticated users to `/dashboard`, (2) replacing `app/page.tsx` with a static server component composition, and (3) building four new page-section components under `app/(marketing)/` or `components/landing/`.

The design system foundation from Phase 9/10 is fully in place: `--primary: 224 86% 60%` (`#406EF1`) is locked in all CSS scopes, the Tailwind 4 token vocabulary (radius, shadow, typography scales) is defined in `globals.css`, and `next-themes` defaults to dark. The landing page inherits all of this without any additional CSS wiring.

The one meaningful technical complexity in this phase is the middleware change. Currently `lib/supabase/proxy.ts::updateSession()` redirects any unauthenticated request that is not `/login`, `/signup`, `/reset-password`, `/callback`, or `/estimate/*` to `/login`. Adding `/` (exact match) to the public-route list is a 3-line change, but the authenticated `/` → `/dashboard` redirect must be added in `proxy.ts` (the outer wrapper) — not in `updateSession`, to keep the session-refresh logic clean. The existing test file `tests/unit/middleware.test.ts` must receive two new test cases.

**Primary recommendation:** Structure implementation as two plans — Plan 01: middleware + routing changes with unit tests; Plan 02: all landing page UI components. The routing change is a correctness-critical prerequisite; isolating it prevents UI work from shipping with a broken public route.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version (installed) | Purpose | Why Used |
|---------|---------------------|---------|----------|
| Next.js | 16.2.3 | App Router, RSC, static server components | Project standard |
| React | 19.2.4 | Component model | Project standard |
| Tailwind CSS | ^4 | Utility-first styling, arbitrary-value tokens | Project standard |
| shadcn/ui (new-york/neutral) | installed | Card, Button, Sheet, NavigationMenu, Separator | Project standard; all required primitives already present |
| lucide-react | ^1.8.0 | Icons: Mic, Camera, Sparkles, Brain, FileText, Share2, Smartphone, Menu, X | Already in use across the app |
| next-themes | ^0.4.6 | Dark mode default and ThemeProvider | Already wired in `app/layout.tsx` |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `clsx` + `tailwind-merge` | installed | Conditional className composition | `cn()` utility in all components |
| `lib/platform-config.ts` | internal | `getBranding()` — returns `appName`, `logoUrl`, `primaryColor` | Nav logo + page wordmark |

### Alternatives Considered

| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| Intersection Observer (vanilla) for scroll animations | Framer Motion | No additional dependency; CONTEXT.md explicitly calls for "no external animation library" |
| `components/ui/sheet.tsx` for mobile nav | Custom drawer | Sheet is already installed and styled on Phase 9 tokens |
| Static SVG/CSS mockup | Real screenshot or Lottie | CONTEXT.md D-06 explicitly disallows; screenshot-maintenance cost |

**Installation:** None required. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Component Structure

```
app/
├── page.tsx                        # Replace redirect() with <LandingPage /> (server component)
components/
└── landing/
    ├── landing-nav.tsx             # 'use client' — sticky scroll behavior + Sheet drawer
    ├── hero-section.tsx            # Server component — static content, SVG mockup inline
    ├── how-it-works-section.tsx    # Server component — 3 step cards
    ├── features-section.tsx        # Server component — 4 feature cards
    ├── footer-minimal.tsx          # Server component — logo + copyright
    └── product-mockup.tsx          # Server component or inline SVG — waveform → estimate
```

### Pattern 1: Static Server Component Landing Page

`app/page.tsx` becomes a pure async server component that calls `getBranding()` once (for the nav appName) and renders the full landing composition. All child section components are server components except `LandingNav` (requires scroll detection and Sheet state).

```typescript
// app/page.tsx
import { getBranding } from '@/lib/platform-config'
import { LandingNav } from '@/components/landing/landing-nav'
import { HeroSection } from '@/components/landing/hero-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { FooterMinimal } from '@/components/landing/footer-minimal'

export default async function RootPage() {
  const branding = await getBranding()
  return (
    <main className="min-h-screen bg-background text-foreground">
      <LandingNav appName={branding.appName} />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <FooterMinimal appName={branding.appName} />
    </main>
  )
}
```

### Pattern 2: Middleware Public-Route Addition

The middleware split is:
- `lib/supabase/proxy.ts::updateSession()` — add `'/'` (exact match) to the `isPublicRoute` check. This prevents unauthenticated visitors from being redirected to `/login`.
- `proxy.ts::proxy()` — add authenticated-`/`-→-`/dashboard` redirect AFTER `updateSession()` returns, before the admin gate. Check `claims !== null && pathname === '/'` → redirect to `/dashboard`.

```typescript
// proxy.ts addition — after updateSession call
// (claims available from the response is not exposed; need to re-check or use a cookie)
```

**Important finding:** `proxy.ts` calls `updateSession()` which internally reads claims and performs the redirect. To implement the authenticated `/` → `/dashboard` redirect cleanly, the `proxy.ts` wrapper needs access to the session. The cleanest approach is:

Option A — Check claims inside `proxy.ts` after calling `updateSession()` (requires a small Supabase client call in proxy.ts).
Option B — Add the redirect to `updateSession()` alongside the existing redirect logic (simpler, keeps auth logic in one place).

**Recommendation: Option B** — add both the public-route exemption AND the authenticated-`/`-to-`/dashboard` redirect inside `updateSession()` in `lib/supabase/proxy.ts`. This mirrors the existing pattern where all route-protection logic lives in `updateSession`.

```typescript
// lib/supabase/proxy.ts — updated logic sketch
const isAuthRoute = pathname.startsWith('/login') || ...
const isPublicEstimate = pathname.startsWith('/estimate')
const isLandingRoot = pathname === '/'

// Unauthenticated on a protected route → redirect to login
if (!claims && !isAuthRoute && !isPublicEstimate && !isLandingRoot) {
  // ... existing redirect logic
}

// Authenticated visitor hits landing root → redirect to dashboard
if (claims && isLandingRoot) {
  const url = request.nextUrl.clone()
  url.pathname = '/dashboard'
  const redirectResponse = NextResponse.redirect(url)
  supabaseResponse.headers.forEach((value, key) => {
    if (key === 'set-cookie') redirectResponse.headers.append(key, value)
  })
  return redirectResponse
}
```

### Pattern 3: Sticky Nav with Scroll Detection

`LandingNav` is a `'use client'` component. Uses `useEffect` + `addEventListener('scroll')` to toggle a `scrolled` boolean state, applying `backdrop-blur-md bg-background/80 border-b border-border` at > 0px scroll.

```typescript
// components/landing/landing-nav.tsx
'use client'
import { useState, useEffect } from 'react'

export function LandingNav({ appName }: { appName: string }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  // ...
}
```

### Pattern 4: Gradient Border Hover Treatment (ui-ux-pro-max)

Cards use a CSS `::before` pseudo-element for gradient border on hover, constrained by `@media (hover: hover)` to avoid sticky hover on touch devices:

```css
/* Applied via Tailwind arbitrary variants or a globals.css addition */
.card-hover-gradient {
  position: relative;
}
@media (hover: hover) {
  .card-hover-gradient:hover::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(135deg, hsl(var(--primary) / 0.4) 0%, hsl(218 85% 73% / 0.4) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }
}
```

### Pattern 5: Hero Gradient Backdrop

The hero background uses an inline `style` or a CSS class for the radial gradient — Tailwind 4 supports arbitrary gradient stops via `[background:radial-gradient(...)]` syntax:

```tsx
<section
  className="relative min-h-[90vh] flex items-center"
  style={{
    background: `radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.12), transparent)`
  }}
>
```

### Anti-Patterns to Avoid

- **`'use client'` on section components:** Only `LandingNav` requires client interactivity. All sections are static — keep them as server components. Unnecessary `'use client'` adds bundle size and prevents RSC streaming.
- **Hardcoding `#406EF1` hex values:** Always consume `hsl(var(--primary))` or Tailwind `bg-primary` / `text-primary`. Hex values bypass the CSS variable system and break scoped-theme overrides.
- **Using `dark:*` Tailwind variants inside the landing page:** Phase 9 RESEARCH documents that `dark:*` variants do not fire inside `[data-theme]` scoped wrappers. The landing page is under the root `.dark` class (via next-themes), so `dark:*` variants work here — but the project convention is to use semantic tokens only (`bg-background`, `text-foreground`, `bg-card`, etc.) to remain theme-agnostic. This is critical for when `next-themes` switches to light mode.
- **Importing `server-only` modules in client components:** `lib/platform-config.ts` imports `server-only` and cannot be used in `'use client'` components. Pass `appName` as a prop from the parent server component (already shown in Pattern 1).
- **Scroll animation libraries (Framer Motion, GSAP):** Explicitly forbidden by CONTEXT.md. Use Intersection Observer API directly or Tailwind `animate-in` (if available in Tailwind 4).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobile nav drawer | Custom slide-in panel | `Sheet` from `components/ui/sheet.tsx` | Already styled on design tokens, handles focus trap, a11y |
| Button variants (primary, ghost) | Custom button with className logic | `Button` from `components/ui/button.tsx` | Already maps `variant="default"` → `bg-primary`, `variant="ghost"` → transparent |
| Card container | Bare `div` with manual shadow/border | `Card` / `CardHeader` / `CardContent` | Consumes `--card`, `--border`, `--shadow-*` tokens automatically |
| Sticky nav backdrop blur | Custom CSS | Tailwind `backdrop-blur-md bg-background/80` | Already in Tailwind 4 utility set |
| Smooth anchor scroll | JavaScript scroll handler | Native `scroll-behavior: smooth` on `html` + `href="#section-id"` | Zero JS, works on iOS Safari |
| Theme color resolution | Hard-coded hex | `hsl(var(--primary))` / `bg-primary` | Stays in sync with Phase 10 locked token |

**Key insight:** The design system investment in Phases 9–10 means Phase 11 is almost entirely composition work. The primitives, tokens, and patterns are already in place — the planner should scope tasks as "assemble" not "build."

---

## Critical Technical Findings

### Finding 1: `proxy.ts` IS the Next.js Middleware

There is no `middleware.ts` in the project root. Next.js 16 / Turbopack discovers `proxy.ts` as the middleware entrypoint (confirmed in `.next/dev/server/middleware.js`: `INNER_MIDDLEWARE_MODULE => "[project]/proxy.ts"`). The exported `proxy` function is the middleware handler and the exported `config.matcher` is the route matcher. 

**Implication for planning:** The CONTEXT.md reference to "update `proxy.ts`" is correct. Do NOT create a new `middleware.ts` — all changes go in `proxy.ts` (outer wrapper) and `lib/supabase/proxy.ts` (auth logic).

### Finding 2: Auth Route Paths Use `/auth/*` in App Router, but `/login` in `updateSession`

There is a mismatch: `tests/unit/middleware.test.ts` checks `pathname.startsWith('/auth')` but `lib/supabase/proxy.ts` checks `pathname.startsWith('/login')`. Looking at the app structure, auth pages are at `app/(auth)/login/`, `app/(auth)/signup/`, etc. — the route group `(auth)` is transparent to the URL, so the actual paths are `/login`, `/signup`, `/reset-password`, `/callback`. The test file's `/auth/login` checks are testing the wrong path prefix and are passing only because the test itself is a pure logic test (not an integration test).

**Implication for planning:** When adding the test case for `/ is a public route`, verify the test mirrors the actual logic in `lib/supabase/proxy.ts` (not `/auth/login` but `/login`). The new test cases should test `pathname === '/'` exact match.

### Finding 3: `getBranding()` is `server-only` — Cannot Use in Client Components

`lib/platform-config.ts` has `import 'server-only'` at line 1. `LandingNav` must be a `'use client'` component (for scroll detection and Sheet state). Therefore `getBranding()` must be called in `app/page.tsx` (server component) and `appName` passed down as a prop to `LandingNav`.

### Finding 4: Tailwind CSS v4 Syntax

The project uses Tailwind CSS v4 (`@import "tailwindcss"` in globals.css, `@tailwindcss/postcss` in devDependencies). Tailwind v4 uses `@theme inline` blocks instead of `tailwind.config.ts`. There is no `tailwind.config.ts` — configuration is entirely in `globals.css`. Arbitrary value syntax (`bg-[hsl(var(--primary)/0.12)]`) and CSS custom property consumption (`bg-primary`, `text-foreground`) both work. The `dark:*` variant is still available but the project convention (from Phase 9 research) is to use semantic tokens.

### Finding 5: Next.js 16 Params Must Be Awaited

The project has an established pattern (from Phase 3): "Next.js 16 params typed as `Promise<{ id: string }>` with `await` destructuring." The landing page has no dynamic params, so this is not directly applicable — but the `generateMetadata` pattern in `app/layout.tsx` shows the async server component model is already in use.

---

## Common Pitfalls

### Pitfall 1: `/` Still Redirecting After the Fix

**What goes wrong:** Developer adds `isLandingRoot` to the unauthenticated guard but forgets to handle the case where `pathname === '/'` and auth route check logic hits first.
**Why it happens:** The condition chain `!claims && !isAuthRoute && !isPublicEstimate` — adding `&& !isLandingRoot` must be in the right position.
**How to avoid:** Add the exemption in `updateSession`, add unit tests asserting (a) unauthenticated GET `/` → landing rendered (no redirect), (b) authenticated GET `/` → `/dashboard` redirect.
**Warning signs:** Navigating to `/` while logged out redirects to `/login`.

### Pitfall 2: `getBranding()` Called in a Client Component

**What goes wrong:** `LandingNav` is marked `'use client'` and imports `getBranding()` directly → build error "You're importing a component that needs `server-only`".
**Why it happens:** `lib/platform-config.ts` has `import 'server-only'` at top.
**How to avoid:** Call `getBranding()` in `app/page.tsx` (server component), pass `appName` as a prop.

### Pitfall 3: Hover States on Mobile Touch Devices

**What goes wrong:** CSS hover states (gradient border, elevation shadow) trigger on tap and stay "stuck" on iOS Safari / Android Chrome because there is no mouse-leave event.
**Why it happens:** CSS `:hover` pseudo-class fires on touch tap and persists until the user taps elsewhere.
**How to avoid:** Gate all hover styles inside `@media (hover: hover)` — either in CSS directly or using Tailwind's `[@media(hover:hover)]:hover:shadow-md` arbitrary variant.
**Warning signs:** Cards appear with glowing borders after a single tap on mobile.

### Pitfall 4: `dark:*` Variants Not Firing if `next-themes` Uses Class Strategy

**What goes wrong:** `dark:text-foreground` doesn't update when `next-themes` switches themes.
**Why it happens:** Phase 9 established that `dark:*` variants don't fire inside `[data-theme]` scoped wrappers. The landing page is under the root `.dark` class managed by `next-themes` — so `dark:*` DOES fire on the landing page — but it's fragile and not the project convention.
**How to avoid:** Use semantic tokens exclusively (`text-foreground`, `bg-background`, `bg-card`) — these respond to both `.dark` class and `[data-theme]` scope changes automatically.

### Pitfall 5: `prefers-reduced-motion` Not Respected for SVG Animation

**What goes wrong:** The product mockup waveform animation (`@keyframes pulse`) plays for users with vestibular disorders.
**Why it happens:** CSS animations run unconditionally unless explicitly gated.
**How to avoid:** Wrap the waveform animation keyframe consumption in `@media (prefers-reduced-motion: no-preference)` in globals.css, or use the `motion-safe:animate-[...]` Tailwind variant. The UI-SPEC explicitly requires this.

### Pitfall 6: Sheet Accessibility on Mobile

**What goes wrong:** Screen reader users cannot navigate the mobile Sheet drawer; focus trap is missing.
**Why it happens:** Custom sheet implementations often omit focus management.
**How to avoid:** Use the existing `components/ui/sheet.tsx` (Radix UI Dialog primitive underneath) — it handles focus trap, `aria-modal`, and close on Escape automatically.

---

## Code Examples

### Middleware Update (lib/supabase/proxy.ts)

```typescript
// Verified pattern: extends existing logic in lib/supabase/proxy.ts
const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/reset-password') || pathname.startsWith('/callback')
const isPublicEstimate = pathname.startsWith('/estimate')
const isLandingRoot = pathname === '/'   // NEW

// Redirect unauthenticated to /login (unchanged logic, add isLandingRoot exemption)
if (!claims && !isAuthRoute && !isPublicEstimate && !isLandingRoot) {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  const redirectResponse = NextResponse.redirect(url)
  supabaseResponse.headers.forEach((value, key) => {
    if (key === 'set-cookie') redirectResponse.headers.append(key, value)
  })
  return redirectResponse
}

// NEW: Redirect authenticated visitors from / → /dashboard
if (claims && isLandingRoot) {
  const url = request.nextUrl.clone()
  url.pathname = '/dashboard'
  const redirectResponse = NextResponse.redirect(url)
  supabaseResponse.headers.forEach((value, key) => {
    if (key === 'set-cookie') redirectResponse.headers.append(key, value)
  })
  return redirectResponse
}
```

### Sticky Nav Scroll Detection

```typescript
// 'use client'
const [scrolled, setScrolled] = useState(false)
useEffect(() => {
  const onScroll = () => setScrolled(window.scrollY > 0)
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}, [])

// Apply conditional classes
className={cn(
  'fixed top-0 z-50 w-full h-16 flex items-center transition-all duration-200',
  scrolled
    ? 'backdrop-blur-md bg-background/80 border-b border-border'
    : 'bg-transparent border-transparent'
)}
```

### Step Number Badge (From UI-SPEC)

```tsx
<span className="w-9 h-9 rounded-full border border-primary/60 flex items-center justify-center text-primary font-bold text-sm">
  1
</span>
```

### Hero Backdrop Gradient

```tsx
<section
  className="relative min-h-[90vh] flex items-center"
  style={{
    background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.12), transparent)'
  }}
>
```

### Gradient Text on Hero Keyword (ui-ux-pro-max treatment)

```tsx
<span
  style={{
    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(218 85% 73%) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }}
>
  5 Minutes
</span>
```

### Scroll Animation (Intersection Observer, no library)

```typescript
// useEffect in section component or shared hook
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('animate-in', 'fade-in', 'slide-in-from-bottom-4')
    }),
    { threshold: 0.1 }
  )
  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el))
  return () => observer.disconnect()
}, [])
```

Note: Tailwind 4 includes `animate-in`, `fade-in`, and `slide-in-from-bottom-*` utilities via the `tailwindcss-animate` plugin (included with shadcn/ui). Verify availability before using — fallback to manual opacity/transform CSS if absent.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.ts` for token definition | `@theme inline` in `globals.css` (Tailwind v4) | Tailwind v4 (project already uses this) | No `tailwind.config.ts` to modify — all token changes go in `globals.css` |
| `dark:*` class variants for theming | Semantic CSS variables + `[data-theme]` scoped selectors | Phase 9 | Cannot rely on `dark:*` for scoped-theme scenarios; use semantic tokens |
| `getSession()` for auth | `getClaims()` for JWT signature re-validation | Phase 1 | All middleware auth must use `getClaims()` |
| Next.js 15 params as sync objects | Next.js 16 params as `Promise<T>` requiring `await` | Phase 3 | No dynamic params on landing page — not applicable here |

---

## Environment Availability

Step 2.6: SKIPPED — Phase 11 is a UI composition phase with no new external dependencies. All required tools (Node.js, npm, Next.js 16, Tailwind v4, lucide-react) are already installed and verified in the running dev environment.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.4 + jsdom |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm test -- --run tests/unit/middleware.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAND-01 | `app/page.tsx` no longer calls `redirect("/auth/login")` | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ (extend existing) |
| LAND-01 | Unauthenticated GET `/` is not redirected to `/login` | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ (add case) |
| LAND-02 | Authenticated GET `/` redirects to `/dashboard` | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ (add case) |
| LAND-03 | Features grid has 4 cards | visual / manual | Manual verification on `localhost:9633` | N/A |
| LAND-04 | Touch targets ≥ 44px | visual / manual | Manual verification + DevTools mobile emulation | N/A |
| LAND-05 | `--primary: 224 86% 60%` present in all CSS scopes | unit | `npm test -- --run tests/unit/globals-brand-tokens.test.ts` | ✅ (Phase 10 test) |

### Sampling Rate

- **Per task commit:** `npm test -- --run tests/unit/middleware.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/middleware.test.ts` — add 2 new test cases: (a) `/ is a public route (unauthenticated)`, (b) `/ redirects authenticated users to /dashboard`. File exists; cases are new additions.

*(All other test infrastructure is in place. No new test files or framework setup required.)*

---

## Open Questions

1. **Tailwind `animate-in` / `fade-in` availability**
   - What we know: shadcn/ui includes `tailwindcss-animate` which provides these utilities. The project uses shadcn/ui.
   - What's unclear: Whether `tailwindcss-animate` is explicitly configured for Tailwind v4 (different plugin mechanism than v3).
   - Recommendation: Executor should verify `animate-in` works at runtime in Wave 1. If not available, use inline `style` with `opacity` and CSS transitions instead — < 5 lines per element.

2. **`getBranding()` on landing page — cache cold-start latency**
   - What we know: `getBranding()` has a 60-second TTL cache. On first request after deploy, it calls Supabase.
   - What's unclear: Whether the 1-2ms Supabase latency is acceptable for a public landing page's TTFB.
   - Recommendation: The existing cache pattern is sufficient. The page is a server component — initial load hits the DB, subsequent requests within 60s use cache. No change needed.

3. **Hero fluid font size — Tailwind v4 `clamp()` syntax**
   - What we know: UI-SPEC specifies `clamp(1.875rem, 4vw + 1rem, 3.25rem)` for the hero headline.
   - What's unclear: Whether Tailwind v4 supports this directly as a utility or requires an inline `style` prop.
   - Recommendation: Use `style={{ fontSize: 'clamp(1.875rem, 4vw + 1rem, 3.25rem)' }}` as the safe fallback. Tailwind v4 does support `text-[clamp(...)]` arbitrary values — executor should prefer the utility form.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `proxy.ts`, `lib/supabase/proxy.ts`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `package.json`, `vitest.config.ts` — all read directly from repository
- `.next/dev/server/middleware.js` — confirms `proxy.ts` is the active middleware entrypoint
- `.planning/phases/11-marketing-landing-page/11-CONTEXT.md` — locked decisions from user discussion
- `.planning/phases/11-marketing-landing-page/11-UI-SPEC.md` — verified UI design contract
- `.planning/STATE.md` — accumulated project decisions through Phase 10

### Secondary (MEDIUM confidence)
- Next.js 16 App Router documentation patterns (from training knowledge, current as of Next.js 15/16 release) — RSC default, `'use client'` for interactivity
- Tailwind CSS v4 `@theme inline` pattern — confirmed by `globals.css` using `@import "tailwindcss"` and `@theme inline` block

### Tertiary (LOW confidence — flag for validation)
- Intersection Observer + Tailwind `animate-in` scroll animation pattern — training knowledge; executor should verify `tailwindcss-animate` is configured for Tailwind v4 at runtime

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 11 |
|-----------|-------------------|
| Next.js 14+ App Router | `app/page.tsx` must be a server component; client code only in `'use client'` components |
| TypeScript strict | All components need explicit prop types; no implicit `any` |
| Tailwind CSS | All styling via utilities; no inline styles except for dynamic values (gradient, clamp) |
| shadcn/ui | Use existing primitives (Button, Card, Sheet, NavigationMenu); do not install third-party component libraries |
| Security: Service role key never in browser | `getBranding()` is `server-only`; pass data as props to client components |
| Mobile: iOS Safari and Android Chrome | 44px touch targets; `@media (hover: hover)` gate; `scroll-behavior: smooth` |
| AI calls server-side only | Not applicable — landing page has no AI calls |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed present via `package.json` and `ls components/ui/`
- Architecture: HIGH — all patterns derived from existing codebase code; no speculation
- Middleware logic: HIGH — confirmed from source files and built output
- Pitfalls: HIGH — derived from established project decisions in STATE.md and direct code inspection
- Scroll animations: MEDIUM — Intersection Observer confirmed; `animate-in` utility availability needs runtime verification

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable stack; Next.js 16 and Tailwind v4 APIs stable)
