# Phase 11: Marketing Landing Page - Research

**Researched:** 2026-04-24
**Domain:** Next.js 16 App Router · static server component · Intersection Observer animations · middleware route exemption
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Navbar contains: wordmark/logo left, "Sign In" ghost link + "Get Started" primary button right.
- **D-02:** Navbar is sticky on scroll with `backdrop-blur` + semi-transparent background.
- **D-03:** Authenticated users hitting `/` are redirected to `/dashboard` — handled server-side via `getClaims()`. `/` must be added to the middleware exemption list.
- **D-04:** Hero visual: dark near-black background + `#406EF1` radial gradient glow behind headline. No screenshot or mockup.
- **D-05:** Headline: "Professional estimates in 5 minutes." Subheadline: "Record a job site walkthrough. Add photos. AI writes the estimate. Send it before you leave the driveway."
- **D-06:** Primary CTA: "Get Started Free" → `/auth/signup`. Secondary link: "Sign In" → `/auth/login`.
- **D-07:** Hero height: `100svh` desktop, `90svh` mobile (`min-h-[90svh] md:min-h-[100svh]`).
- **D-08:** Section order: Navbar → Hero → How It Works → Features/Benefits → Bottom CTA band → Footer.
- **D-09:** "How It Works" presents the 3-step flow: Record audio → Add photos → Receive AI estimate.
- **D-10:** "Features/Benefits" is a grid of cards. Icons from Lucide. Features: AI estimate generation, branded PDF output, shareable link, mobile-first use.
- **D-11:** Bottom CTA band: "Ready to send estimates in 5 minutes?" with "Get Started Free" button.
- **D-12:** Footer: minimal — copyright + Sign In / Sign Up links. No non-existent page links.
- **D-13:** Animations via Intersection Observer API + Tailwind CSS class toggling only — NO Framer Motion.
- **D-14:** Navbar fade-in on mount. Hero content stagger-animates on load. Other sections fade-in on scroll.
- **D-15:** Landing page is always dark — does NOT respect `eb-theme` cookie. No additional theme wrapper needed (root layout defaults to dark).
- **D-16:** App name from `getBranding().appName` — no hardcoded "Xtimator" string.
- **D-17:** `proxy.ts` must exempt `/` from catch-all auth redirect: add `pathname === '/'` to the public-route guard.
- **D-18:** `app/page.tsx` becomes the landing page itself (no more `redirect('/auth/login')`). Authenticated-user redirect handled server-side.

### Claude's Discretion
- Exact Lucide icon names for the Features grid
- Card shadow/border treatment on How It Works and Features sections
- Whether "How It Works" uses horizontal timeline (desktop) + vertical stack (mobile) or pure card grid
- Footer layout (single centered row or two-column)
- Exact Tailwind gradient values for the `#406EF1` radial glow (start opacity, spread radius)
- Intersection Observer hook — whether to use a custom hook, shared utility, or inline refs

### Deferred Ideas (OUT OF SCOPE)
- Stats / trust bar strip between Hero and How It Works (noted for v1.3)
- Testimonials / social proof (deferred to v1.3)
- Pricing section (pricing model not yet defined)
- /about, /blog, /contact pages
- Language toggle on landing page (Phase 12 adds `t()` wrappers on top)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAND-01 | Visitor can see a hero section with a strong headline, subheadline, and a signup/login CTA button | app/page.tsx replacement pattern; Button component already has `default` and `ghost` variants; hero copy locked in D-05/D-06 |
| LAND-02 | Visitor can read "How It Works" section showing the 3-step flow | Card + CardHeader + CardContent components ready; Lucide icons Mic/Camera/FileText identified in UI-SPEC; Intersection Observer scroll animation pattern |
| LAND-03 | Visitor can explore a features/benefits grid (AI generation, PDF, shareable link, mobile-first) | 4-card responsive grid; Lucide icons Brain/FileDown/Share2/Smartphone identified in UI-SPEC |
| LAND-04 | Landing page is fully responsive on iOS Safari and Android Chrome | `100svh` (not `100vh`) for iOS; touch targets min 44px; responsive grid breakpoints established in UI-SPEC |
| LAND-05 | Dark theme with `#406EF1` primary, near-black background; production visual quality | Token `--primary: 224 86% 60%` already set globally; `.dark` class always active from root layout; radial glow pattern from UI-SPEC |
</phase_requirements>

