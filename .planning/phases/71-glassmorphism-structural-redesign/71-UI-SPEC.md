---
phase: 71
slug: glassmorphism-structural-redesign
status: draft
shadcn_initialized: true
preset: new-york (existing, locked)
created: 2026-05-17
---

# Phase 71 — UI Design Contract

> Visual contract for the Stripe-Dashboard-tier glassmorphism overhaul. All decisions sourced from CONTEXT.md + SEED-022; brand identity is byte-locked.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (New York, already initialized) |
| Preset | existing — do not re-init |
| Component library | radix-ui primitives (CVA variant pattern) |
| Icon library | lucide-react (gradient-tinted via `text-transparent bg-clip-text` where decorative) |
| Font | Geist (sans) + Geist Mono — already loaded; no new licensing |

---

## Spacing Scale

Multiples of 4 only. Existing semantic spacing tokens (`--space-stack-*`) stay.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge inline padding |
| sm | 8px | Compact element spacing, tab triggers |
| md | 16px | Default card padding, form gaps |
| lg | 24px | Section padding, card body |
| xl | 32px | Layout gaps, hero internal padding |
| 2xl | 48px | Major section breaks, hero vertical breathing room |
| 3xl | 64px | Page-level spacing above hero zones |
| hero | 96px (clamp 64–96) | Landing/dashboard hero vertical padding |

Exceptions:
- Icon-only touch targets: 44px (mobile a11y minimum)
- Sidebar nav items: 40px height (Linear density)
- Glass card internal grid gap: 24px (no 12/20 — strict 4-base)

---

## Typography

Geist for everything. Strong hierarchy variance is the point.

| Role | Size | Weight | Line Height | Tracking |
|------|------|--------|-------------|----------|
| Display (hero, big metrics) | clamp(48px, 8vw, 72px) | 600 (semibold) | 1.05 | -0.025em |
| Title (page H1, section lead) | 32px | 600 | 1.15 | -0.02em |
| H2 (card title, modal title) | 24px | 600 | 1.2 | -0.015em |
| H3 (sub-section, stat label) | 18px | 500 | 1.3 | -0.01em |
| Body | 14px | 400 | 1.5 | 0 |
| Body-lg (landing, share page) | 16px | 400 | 1.55 | 0 |
| Micro (caption, badge, helper) | 12px | 500 | 1.4 | 0.01em |
| Mono (IDs, codes, dimensions) | 13px | 500 | 1.4 | 0 |

Weight rule: only 400 + 500 + 600. No 700, no 300. Hierarchy comes from size + tracking + color, not heavier weight.

i18n gate: PT-BR and ES strings are ~30% longer. Display and Title must NOT clip on `/dashboard`, `/estimate/[token]`, `/settings/billing` at 1440 viewport. Test all 3 locales before snapshot re-mint.

---

## Color

60/30/10 + reserved accents.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `hsl(240 10% 3.9%)` dark / `hsl(0 0% 100%)` light | Page background |
| Secondary (30%) | `hsl(240 4% 11%)` dark / `hsl(0 0% 98%)` light | Cards, sidebar surface (via glass overlay) |
| Accent (10%) — brand | `#406EF1` (`hsl(224 86% 60%)`) | Primary CTAs, active nav, focus ring, link |
| Destructive | `hsl(0 72% 55%)` dark / `hsl(0 84% 60%)` light | Delete, irreversible actions only |
| Success | `hsl(142 70% 45%)` dark / `hsl(142 76% 36%)` light | Paid badge, success toast, accepted estimate |
| Warning | `hsl(38 92% 60%)` dark / `hsl(38 92% 50%)` light | Trial banner, expiring states |

Accent reserved EXCLUSIVELY for:
- Primary CTA buttons (gradient)
- Active sidebar nav item (1.5px left gradient border + soft glass overlay)
- Active tab indicator (2px gradient underline)
- Focus rings on inputs (gradient bottom border + soft glow)
- Stat card top edge (3px gradient border)
- Hero radial backdrop (radial gradient at 8% opacity)
- Link text on hover
- Tier "Pro" card top border

Never used on: body text, list separators, table borders, card backgrounds, regular icons.

---

## New Glass Tokens (additive to `app/globals.css`)

Drop these AFTER existing Phase 9 tokens. Do NOT touch `--primary`, `--background`, `--card`, etc.

