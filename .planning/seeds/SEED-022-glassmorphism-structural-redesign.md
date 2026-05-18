---
id: SEED-022
status: harvested
planted: 2026-05-17
planted_during: post-Phase-70 (Stripe Connect customer payments shipped)
harvested_in: Phase 71
trigger_when: Owner requested structural visual redesign
scope: Large
---

# SEED-022: Glassmorphism Structural Redesign — All Surfaces

## Why This Matters

Today Xtimator works (functional, dark-mode, branded, i18n, responsive) but visually it's **utilitarian** — shadcn/ui New York defaults with #406EF1 accents. Not ugly, but not memorable either. The product needs a visual identity that makes a service business owner say "essa ferramenta é bonita" the moment they open it.

Reference target: **Stripe Dashboard**. They use subtle glassmorphism (frosted blurs on cards, translucent overlays), vibrant gradient accents on hero elements, strong typography hierarchy, and generous whitespace. Their dashboard is the gold standard for financial SaaS — and Xtimator is also a financial tool (estimates → payments).

Goal: every surface a paying customer sees should feel **premium and modern** without losing the speed and clarity Xtimator already has.

## Decisions Locked (owner answered 2026-05-17)

| Decision | Choice |
|----------|--------|
| **Aesthetic direction** | Glassmorphism + vibrant gradients (Apple / Stripe style) |
| **Scope** | EVERYTHING — landing, auth, onboarding, dashboard, clients, projects, workspace, capture, editor, share page, settings, admin |
| **Brand identity** | Keep all of it — `#406EF1` primary, dark-mode default, current logo + wordmark untouched |
| **Reference inspiration** | Stripe Dashboard (subtle glass, gradient hero accents, strong typography) |

## Architecture

### Design System Layer (foundation)

New tokens added on top of existing semantic tokens (does NOT break current scopes):

**Glass surface tokens** (`globals.css`):
```css
--glass-bg: rgba(20, 24, 33, 0.6);           /* dark-mode glass */
--glass-bg-strong: rgba(20, 24, 33, 0.85);   /* modal, dialog */
--glass-bg-light: rgba(255, 255, 255, 0.04); /* hover/active overlay */
--glass-border: rgba(255, 255, 255, 0.08);
--glass-blur: 16px;                          /* backdrop-filter */
--glass-blur-strong: 24px;                   /* for modals */
```

**Gradient palette** (used as accents, not backgrounds — Stripe style):
```css
--gradient-brand: linear-gradient(135deg, #406EF1 0%, #7FA4F4 100%);
--gradient-hero: radial-gradient(circle at top, #406EF155 0%, transparent 70%);
--gradient-success: linear-gradient(135deg, #10B981 0%, #34D399 100%);
--gradient-warning: linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%);
--gradient-danger: linear-gradient(135deg, #EF4444 0%, #F87171 100%);
```

**Typography scale upgrade** (current → new — more variance, more hierarchy):
```css
--font-display: 'Geist', system-ui;        /* hero headlines, big numbers */
--font-sans: 'Geist', system-ui;           /* body */
--font-mono: 'Geist Mono', ui-monospace;   /* code, IDs */
/* sizes: hero (clamp 48-72px), title (32px), h2 (24px), h3 (18px), body (14px), micro (12px) */
```

### Component Refactors (shadcn primitives extended, not replaced)

**Card** → new variant `glass` adds backdrop-blur + border + bg-translucent. Existing `outline` / `default` variants unchanged.

**Button** → primary buttons get gradient bg (`--gradient-brand`) with subtle hover shimmer. Secondary stays flat. Ghost gains soft glass hover.

**Dialog / Sheet** → already use semi-translucent overlay; now opt-in to backdrop-blur + glass-bg-strong.

**Input** → focused state gains gradient bottom border (3px) + subtle glow.

**Badge** → new gradient variants for status pills (Paid = success-gradient, Trial = brand-gradient).

**Tabs** → underline indicator becomes a thin gradient bar.

### Surface-Level Patterns

- **Hero zones** (top of dashboard, share page, landing) get radial gradient backdrop using `--gradient-hero`
- **Stat cards** (dashboard, billing) use glass + subtle gradient border on top edge
- **Modals/dialogs** use strong glass with 24px blur
- **Sidebar** gains glass surface + subtle gradient highlight on active nav item
- **Empty states** get vibrant gradient illustration accents
- **Loading skeletons** keep current shimmer but with brand-gradient tint instead of grey
- **Toasts** get glass + gradient border on left edge (color by status)