---

## Summary

This phase is primarily a **UI construction task** on top of a fully established foundation. The tech stack is locked (Next.js 16 App Router, TypeScript strict, Tailwind CSS 4, shadcn/ui New York), all required design tokens exist in `globals.css`, and the shadcn/ui components needed (Button, Card) are already in `components/ui/`. No new npm dependencies are required.

The two code changes with non-trivial correctness requirements are: (1) patching `lib/supabase/proxy.ts` to exempt `/` from the auth redirect, and (2) converting `app/page.tsx` from a one-line redirect into a server component that renders the full landing page and also handles the authenticated-user-redirect case. The existing `getClaims()` pattern used in `app/(app)/layout.tsx` is the exact pattern to replicate.

Animation is the most architecturally interesting choice: the decision to avoid Framer Motion and use Intersection Observer + Tailwind class toggling is locked. The implementation requires either a small `'use client'` wrapper component or a custom hook — since `app/page.tsx` must be a server component (for `getBranding()` and `getClaims()`), client interactivity must be isolated into child components.

**Primary recommendation:** Build the page as a server component at `app/page.tsx`, extract each animated section into thin `'use client'` wrapper components that own only the Intersection Observer logic, and wire everything together with the existing design tokens and shadcn/ui primitives.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 16.2.3 (confirmed) | Server component, routing, redirect() | Project foundation — locked |
| TypeScript strict | — | Type safety | Project-wide constraint |
| Tailwind CSS | 4.x (confirmed via `@import "tailwindcss"`) | All layout/visual styling | Project-wide convention |
| shadcn/ui New York | — | Button, Card, CardHeader, CardContent, Badge, Separator | Already installed; D-09 locked |
| Lucide React | installed (confirmed in components.json) | Feature icons: Mic, Camera, FileText, Brain, FileDown, Share2, Smartphone | Already installed |
| `@supabase/ssr` | installed | `getClaims()` for server-side auth check | Existing pattern in all app pages |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/platform-config.ts` getBranding() | project code | Dynamic app name | Navbar wordmark, footer copyright |
| `lib/supabase/server.ts` createClient() | project code | getClaims() call in page.tsx | Authenticated-user redirect |
| Intersection Observer API | browser-native | Scroll-triggered animations | Required by D-13; zero dependencies |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Intersection Observer + Tailwind | Framer Motion | Framer Motion adds ~40kb; LOCKED OUT by D-13 |
| `app/page.tsx` as server component | Client component with useEffect | Server component needed for getBranding() + getClaims(); client components used only for animation child wrappers |
| Inline animation logic | react-intersection-observer npm package | Package not in use in project; native API works without dependency; D-13 implies custom code |

**Installation:** No new packages required. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

```
app/
├── page.tsx                          # Server component — landing page root
└── (marketing)/                      # Optional future group; not needed for this phase
components/
└── landing/                          # New directory for landing page components
    ├── landing-navbar.tsx            # 'use client' — handles scroll opacity state (optional; could be pure CSS)
    ├── hero-section.tsx              # 'use client' — fade-in on load animation trigger
    ├── how-it-works-section.tsx      # 'use client' — Intersection Observer scroll animation
    ├── features-section.tsx          # 'use client' — Intersection Observer scroll animation
    ├── bottom-cta-band.tsx           # 'use client' — Intersection Observer scroll animation
    ├── landing-footer.tsx            # Server or client — no animation needed
    └── use-in-view.ts                # Custom hook — shared Intersection Observer logic
