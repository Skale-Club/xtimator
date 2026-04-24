# Phase 11: Marketing Landing Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 11-marketing-landing-page
**Areas discussed:** Navbar & auth flow, Hero visual treatment, Sections beyond required 3, Animations & polish level, Hero copy direction

---

## Navbar & Auth Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Logo + Sign In + Sign Up CTA | Wordmark left, 'Sign In' ghost link + 'Get Started' primary button right. Sticky with blur backdrop. Authenticated users auto-redirect to /dashboard. | ✓ |
| Logo only, hero handles CTAs | Minimal fixed bar with just the wordmark/logo. All CTA in the hero section. | |

**User's choice:** Logo + Sign In + Sign Up CTA
**Notes:** Sticky navbar with backdrop-blur. Authenticated users redirect to /dashboard.

---

## Hero Visual Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Gradient glow + bold text | #406EF1 radial glow behind a large headline. Dark atmosphere with accent lighting. No screenshot. | ✓ |
| App screenshot / mockup | Hero shows a styled screenshot of the estimate editor or dashboard. | |
| Gradient + floating UI cards | Abstract glow with floating micro-cards showing product snippets. | |

**User's choice:** Gradient glow + bold text
**Notes:** Pure dark atmosphere, #406EF1 radial glow centered behind headline text. No product screenshot needed.

---

## Sections Beyond Required 3

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom CTA band | Full-width conversion section before footer — "Ready to send estimates in 5 minutes?" | ✓ |
| Stats / trust bar | Horizontal strip with product facts ("5 min average", "Mobile-first", "PDF ready"). | |
| Minimal footer | Copyright line + Sign In and Sign Up links. | |

**User's choice:** Bottom CTA band only
**Notes:** Stats/trust bar deferred (no real numbers yet). Footer still included at Claude's discretion (minimal copyright + auth links).

---

## Animations & Polish Level

| Option | Description | Selected |
|--------|-------------|----------|
| Scroll-triggered fade-ins | Sections/cards animate in on scroll. Pure Tailwind CSS + Intersection Observer. No extra dependency. | ✓ |
| Framer Motion | Spring animations, stagger effects, hover micro-interactions. Adds ~36KB bundle. | |
| Static, no animations | Clean, fast, zero JS for visual effects. | |

**User's choice:** Scroll-triggered fade-ins
**Notes:** No Framer Motion. Intersection Observer + Tailwind CSS transitions only.

---

## Hero Copy Direction

| Option | Description | Selected |
|--------|-------------|----------|
| Outcome-focused: '5-Minute Estimates' | "Professional estimates in 5 minutes." Leads with speed/value prop. | ✓ |
| Action-focused: 'From Job Site to Sent' | "From job site audio to a sent estimate." Tells the workflow story. | |
| Problem-focused: 'Stop Writing Estimates by Hand' | Leads with the pain point. | |

**User's choice:** Outcome-focused
**Notes:** Headline: "Professional estimates in 5 minutes." Subheadline: "Record a job site walkthrough. Add photos. AI writes the estimate. Send it before you leave the driveway."

---

## Claude's Discretion

- Exact Lucide icon names for Features grid
- Card shadow/border treatment (subtle or glow border)
- How It Works layout: horizontal timeline (desktop) vs vertical stack vs card grid
- Footer layout (single row or two-column)
- Exact Tailwind gradient values for the #406EF1 radial glow
- Intersection Observer hook implementation approach
- Whether to use a `(marketing)` route group or keep landing page at root `app/page.tsx`

## Deferred Ideas

- Stats/trust bar — deferred to v1.3 when real usage numbers exist
- Testimonials/social proof — deferred to v1.3 per REQUIREMENTS.md
- Pricing section — deferred until pricing model defined
- /about, /blog, /contact — future marketing sub-pages
- Language toggle on landing page — Phase 12 adds i18n wrappers on top of Phase 11 English strings