### Surface Inventory (everything redesigned)

| Group | Surfaces |
|-------|----------|
| **Marketing** | `/` (landing), `/blog/[slug]` |
| **Auth** | `/login`, `/signup`, `/reset-password`, `/onboarding/*` (5-step wizard) |
| **App shell** | sidebar, top bar, bottom-nav (mobile), settings dropdown, language toggle, theme toggle |
| **Dashboard** | `/dashboard` — stat cards, recent projects list, quick actions |
| **Collections** | `/clients`, `/projects`, list/grid views |
| **Detail** | `/clients/[id]`, `/projects/[id]` (5-tab workspace) |
| **Capture** | `/projects/[id]/capture` (full-screen recorder), `/projects/[id]/describe`, `/projects/[id]/photos-input` |
| **Editor** | `/projects/[id]` → Estimate tab inline editor |
| **Send** | Send tab → email form, PDF preview, share link generation |
| **Public share** | `/estimate/[token]` — accept/decline, Pay Now (Phase 70), PDF download |
| **Settings** | `/settings/*` (profile, branding, defaults, notifications, price-book, templates, payments, language, appearance) |
| **Billing** | `/settings/billing` — tier card, usage gauges, upgrade modal |
| **Admin** | `/admin/*` (dashboard, integrations, branding, admins, blog, seo, landing, billing) |

### Out of Scope (deferred, may become future seeds)

- Brand identity overhaul (logo, color palette, wordmark) — explicitly kept
- New illustrations / mascot
- Onboarding tour / product walkthrough flow
- Custom font licensing (using Geist which is free)
- Animation library beyond CSS keyframes + framer-motion already installed
- A11y deep dive (separate concern, separate phase)
- Mobile-native gestures (swipe, pinch — separate phase if needed)

## Plan Structure (estimated 5 waves, ~10 plans)

| Wave | Plans | Surfaces |
|------|-------|----------|
| 1 | 71-01, 71-02 | Design system foundation: tokens + primitive variants + Storybook-style reference page |
| 2 | 71-03, 71-04 | Public/onboarding: landing, blog, auth (login/signup/reset), onboarding wizard |
| 3 | 71-05, 71-06 | App shell + collections: sidebar, topbar, dashboard, clients list, projects list |
| 4 | 71-07, 71-08 | Project surfaces: workspace tabs, capture screens, estimate editor, send tab |
| 5 | 71-09, 71-10 | Share page, settings (all sub-pages), admin (all sub-pages), billing |

After each wave: Playwright visual snapshot regression baseline updates + manual review checkpoint.

## Risk Management

- **Visual regression risk:** Playwright snapshot tests need updating after every wave. Existing snapshots will all break — expected.
- **Performance risk:** `backdrop-filter: blur()` is GPU-heavy. Restrict to top surfaces (hero, modals, sidebar), not every card. Profile on mid-range mobile.
- **Token collision risk:** New glass/gradient tokens added ON TOP of existing semantic tokens. Do NOT replace `--primary`, `--background`, etc. — those drive scoped theming (admin dark, share light).
- **Accessibility risk:** Glass surfaces over busy backgrounds can drop contrast. Test every new glass card against WCAG AA (4.5:1). Add solid-bg fallback for `prefers-reduced-transparency`.
- **i18n risk:** New typography scale may break PT/ES translations that are 30% longer than EN. Test all 3 languages on every redesigned screen.

## Setup Requirements

Nothing manual. All changes are code.

## Breadcrumbs

- `app/globals.css` — global tokens
- `components/ui/*` — shadcn primitives to extend with glass/gradient variants
- `tests/e2e/` — Playwright snapshot baselines (will need re-mint after each wave)
- `tailwind.config.ts` — extend with glass utility classes
- Reference visuals: take screenshots of stripe.com/dashboard before starting; pin in Phase 71 CONTEXT.md

## Notes

- This is a **structural** redesign — affects every surface but does NOT change information architecture, navigation, or copy. Same screens, same actions, prettier presentation.
- Schedule-only for now. Will be executed via `/gsd:autonomous` (or manual `/gsd:plan-phase 71` → `/gsd:execute-phase 71`) when owner is ready to invest the focused execution window.
- Use the `ui-ux-pro-max` and `frontend-design` Claude Code skills during planning for component-level guidance.
- Use `gsd:ui-phase 71` BEFORE `gsd:plan-phase 71` so UI-SPEC.md captures the design contract first.