```css
/* Phase 71 — Glass surface tokens (dark default) */
@layer base {
  :root {
    --glass-bg: rgba(255, 255, 255, 0.65);
    --glass-bg-strong: rgba(255, 255, 255, 0.85);
    --glass-bg-light: rgba(0, 0, 0, 0.03);
    --glass-border: rgba(0, 0, 0, 0.06);
    --glass-blur: 16px;
    --glass-blur-strong: 24px;

    --gradient-brand: linear-gradient(135deg, #406EF1 0%, #7FA4F4 100%);
    --gradient-hero: radial-gradient(circle at top, rgba(64, 110, 241, 0.18) 0%, transparent 65%);
    --gradient-success: linear-gradient(135deg, #10B981 0%, #34D399 100%);
    --gradient-warning: linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%);
    --gradient-danger: linear-gradient(135deg, #EF4444 0%, #F87171 100%);
    --gradient-premium: linear-gradient(135deg, #406EF1 0%, #A855F7 60%, #EC4899 100%);

    --shimmer-duration: 1.2s;
  }

  .dark,
  [data-theme="admin-dark"],
  [data-theme="dark-auth"] {
    --glass-bg: rgba(20, 24, 33, 0.60);
    --glass-bg-strong: rgba(20, 24, 33, 0.85);
    --glass-bg-light: rgba(255, 255, 255, 0.04);
    --glass-border: rgba(255, 255, 255, 0.08);
    --gradient-hero: radial-gradient(circle at top, rgba(64, 110, 241, 0.28) 0%, transparent 70%);
  }

  /* prefers-reduced-transparency → fall back to solid card */
  @media (prefers-reduced-transparency: reduce) {
    :root, .dark, [data-theme="admin-dark"], [data-theme="dark-auth"], [data-theme="light"] {
      --glass-bg: hsl(var(--card));
      --glass-bg-strong: hsl(var(--card));
      --glass-blur: 0px;
      --glass-blur-strong: 0px;
    }
  }
}

@keyframes shimmer-sweep {
  0%   { transform: translateX(-100%) skewX(-12deg); }
  100% { transform: translateX(200%) skewX(-12deg); }
}
```

Tailwind utility additions (`tailwind.config.ts → theme.extend`):

```ts
backgroundImage: {
  'gradient-brand':    'var(--gradient-brand)',
  'gradient-hero':     'var(--gradient-hero)',
  'gradient-success':  'var(--gradient-success)',
  'gradient-warning':  'var(--gradient-warning)',
  'gradient-danger':   'var(--gradient-danger)',
  'gradient-premium':  'var(--gradient-premium)',
},
backdropBlur: {
  glass:        '16px',
  'glass-strong': '24px',
},
boxShadow: {
  'glow-brand':   '0 0 24px -4px rgba(64, 110, 241, 0.45)',
  'glow-success': '0 0 24px -4px rgba(16, 185, 129, 0.45)',
  'glass':        '0 8px 32px -8px rgba(0, 0, 0, 0.35)',
},
```

---

## Component Variants (CVA snippets — planner drops in)

### `<Card variant="glass">`

Extend `card.tsx` to accept variants via CVA. Existing default stays unchanged.

```ts
const cardVariants = cva(
  "flex flex-col gap-6 rounded-[var(--radius-lg)] py-6 text-card-foreground transition-all",
  {
    variants: {
      variant: {
        default: "border bg-card shadow-sm",
        glass:
          "border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-glass shadow-glass " +
          "supports-[backdrop-filter]:bg-[var(--glass-bg)]",
        "glass-strong":
          "border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-glass-strong shadow-glass",
        "stat":
          "relative border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-glass shadow-glass " +
          "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[3px] " +
          "before:bg-gradient-brand before:rounded-t-[var(--radius-lg)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
)
```

### `<Button variant="primary">` and `variant="premium">`

Append to existing `buttonVariants.variant`:

```ts
primary:
  "relative overflow-hidden bg-gradient-brand text-white shadow-xs " +
  "hover:shadow-glow-brand hover:-translate-y-[0.5px] active:translate-y-0 " +
  "before:content-[''] before:absolute before:inset-0 before:-translate-x-full " +
  "before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent " +
  "hover:before:translate-x-full before:transition-transform before:duration-[var(--shimmer-duration)] " +
  "motion-reduce:before:hidden",
premium:
  "bg-gradient-premium text-white shadow-xs hover:shadow-glow-brand hover:-translate-y-[0.5px]",
```

