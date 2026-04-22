# Phase 11: Marketing Landing Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 11-marketing-landing-page
**Areas discussed:** Auth-aware routing, Hero visual strategy, Nav + CTA structure, Content visual style

---

## Gray Area Selection

Claude presented 4 primary + 4 secondary gray areas. User selected all 4 primary ("do recommended") and skipped all secondary ("Skip — cover only primary").

### Primary areas (all selected)

| Option | Description | Selected |
|--------|-------------|----------|
| Auth-aware routing | What happens when a logged-in user visits / (landing or redirect to /dashboard)? Where does the check live (middleware vs app/page.tsx)? | ✓ |
| Hero visual strategy | What fills the hero beyond headline+CTA — abstract gradient, phone mockup showing audio waveform, product screenshot, or minimal text-only. | ✓ |
| Nav + CTA structure | Top nav (Logo + Sign In + Sign Up CTA) vs minimal vs none; single vs dual CTA; sticky-on-scroll behavior. | ✓ |
| Content visual style | How It Works + Features: lucide icons + copy only, stylized illustrations, or actual product screenshots? | ✓ |

### Secondary areas (all deferred)

| Option | Description | Selected |
|--------|-------------|----------|
| Footer scope | Minimal vs standard footer columns | |
| Theme override on landing | Force dark vs respect next-themes saved preference | |
| Trust / proof elements | Stats, logo strip, or feature-first only | |
| Skip — cover only primary | Only discuss primary areas | ✓ |

**User's choice:** "do recommended" for primary, "Skip — cover only primary" for secondary.
**Notes:** User signaled efficient pacing. Claude batched recommendations instead of walking areas sequentially.

---

## Area 1: Auth-aware routing for `/`

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Update proxy.ts — / public, authenticated → /dashboard | Matches documented D-04 evolution; landing stays static | Requires middleware edit and test update |
| Keep logic in app/page.tsx — server-side session check | Isolated to one file | Mixes auth concerns into marketing surface |
| Serve landing to everyone; "Go to app" CTA for logged-in | Simple | Wastes marketing real estate for existing users |

**Selected:** Update proxy.ts. Landing is public, authenticated users redirect to /dashboard.
**Notes:** Aligns with STATE.md D-04 note: "v1.2 moves redirect to middleware so / serves landing page."

---

## Area 2: Hero visual strategy

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Dark gradient + stylized product mockup (phone/browser) | Shows core value prop; no art asset cost; composable with #406EF1 | Needs SVG/CSS composition work |
| Text-only hero | Fastest to build | Generic AI-SaaS feel — violates SEED-002 quality bar |
| Real product screenshot | Authentic | Maintenance burden as app evolves |
| Animated video | High impact | Out of scope for this phase |
| Abstract gradient only | Low production cost | SEED-002 warns against generic "abstract blur" |

**Selected:** Dark gradient backdrop + stylized product mockup (audio waveform → estimate PDF transition).
**Notes:** Mockup is SVG/CSS, not a captured screenshot. Headline, subheadline, and CTA copy left to planner.

---

## Area 3: Nav + CTA structure

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Sticky top nav: Logo + anchor links + Sign In + Get Started | Dual entry points; anchor links navigable; matches Linear/Vercel/Supabase | More components to build |
| Minimal nav (Logo + Sign In only) | Simpler | Hurts conversion vs dual CTA |
| No nav, hero-only | Cleanest | Loses sticky CTA visibility during scroll |
| Dual CTA only (no anchor links) | Focused | Reduces navigability |

**Selected:** Sticky top nav with backdrop blur. Logo left, "How It Works" + "Features" anchor links, Sign In (ghost), Get Started (primary #406EF1). Mobile uses Sheet drawer.
**Notes:** Primary CTA → /auth/signup. Sign In → /auth/login. Anchor links scroll to #how-it-works and #features.

---

## Area 4: Content visual style (How It Works + Features)

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Lucide icon + copy + ui-ux-pro-max treatments | Consistent with app UX; no art-asset cost; skill handles polish | Less "rich" without elevation via skill |
| Custom illustrations | High differentiation | Production cost, risk, style consistency |
| Real product screenshots | Authentic | Maintenance burden as app UI changes |
| Icons + copy plain | Fastest | Risks generic feel without ui-ux-pro-max |

**Selected:** Lucide icons + copy + ui-ux-pro-max micro-treatments (gradient borders, hover elevation, #406EF1 accent glows). 3 step icons (Mic, Camera, Sparkles as suggestions), 4 feature icons.
**Notes:** Planner may substitute lucide icons with better fits. ui-ux-pro-max + vercel-labs skills are REQUIRED during implementation.

---

## Claude's Discretion

- Exact headline, subheadline, CTA copy
- Exact lucide icon choices for steps and features
- Hero gradient colors (inside --background + --primary palette)
- Micro-animations on scroll (lightweight only)
- Breakpoints and column counts (Tailwind 4 defaults)
- Optional minimal footer (logo + copyright) if trivial

## Deferred Ideas

- Full footer (Product/Company/Legal/Social columns)
- Theme override on landing (force dark)
- Trust/proof elements (stats bar, logo strip)
- Pricing section (pricing model undefined — REQUIREMENTS.md)
- Testimonials (v1.3 — REQUIREMENTS.md)
- Hero video
- Blog/changelog/documentation links