lib/supabase/
└── proxy.ts                          # PATCH: add pathname === '/' to public-route guard
```

### Pattern 1: Server Component as Page Root with Client Animation Islands

**What:** `app/page.tsx` is an `async` server component. It calls `getBranding()` and `getClaims()` at the top. If `claims` is truthy, it calls `redirect('/dashboard')`. Otherwise it renders a composition of section components, passing static data (like `appName`) as props.

**When to use:** Any page that needs server-side data AND client interactivity but wants to minimize client bundle size.

**Example:**
```typescript
// app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBranding } from '@/lib/platform-config'
import { LandingNavbar } from '@/components/landing/landing-navbar'
import { HeroSection } from '@/components/landing/hero-section'
// ... other section imports

export default async function RootPage() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (claims) {
    redirect('/dashboard')
  }

  const branding = await getBranding()

  return (
    <main className="min-h-screen bg-[hsl(var(--background))]">
      <LandingNavbar appName={branding.appName} />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <BottomCtaBand />
      <LandingFooter appName={branding.appName} />
    </main>
  )
}
```

### Pattern 2: Intersection Observer Custom Hook (Client Only)

**What:** A lightweight `'use client'` hook that returns a `ref` and `isInView` boolean. Sections use this hook to toggle Tailwind animation classes.

**When to use:** All scroll-animated sections (How It Works, Features, Bottom CTA Band).

**Example:**
```typescript
// components/landing/use-in-view.ts
'use client'
import { useEffect, useRef, useState } from 'react'

export function useInView(threshold = 0.1) {
  const ref = useRef<HTMLElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInView(true) },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isInView }
}
```

**Usage in a section component:**
```typescript
// components/landing/how-it-works-section.tsx
'use client'
import { useInView } from './use-in-view'