Backward-compat: `variant="default"` (solid #406EF1) preserved. Phase plans must explicitly opt into `primary` per surface — do NOT global-replace.

### `<Dialog>` (glass overlay + content)

Patch `DialogOverlay` className to add blur:
```
bg-black/40 backdrop-blur-sm supports-[backdrop-filter]:bg-black/30
```

Patch `DialogContent` className:
```
border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-glass-strong shadow-glass
```

Sheet receives identical treatment.

### `<Input>` focused state

Replace existing focus styles in `input.tsx`:
```
focus-visible:border-transparent focus-visible:shadow-glow-brand
focus-visible:[background-image:linear-gradient(transparent,transparent),var(--gradient-brand)]
focus-visible:[background-origin:border-box]
focus-visible:[background-clip:padding-box,border-box]
focus-visible:border-b-[3px]
```
(Implementation note: simpler alternative is a wrapper div with `::after` gradient bar — planner picks the cleaner of the two during 71-02.)

### `<Badge>` — new gradient variants

```ts
"badge-success": "bg-gradient-success text-white border-transparent",
"badge-brand":   "bg-gradient-brand text-white border-transparent",
"badge-warning": "bg-gradient-warning text-black border-transparent",
"badge-danger":  "bg-gradient-danger text-white border-transparent",
```

Status mapping (LOCKED):
- Paid / Accepted → `badge-success`
- Trial / Pro tier / New → `badge-brand`
- Expiring soon / Action needed → `badge-warning`
- Declined / Failed / Past due → `badge-danger`

### `<Tabs>` gradient indicator

In `TabsTrigger` `after:` rule, change `after:bg-foreground` to:
```
after:bg-gradient-brand after:rounded-full group-data-[orientation=horizontal]/tabs:after:h-[2px]
```

Active trigger gets `data-[state=active]:text-foreground` (already present, keep).

### `<Toast>` (sonner wrapper)

Glass surface + 3px left gradient border colored by status:
```
border-[var(--glass-border)] bg-[var(--glass-bg-strong)] backdrop-blur-glass shadow-glass
border-l-[3px] data-[type=success]:border-l-emerald-500 data-[type=error]:border-l-rose-500
data-[type=warning]:border-l-amber-500 data-[type=info]:border-l-[#406EF1]
```

---

## Pattern Catalog (8 patterns — must all render on `/admin/design-system`)

### 1. Hero Zone
- Wrapper: `relative` container with `bg-gradient-hero` absolute backdrop layer (z-0)
- Display headline (clamp 48–72), title body 16px, primary CTA
- Vertical padding `py-[var(--space-hero)]` (≈80px desktop, 48px mobile)
- Applies to: `/dashboard` top, `/estimate/[token]` top, `/` landing, `/settings/billing` top

### 2. Stat Card
- `<Card variant="stat">` (3px gradient top border)
- Layout: label (Micro 12px, muted) → value (Display 32px, mono for currency) → delta (Body 14px with up/down arrow tinted success/danger)
- Optional micro-sparkline at bottom (uses brand stroke)
- Min height 120px desktop / 96px mobile

### 3. Modal / Dialog
- `<Dialog>` with patched glass-strong backdrop
- Title H2 24px semibold, description Body 14px muted
- Footer right-aligned: ghost cancel + primary CTA
- Max width 512px (existing `sm:max-w-lg` preserved)

### 4. Sidebar Nav Item
- Container: `<aside>` with glass surface (`bg-[var(--glass-bg)] backdrop-blur-glass border-r border-[var(--glass-border)]`)
- Item height 40px, padding `px-3 gap-3`, rounded-md
- Inactive: muted-foreground text + lucide icon
- Hover: `bg-[var(--glass-bg-light)]`
- Active: `bg-[var(--glass-bg-light)]` + `before:` pseudo for 1.5px left gradient bar (full item height, `bg-gradient-brand rounded-full`)

### 5. Toast
- Pattern from variant above; auto-dismiss 5s; sliding from bottom-right on desktop, top on mobile

### 6. Empty State
- Centered, max-w-md
- Decorative icon (lucide) wrapped in 48px circle: `bg-gradient-brand text-white`
- H3 18px semibold heading
- Body 14px muted description + next step
- Primary CTA below
- Vertical padding `py-2xl`

### 7. Loading Skeleton
- Existing shimmer keyframe preserved
- Color tint changes from `bg-muted` to a brand-tinted version:
  `bg-gradient-to-r from-[var(--glass-bg-light)] via-[rgba(64,110,241,0.08)] to-[var(--glass-bg-light)]`
- Animation respects `prefers-reduced-motion` (existing pattern preserved)

### 8. Tier Card (billing)
| Tier | Background | Top border | Use |
|------|-----------|------------|-----|
| Free | `<Card variant="glass">` | none | Default state |
| Pro | `<Card variant="stat">` (3px gradient-brand top) | yes | "Most popular" |
| Business | `<Card variant="glass">` + `before:bg-gradient-premium` 3px top | yes | Premium pitch |

CTA: Free=`outline`, Pro=`primary` (gradient), Business=`premium` (tri-gradient).

---

## Surface Contract (per category — before/after + acceptance)

### Marketing (`/`, `/blog/[slug]`)
- Before: flat hero, solid #406EF1 CTA, plain cards
- After: hero gets `gradient-hero` radial backdrop, display headline at clamp(56–72), primary CTA uses `variant="primary"` (gradient + shimmer), feature cards use `variant="glass"` (NOT blur — flat translucent only at this scale to save GPU on landing scroll)
- Acceptance: Lighthouse Performance ≥80 on `/`; no layout shift on locale switch; CTA shimmer disabled under `prefers-reduced-motion`

### Auth + Onboarding (`/login`, `/signup`, `/reset-password`, `/onboarding/*`)
- Before: card on dark-auth background
- After: glass card centered on `gradient-hero` backdrop (the radial sits behind the card), input uses gradient focus state, primary submit uses gradient + shimmer
- Acceptance: form submit + error states still readable at WCAG AA contrast over backdrop

### App Shell (sidebar, topbar, bottom-nav, dropdowns)
- Sidebar: glass surface, gradient left-bar on active item
- Topbar: glass surface (sticky), inline search retains existing pattern but focus uses gradient
- Mobile bottom-nav: solid bg (NO blur — performance), active item gets gradient text
- Dropdowns/popovers: glass-strong, 16px blur
- Acceptance: layout reflow stays at 60fps when sidebar collapses

### Dashboard + Collections (`/dashboard`, `/clients`, `/projects`)
- Hero zone at top with greeting (Display) + primary CTA
- 4-stat-card row using `variant="stat"`
- Recent items list: NOT glass (flat surface for density) — rows use 40px height, hover `bg-[var(--glass-bg-light)]`
- Acceptance: FLJS on `/dashboard` < 500 KB; visual snapshot diff is intentional (re-mint)

### Project Surfaces (`/projects/[id]`, `/capture`, `/describe`, `/photos-input`)
- 5-tab workspace: tabs use gradient underline indicator
- Estimate editor: row cards = flat (NOT glass — too many rows for blur)
- Capture screen: keep existing framer-motion gradient ring; wrap stepper card in `variant="glass"`
- Acceptance: capture screen still hits 60fps on mid-range mobile

### Customer-facing Share (`/estimate/[token]`)
- Forced-light theme preserved
- Hero zone top with brand color/logo, gradient-hero backdrop
- Pay Now button (Phase 70) becomes `variant="primary"` + `shadow-glow-brand`
- Accepted/Paid banner uses `variant="glass"` + success gradient left border
- PDF preview pane: flat card (must look identical to PDF output — no glass)
- Acceptance: button shimmer reads as premium-but-not-cheesy on real customer test

### Settings (`/settings/*`)
- Section cards: `variant="glass"`
- Form rows: 2-column at desktop (label-left, control-right), 1-column mobile
- `/settings/payments`: Stripe Connect cards inherit glass treatment
- `/settings/billing`: tier card pattern from catalog

### Admin (`/admin/*` including new `/admin/design-system`)
- Preserves `admin-dark` scoped theme
- Admin shell uses sidebar+topbar glass patterns
- `/admin/design-system` (NEW): full primitive + pattern gallery — renders every variant of Button, Card, Badge, Input, Dialog (trigger), Tabs, plus all 8 patterns; serves as living style guide

---

## Reference Notes (Stripe Dashboard + others)

| Surface | Reference | Element-by-element extraction |
|---------|-----------|-------------------------------|
| Hero | Stripe Dashboard top | Massive display number ($X.XXX), micro-label above, subtle delta below with arrow + small mute color sparkline behind |
| Sidebar | Linear app | 40px row, lucide icon left, label medium 14px, active = soft surface fill + 1.5px gradient bar left, no full-bar fill |
| Stat cards | Stripe `Payments` overview | Glass row of 4 cards, 3px gradient top edge, big mono number, delta in tiny pill below |
| Modal | Stripe Connect "Verify" modal | 24px blur, glass-strong, 16px radius, generous 32px padding, footer right-aligned with ghost+primary |
| Toast | Linear notifications | Slide-up, glass-strong, colored left bar, dismiss-after-5s |
| Empty state | Linear "no issues" | Centered gradient circle icon, H3 + body, single CTA |
| Tier cards | Vercel pricing | Glass base, top gradient border that escalates by tier, "Most popular" pill on Pro |
| Tabs | Stripe Dashboard nav tabs | Thin gradient underline that slides between active triggers, text color shift from muted to foreground |

Take screenshots and pin to `71-RESEARCH.md` during the research wave; this UI-SPEC stays the contract.

---

## Copywriting Contract

No copy changes. All existing `t()` keys preserved. CTA copy below is what already exists — included so the planner doesn't accidentally rewrite during refactor.

| Element | Copy (key) |
|---------|------|
| Primary CTA (landing) | `landing.cta.start` ("Try Xtimator free") |
| Primary CTA (dashboard hero) | `dashboard.actions.newProject` ("New project") |
| Primary CTA (share Pay Now) | `estimate.pay.cta` ("Pay now") — Phase 70 |
| Empty state (dashboard) | existing `dashboard.empty.*` |
| Error state (toast) | existing `common.error.*` |
| Destructive confirm (delete) | existing `common.confirm.delete` |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | button, card, dialog, input, badge, tabs, sheet, popover, dropdown-menu, toast (sonner) — all already installed | not required |
| third-party | none | not applicable |

No new third-party registries introduced. Phase extends existing primitives only.

---

## Performance Gates (HARD — planner must write enforcement tasks)

- `backdrop-filter: blur(...)` restricted to: hero zones, modals/sheets, sidebar, topbar, dropdowns/popovers, toasts, hero stat cards (4 max per page). NOT on: list rows, table cells, inline badges, estimate editor rows, capture viewfinder.
- Lighthouse Performance ≥ 80 on `/` and `/dashboard` after final wave (CI gate).
- Lighthouse Accessibility ≥ 80 on `/` and `/dashboard` after final wave.
- First Load JS on `/dashboard` < 500 KB (baseline; planner adds bundle-size check task).
- All new CSS via Tailwind utilities — no inline `style={}` for glass/gradient in components.
- Mid-range mobile (Moto G class) scroll on `/dashboard` and `/estimate/[token]` must stay ≥ 55fps (manual smoke test per wave).

## Accessibility Gates (HARD)

- WCAG AA 4.5:1 contrast on every glass surface, tested over its actual backdrop, dark + light modes.
- `prefers-reduced-transparency` → solid `--card` fallback (token block above already enforces).
- `prefers-reduced-motion` → button shimmer hidden, skeleton shimmer respects existing rule.
- Focus rings remain clearly visible: inputs get gradient bottom border + `shadow-glow-brand`; buttons keep `focus-visible:shadow-[var(--focus-shadow)]` (existing).
- Every new pattern variant must be rendered on `/admin/design-system` (REDESIGN-03) so a11y audit is one-page.

## i18n Gate

EN + PT-BR + ES tested on every redesigned screen at 1440 and 375 viewports. Display/Title typography must not clip the longest locale (usually PT). LanguageToggle stays in topbar — do not relocate.

## Snapshot Strategy

All existing Playwright visual snapshots WILL break. Re-mint per wave with `npx playwright test --update-snapshots` in each wave's verification task. CI must show zero false-positive visual regressions after wave 5.

---

## Per-Wave Acceptance (visual "done")

| Wave | Plans | Visual "done" |
|------|-------|---------------|
| 1 | 71-01, 71-02 | `/admin/design-system` renders all 8 patterns + every primitive variant; no existing surfaces visually changed yet |
| 2 | 71-03, 71-04 | Landing hero has radial gradient backdrop + display headline + primary gradient CTA; auth pages show glass card on gradient backdrop |
| 3 | 71-05, 71-06 | Sidebar = glass + gradient active bar; dashboard hero zone + 4 stat cards with gradient top borders; collections lists feel denser but not glass |
| 4 | 71-07, 71-08 | Workspace tabs use gradient underline; capture stepper card is glass; editor stays flat-fast |
| 5 | 71-09, 71-10 | Share page Pay Now glows; settings forms wrapped in glass section cards; billing tier cards escalate Free→Pro→Business with gradient borders; admin shell glass-themed (admin-dark preserved) |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS (no changes — preserve all `t()` keys)
- [ ] Dimension 2 Visuals: PASS (glass restricted per performance gate)
- [ ] Dimension 3 Color: PASS (#406EF1 locked; gradients accent-only)
- [ ] Dimension 4 Typography: PASS (3 weights max, 7 sizes, Geist only)
- [ ] Dimension 5 Spacing: PASS (4-base scale, listed exceptions only)
- [ ] Dimension 6 Registry Safety: PASS (no new third-party registries)

**Approval:** pending