export function HowItWorksSection() {
  const { ref, isInView } = useInView()
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-24">
      <div className={`transition-all duration-500 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* cards */}
      </div>
    </section>
  )
}
```

### Pattern 3: Middleware Public Route Exemption Patch

**What:** In `lib/supabase/proxy.ts`, the `updateSession` function redirects unauthenticated users unless `isAuthRoute || isPublicEstimate`. Adding `pathname === '/'` prevents the redirect for landing page visitors.

**When to use:** Required by D-17.

**Example — exact patch site (line 38 of lib/supabase/proxy.ts):**
```typescript
// BEFORE:
if (!claims && !isAuthRoute && !isPublicEstimate) {

// AFTER:
const isLandingPage = pathname === '/'
if (!claims && !isAuthRoute && !isPublicEstimate && !isLandingPage) {
```

### Pattern 4: Hero Radial Glow (Absolute-Positioned Layer)

**What:** An absolute-positioned `div` with `pointer-events-none` carrying the radial gradient as a background. Kept as a separate DOM layer so the gradient never bleeds into text color or layout.

**When to use:** Hero section glow effect (D-04, UI-SPEC).

**Example (from UI-SPEC verbatim):**
```tsx
<div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
  <div
    className="w-[800px] h-[600px] blur-3xl"
    style={{
      background: 'radial-gradient(ellipse at 50% 40%, hsl(var(--primary) / 0.25) 0%, hsl(224 86% 72% / 0.08) 45%, transparent 70%)'
    }}
  />
</div>
```

Note: `hsl(224 86% 72% / 0.08)` is the `#7FA4F4` secondary blue tint at 8% opacity — not a CSS variable, used as a gradient stop only (confirmed in UI-SPEC color section).

### Pattern 5: Load-Trigger Stagger Animation (Hero)

**What:** Hero elements start invisible (`opacity-0 translate-y-2`) and a client effect adds animation classes after a short delay, staggered per element.

**When to use:** Headline → subheadline → CTA row (delays: 0ms, 100ms, 200ms per D-14).

**Anti-Patterns to Avoid**

- **Using `100vh` for iOS Safari hero height:** Mobile Safari's URL bar eats viewport height. Use `100svh` (`min-h-[100svh]`) per D-07 and the UI-SPEC. Tailwind arbitrary value `min-h-[100svh]` is available in Tailwind CSS 3.2+.
- **Hardcoding app name:** `"Xtimator"` must NEVER appear as a string literal. Always `getBranding().appName` per D-16.
- **Making `app/page.tsx` a client component:** This would block `getClaims()` and `getBranding()` (which use `server-only` and service clients). Animation client code must be isolated into child components.
- **Importing Framer Motion:** Locked out by D-13. The project's `package.json` should not gain `framer-motion`.
- **Using `dark:` variant classes on landing page components:** The landing page inherits `.dark` from the root layout. Using `dark:` variants instead of semantic tokens (`hsl(var(--foreground))`, etc.) is the established pattern from Phase 9 (see STATE.md: "removed all dark:* color variants that don't fire inside scoped [data-theme] wrappers").
- **Leaving old middleware test stale:** The existing `tests/unit/middleware.test.ts` tests that `/` is NOT in the public-route list. After the patch, `/` is public. The test must be updated — failure to do so will produce a red test suite.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scroll detection | Custom scroll event listener | Intersection Observer API | Native, performant, no layout thrashing, no dependencies |
| Icon SVGs | Inline SVG paths | Lucide React (already installed) | Consistent sizing, accessible, tree-shakeable |
| Card layout for steps/features | Custom styled divs | shadcn/ui `Card` + `CardContent` | Already in codebase; consistent radius/shadow tokens; tested in ui-primitives.test.tsx |
| Primary CTA button | Custom styled `<a>` or `<div>` | shadcn/ui `Button` with `size="lg"` | Already covers all required variants, sizes, and focus rings |
| App name string | Hardcoded literal | `getBranding().appName` | Respects admin-configured branding; required by D-16 |
| Auth check in page | Rolling custom JWT decode | `createClient()` + `supabase.auth.getClaims()` | Established project pattern; cryptographically correct (re-validates signature) |

**Key insight:** This phase builds no new infrastructure. Every problem (components, auth, tokens, icons) is already solved in the project. The implementation is assembling proven pieces.

---

## Common Pitfalls

### Pitfall 1: Middleware Exemption Not Propagated to proxy.ts Correctly

**What goes wrong:** The route guard is in `lib/supabase/proxy.ts` (the `updateSession` function), NOT in `proxy.ts` (the middleware entry point). Editing only the outer `proxy.ts` file and not `lib/supabase/proxy.ts` leaves the auth redirect intact because `updateSession` runs first and returns a 302 before `proxy.ts` logic is reached.

**Why it happens:** There are two files named proxy-related: `proxy.ts` (middleware orchestrator) and `lib/supabase/proxy.ts` (contains `updateSession`). The non-admin redirect happens inside `updateSession`.

**How to avoid:** The patch must go in `lib/supabase/proxy.ts` at line 38 — the `if (!claims && !isAuthRoute && !isPublicEstimate)` guard. The outer `proxy.ts` only handles `/admin` and defers to `updateSession` for everything else.

**Warning signs:** Unauthenticated visitors to `/` still see `/login` after the fix.

### Pitfall 2: Stale Middleware Unit Test

**What goes wrong:** `tests/unit/middleware.test.ts` currently asserts that `/` is a protected route (not in the public-route list). After the exemption patch, this test will fail if not updated.

**Why it happens:** The existing test was written when `/` redirected to `/auth/login` — which was intentional behavior. The test correctly validated that state.

**How to avoid:** Add a test case `'/ is the landing page route (not protected)'` asserting that `pathname === '/'` evaluates to true in the new public-route guard. Update or replace the existing assertion that `/` is protected.

**Warning signs:** `vitest run` fails on `middleware.test.ts` after the proxy.ts patch.

### Pitfall 3: `getBranding()` Called in a Client Component

**What goes wrong:** `getBranding()` imports `'server-only'` at the top of `lib/platform-config.ts`. Calling it from any `'use client'` component causes a build error: "This module cannot be imported from a Client Component or Client Route."

**Why it happens:** Developers may try to call `getBranding()` inside animated section components for the app name, not realizing those are `'use client'`.

**How to avoid:** Call `getBranding()` only in `app/page.tsx` (server component), then pass `appName` as a prop to `LandingNavbar` and `LandingFooter`.

**Warning signs:** Build fails with "server-only" import error.

### Pitfall 4: `100svh` Not Supported by Tailwind Arbitrary Values on Old Tailwind

**What goes wrong:** `min-h-[100svh]` is only supported with `svh` unit from Tailwind CSS 3.2+. On older versions this would silently produce no output.

**Why it happens:** Knowledge that the project uses Tailwind CSS 4 (`@import "tailwindcss"` syntax confirmed in globals.css) means this is not a real risk here — but worth documenting.

**How to avoid:** Confirmed Tailwind CSS 4 in use — `svh` is fully supported. Use `min-h-[100svh]` as specified in the UI-SPEC.

**Warning signs:** Hero section does not fill the full viewport on iOS Safari.

### Pitfall 5: Intersection Observer Hook on Server Component

**What goes wrong:** A section component exports a `useInView` hook call at the top level, but the file does not declare `'use client'`. Next.js will throw an error at build time about hooks being used in server components.

**Why it happens:** The section components visually look like plain layout components; the `useEffect` + `IntersectionObserver` dependency on client APIs is easy to forget.

**How to avoid:** ALL components in `components/landing/` that use `useInView`, `useEffect`, or `useState` MUST have `'use client'` as their first line. `LandingFooter` and `LandingNavbar` (if purely static) may be server components.

**Warning signs:** Build error: "useState can only be used in a Client Component."

### Pitfall 6: Font Weight 500/600 Used in Landing Page Components

**What goes wrong:** The UI-SPEC explicitly declares only 2 font weights: 400 (normal) and 700 (bold). Using `font-medium` (500) or `font-semibold` (600) creates visual inconsistency with the design contract.

**Why it happens:** shadcn/ui Card's `CardTitle` uses `font-[var(--font-weight-semibold)]` (600) internally. If `CardTitle` is used for step or feature titles, it will apply 600 weight.

**How to avoid:** Do NOT use `<CardTitle>` for titles inside How It Works and Features cards. Instead, use a plain `<p>` or `<span>` with `font-bold` (700). Or override with `className="font-bold"`. The UI-SPEC specifies `font-700` for card titles explicitly.

**Warning signs:** Card titles render at 600 weight instead of 700 — subtle difference but fails the typography contract.

---

## Code Examples

Verified patterns from existing codebase:

### getClaims() Pattern (from app/(app)/layout.tsx — confirmed working)
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const supabase = await createClient()
const { data: claimsData } = await supabase.auth.getClaims()
const claims = claimsData?.claims ?? null

if (!claims) {
  redirect('/auth/login')
}
// For landing page: redirect to /dashboard instead
```

### Tailwind Arbitrary Value with CSS Variable (from Phase 9 established pattern)
```tsx
// Correct:
<div className="bg-[hsl(var(--primary)/0.25)]">
// or for the card hover border:
<div className="hover:border-[hsl(var(--primary)/0.5)] transition-colors duration-200">
```

### Button Usage (confirmed from button.tsx)
```tsx
import { Button } from '@/components/ui/button'

// Primary CTA:
<Button size="lg" asChild>
  <a href="/auth/signup">Get Started Free</a>
</Button>

// Ghost secondary:
<Button variant="ghost" size="lg" asChild>
  <a href="/auth/login">Sign In</a>
</Button>
```

Note: Use `asChild` + `<a>` for navigation CTAs (not `<button>` with onClick) so they are proper anchor elements with correct semantics and keyboard navigation.

### Navbar Sticky with Backdrop Blur
```tsx
<nav className="sticky top-0 z-50 backdrop-blur-md bg-[hsl(var(--background)/0.8)] border-b border-[hsl(var(--border))]">
```

### Radial Glow Layer (from UI-SPEC, exact gradient)
```tsx
<div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
  <div
    className="w-[800px] h-[600px] blur-3xl"
    style={{
      background: 'radial-gradient(ellipse at 50% 40%, hsl(var(--primary) / 0.25) 0%, hsl(224 86% 72% / 0.08) 45%, transparent 70%)'
    }}
  />
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `app/page.tsx` redirects to /auth/login | `app/page.tsx` IS the landing page; authenticated users redirect to /dashboard | This phase | Unauthenticated visitors land on marketing page |
| `/` is a protected route in middleware | `/` is exempted from auth redirect | This phase | Requires proxy.ts patch |
| `100vh` for full-viewport sections | `100svh` (small viewport height) | iOS Safari support | Prevents content hidden under browser chrome on mobile |
| Framer Motion for animations | Intersection Observer + Tailwind CSS | Project decision (D-13) | Zero additional bundle weight |

**Deprecated/outdated:**
- The one-line `redirect('/auth/login')` in `app/page.tsx`: will be entirely replaced.
- The middleware assumption that `/` is always protected: must be updated in both `lib/supabase/proxy.ts` and the corresponding unit test.

---

## Open Questions

1. **`app/page.tsx` vs `app/(marketing)/page.tsx` route group**
   - What we know: CONTEXT.md D-18 says `app/page.tsx` becomes the landing page. No `(marketing)` group is mentioned.
   - What's unclear: Whether future marketing sub-pages (/about, /blog) would benefit from a `(marketing)` route group with a shared marketing layout.
   - Recommendation: Keep it at `app/page.tsx` for this phase per D-18. A `(marketing)` group can be created in a future phase when sub-pages exist. No structural cost to add it later.

2. **Navbar scroll opacity state — client component needed?**
   - What we know: The UI-SPEC specifies `bg-[hsl(var(--background)/0.8)]` statically. The backdrop-blur effect is purely CSS.
   - What's unclear: Whether the navbar needs JS to add/remove a class on scroll (for increased opacity once scrolled).
   - Recommendation: Keep the navbar as a simple server component with static `bg-[hsl(var(--background)/0.8)] backdrop-blur-md`. The CSS effect is sufficient per the spec. Only convert to client component if a JS scroll handler is explicitly needed.

3. **`asChild` pattern for CTA buttons as links**
   - What we know: The Button component supports `asChild` (using Radix Slot). Using `asChild` with `<a href>` renders a proper anchor.
   - What's unclear: Whether Next.js `<Link>` should be used instead of native `<a>`.
   - Recommendation: Use `<Link href="/auth/signup">` from `next/link` wrapped with Button's `asChild`. This gives client-side navigation prefetching while keeping correct button styling. Pattern: `<Button size="lg" asChild><Link href="/auth/signup">Get Started Free</Link></Button>`.

---

## Environment Availability

Step 2.6: SKIPPED — This phase makes no external tool/service calls. All dependencies are code/config edits to existing files plus browser-native Intersection Observer API.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + jsdom + @testing-library/react |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- --run tests/unit/middleware.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LAND-01 | Hero section renders headline, subheadline, and CTAs | unit (render test) | `npm test -- --run tests/unit/components/landing-page.test.tsx` | Wave 0 |
| LAND-02 | How It Works renders 3 step cards with correct titles | unit (render test) | `npm test -- --run tests/unit/components/landing-page.test.tsx` | Wave 0 |
| LAND-03 | Features grid renders 4 feature cards | unit (render test) | `npm test -- --run tests/unit/components/landing-page.test.tsx` | Wave 0 |
| LAND-04 | Responsive layout / iOS Safari | manual-only | — | N/A — viewport testing requires browser |
| LAND-05 | Visual quality / dark theme | manual-only | — | N/A — visual verification in browser |
| D-17 (middleware) | `/` is in the public-route exemption list | unit (logic test) | `npm test -- --run tests/unit/middleware.test.ts` | Exists — needs UPDATE |

### Sampling Rate
- **Per task commit:** `npm test -- --run tests/unit/middleware.test.ts tests/unit/components/landing-page.test.tsx`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/components/landing-page.test.tsx` — new file; covers LAND-01, LAND-02, LAND-03 render assertions
- [ ] `tests/unit/middleware.test.ts` — exists; needs new test case for `pathname === '/'` being public, plus update/removal of the case asserting `/` is protected

*(Existing test infrastructure: vitest + jsdom + @testing-library/react is fully set up; no framework install needed)*

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to This Phase |
|-----------|----------------------|
| Tech Stack: Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui, Zustand or React Context, react-hook-form + zod | App Router confirmed (Next.js 16.2.3). No form/state libraries needed for static landing page. |
| Database: Supabase PostgreSQL with RLS | No new tables. `getClaims()` uses existing auth. `getBranding()` reads existing `platform_branding` table. |
| AI: Anthropic Claude | Not applicable to this phase. |
| Audio transcription: OpenAI Whisper | Not applicable to this phase. |
| PDF: @react-pdf/renderer or puppeteer | Not applicable to this phase. |
| Mobile: Must work on iOS Safari and Android Chrome | CRITICAL — `100svh` not `100vh`, 44px minimum touch targets enforced per UI-SPEC. |
| Security: Service role key never exposed to browser; all AI calls server-side | `getBranding()` uses `createServiceClient()` — server-only, safe. No AI calls on landing page. |
| GSD Workflow Enforcement | All edits go through GSD execute-phase. |

---

## Sources

### Primary (HIGH confidence)
- Direct read of `proxy.ts` (root) and `lib/supabase/proxy.ts` — middleware architecture verified
- Direct read of `app/page.tsx` — current state (one-line redirect) confirmed
- Direct read of `app/(app)/layout.tsx` — `getClaims()` pattern confirmed
- Direct read of `app/globals.css` — CSS tokens (`--primary: 224 86% 60%`, `.dark` vars) confirmed
- Direct read of `components/ui/button.tsx` — variants (`default`, `ghost`, `link`), sizes (`lg`, `sm`) confirmed
- Direct read of `components/ui/card.tsx` — `Card`, `CardHeader`, `CardContent` API confirmed
- Direct read of `lib/platform-config.ts` — `getBranding()` + `server-only` import confirmed
- Direct read of `app/layout.tsx` — `ThemeProvider` defaultTheme `dark`, `getBranding()` call, Inter font confirmed
- Direct read of `11-CONTEXT.md` — all locked decisions D-01 through D-18 sourced
- Direct read of `11-UI-SPEC.md` — component inventory, animation contract, color specs sourced
- Direct read of `vitest.config.ts` — test framework configuration confirmed
- Direct read of `tests/unit/middleware.test.ts` — existing middleware tests confirmed

### Secondary (MEDIUM confidence)
- `package.json` grep — Next.js 16.2.3, vitest 4.1.4 version numbers confirmed from registry data
- `app/globals.css` `@import "tailwindcss"` — Tailwind CSS 4 confirmed (import syntax change from v3)

### Tertiary (LOW confidence)
- None — all critical claims sourced from project codebase directly.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and in use in codebase
- Architecture: HIGH — patterns sourced from existing working implementations in this project
- Pitfalls: HIGH — each pitfall identified from concrete code evidence (actual file content reviewed)
- Animation: HIGH — Intersection Observer is web-standard; Tailwind class toggling pattern is established

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable stack — no fast-moving dependencies)
