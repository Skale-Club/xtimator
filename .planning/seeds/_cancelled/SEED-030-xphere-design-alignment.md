---
id: SEED-030
status: cancelled
cancelled: 2026-05-26
cancelled_reason: "User explicitly cancelled post v4.0 close-out (2026-05-26). Trigger window has passed — v4.0 shipped the new surfaces (Switcher + multi-org UI) under the existing design system without alignment. Not pursuing."
planted: 2026-05-22
planted_during: v4.0 Multi-Tenancy (design alignment identified as prerequisite)
trigger_when: Before or alongside v4.0 Multi-Tenancy — the dashboard shell is about to grow new surfaces (company switcher, multi-org UI). Ship design alignment first so new surfaces are born into the right system, not the old one.
scope: Large
---

> **🚫 CANCELLED 2026-05-26** — User decision post v4.0 close-out. Trigger window passed; not pursuing.


# SEED-030: Xphere Design Alignment — Making Xtimator and Xphere Visual Siblings

## Why This Matters

Xtimator and Xphere are two products from the same family, but they look like they were built by different teams. A user who knows both products would not guess they share the same codebase or the same owner.

**The gap is architectural, not cosmetic:**

| Dimension | Xtimator (current) | Xphere v2.1 (reference) |
|-----------|-------------------|------------------------|
| Token system | HSL-based shadcn (`224 86% 60%`) | Hex-based semantic (`#6366F1`) |
| Design language | Glassmorphism, gradient accents | Linear/Vercel/Stripe minimal |
| shadcn style | `new-york` | `default` |
| Font stack | Inter only | Inter + JetBrains Mono |
| Sidebar size | 256px / 64px collapsed | 232px / 60px collapsed |
| Topbar height | 64px (h-16) | 56px (h-14) |
| Sidebar surface | `glass-bg` + `backdrop-blur` | `bg-secondary` flat dark |
| Active nav | `gradient-brand` highlight | `accent-muted` + 2.5px left bar |
| Motion tokens | None formalized | 100ms / 200ms / 300ms / 500ms |
| Radius scale | `0.5rem` rem-based | `8px` px-based |
| Dark mode | Equal weight with light | Dark is primary, light is inversion |

Xphere is on **v2.1 of its design system**, inspired by Linear, Vercel, and Stripe. It is the more mature product visually. Xtimator needs to catch up.

**Each product keeps its own brand color.** This is not about making them identical:
- Xtimator: `--accent: #406EF1` (blue)
- Xphere: `--accent: #6366F1` (indigo)

Everything else — token structure, typography, motion, component shapes, layout proportions — becomes shared DNA.

## What We Know Today (from the audit)

### Xtimator Design System (current state)

**`app/globals.css`** — HSL shadcn tokens throughout:
```css
:root {
  --system-primary: 224 86% 60%;
  --background: 0 0% 100%;
  --primary: var(--system-primary);
  --card: 0 0% 100%;
  --border: 240 5.9% 90%;
  --radius: 0.5rem;
  /* glassmorphism tokens: */
  --glass-bg: rgba(255, 255, 255, 0.65);
  --glass-border: rgba(15, 23, 42, 0.08);
  --glass-blur: 16px;
  /* gradient tokens: */
  --gradient-brand: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%);
}
```

**`components.json`** — `"style": "new-york"`, `"baseColor": "neutral"`

**`app/layout.tsx`** — `Inter` font only, no JetBrains Mono

**`components/app-shell/sidebar.tsx`** — `w-64` expanded / `w-16` collapsed; active state uses `gradient-brand`; border uses `var(--glass-border)`

**`components/app-shell/topbar.tsx`** — `h-16 bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]`

**`components/ui/button.tsx`** — primary variant has `gradient-brand` shimmer animation

**`components/ui/card.tsx`** — has `glass`, `glass-strong`, `stat` variants with `backdrop-blur`

**`components/ui/badge.tsx`** — variants use gradient backgrounds

### Xphere v2.1 Design System (reference — do not modify)

**`C:\Users\Vanildo\Dev\xphere\src\app\globals.css`** — hex-based semantic token system:
```css
:root {
  --bg-primary: #FCFCFD;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F4F4F5;
  --bg-elevated: #FFFFFF;
  --border-subtle: #ECECEF;
  --border: #E4E4E7;
  --border-strong: #D4D4D8;
  --text-primary: #18181B;
  --text-secondary: #52525B;
  --text-tertiary: #A1A1AA;
  --accent: #6366F1;
  --accent-hover: #4F46E5;
  --accent-muted: rgba(99, 102, 241, 0.08);
  --accent-glow: rgba(99, 102, 241, 0.18);
  --motion-fast: 100ms;
  --motion-base: 200ms;
  --motion-modal: 300ms;
  --motion-slow: 500ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --radius-xs: 4px; --radius-sm: 6px; --radius: 8px;
  --radius-md: 10px; --radius-lg: 12px; --radius-xl: 16px; --radius-2xl: 20px;
  --shadow-sm: 0 1px 2px rgba(16,24,40,0.06);
  --shadow-md: 0 4px 12px rgba(16,24,40,0.08);
  --shadow-glow: 0 0 24px rgba(99,102,241,0.20);
}
.dark {
  --bg-primary: #0A0A0B;
  --bg-secondary: #111113;
  --bg-tertiary: #1A1A1D;
  --bg-elevated: #222226;
  --border-subtle: #1E1E22;
  --border: #2A2A2F;
  --border-strong: #3A3A40;
  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --text-tertiary: #71717A;
}
```

**Xphere sidebar**: `bg-secondary` flat dark, `border-r border-[--border-subtle]`, 232px / 60px, active = `bg-accent-muted` + 2.5px left bar with glow

**Xphere topbar**: `h-14 bg-primary border-b border-[--border-subtle]`, no backdrop-blur

**Xphere fonts**: Inter + JetBrains Mono, OpenType features `cv02 cv03 cv04 cv11 ss01`, body letter-spacing `-0.005em`

## Concept

Four sequential phases. Each depends on the prior.

### Phase A — Design Token Foundation

Complete rewrite of `app/globals.css` from HSL shadcn to Xphere v2.1 hex semantic tokens. Add JetBrains Mono. Flip `components.json` from `new-york` to `default`. Add shadcn shim that maps old variable names to new semantic ones (so component files don't need touching yet). Add motion tokens, px-based radius scale, shadow tokens. Remove glassmorphism tokens, gradient tokens, system-primary HSL cascade.

**Only files changed:** `app/globals.css`, `components.json`, `app/layout.tsx`

**Xtimator accent tokens to define:**
- `--accent: #406EF1` (blue, not Xphere's indigo)
- `--accent-hover: #2F5DE0`
- `--accent-muted: rgba(64, 110, 241, 0.08)`
- `--accent-glow: rgba(64, 110, 241, 0.18)`

**Shadcn shim (keeps component files working without changes):**
- `--primary` → `--accent`
- `--card` → `--bg-secondary`
- `--popover` → `--bg-elevated`
- `--muted` → `--bg-tertiary`
- `--muted-foreground` → `--text-secondary`
- `--destructive` → `--danger`
- `--background` → `--bg-primary`
- `--foreground` → `--text-primary`
- `--border` → keep name, change value to hex
- `--input` → collapse into `--border`

**Exit criteria:** `npx tsc --noEmit` passes. App renders (visual glitches on glass-using components are acceptable and expected — they're fixed in Phase B).

### Phase B — Layout Shell Alignment

Update sidebar and topbar to match Xphere's shell. Remove glassmorphism from both surfaces.

**Sidebar changes:**
- `w-64` / `w-16` → `w-[232px]` / `w-[60px]`
- `bg-[var(--glass-bg)] backdrop-blur` → `bg-[--bg-secondary]`
- `border-[var(--glass-border)]` → `border-[--border-subtle]`
- Active state: remove `gradient-brand` → add `bg-[--accent-muted]` + `before:` 2.5px left bar
- Hover: `hover:bg-[--bg-tertiary]`
- Transition: `duration-[--motion-base] ease-[--ease-spring]`

**Topbar changes:**
- `h-16` → `h-14`
- `bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]` → `bg-[--bg-primary] border-b border-[--border-subtle]`
- Dropdowns: `glass-strong border-[var(--glass-border)]` → `bg-[--bg-elevated] border border-[--border]`

**Mobile bottom nav:** `bg-[--bg-secondary] border-t border-[--border-subtle]`, active icon `text-[--accent]`

**Viewport meta:** update `themeColor` to `#0A0A0B` dark / `#FCFCFD` light

**Exit criteria:** All dashboard pages render without layout breaks. No glass surfaces visible in sidebar or topbar.

### Phase C — Core Component Library

Update all primary UI components to use new token vocabulary. Remove gradient shimmer from buttons. Remove glass card variants.

**Button:** `bg-[--accent] text-white hover:bg-[--accent-hover]` — no shimmer, no glow-brand on hover

**Card:** `bg-[--bg-elevated] border border-[--border] rounded-lg shadow-[--shadow-sm]` — glass/glass-strong/stat variants removed

**Badge:** semantic color variants via `rgba(color, 0.10)` muted backgrounds — no gradient

**Input/Select/Textarea:** `bg-[--bg-tertiary] border border-[--border]`, focus `border-[--accent] ring-0`, error `border-[--danger]`

**Label:** `text-[--text-secondary] text-sm font-medium`

**Cleanup:** Remove `.glass`, `.glass-strong`, `.shadow-glass`, `.gradient-brand`, `.animate-shimmer-gradient` utility classes from `globals.css`

**Exit criteria:** All form-heavy pages (project creation, client creation, estimate settings, price book, settings) render correctly.

### Phase D — Data Display & Forms

Tables, skeletons, empty states, Sonner toasts, form section layouts.

**Tables:** header `bg-[--bg-tertiary]`, body rows `hover:bg-[--bg-tertiary]`, borders `border-[--border-subtle]`

**Skeletons:** `bg-[--bg-tertiary] animate-pulse rounded` — no shimmer gradient

**Empty states:** icon `text-[--text-tertiary]` + title `text-[--text-primary]` + desc `text-[--text-secondary]` + optional CTA. Applied consistently to all list views.

**Sonner:** `bg-[--bg-elevated] border border-[--border]`, success/error left border accent

**Form layouts:** `space-y-4` fields, `space-y-6` sections, `border-t border-[--border-subtle]` separators, helper text `text-[--text-tertiary] text-xs`

**Scrollbars:** 10px, `bg-[--bg-tertiary]` track, `bg-[--border-strong]` thumb

**Exit criteria:** All pages in the app feel visually consistent. Side-by-side comparison with Xphere shows shared DNA.

## Visual Before / After

**Before (Xtimator today):**
```
[Sidebar: frosted glass, gradient blue highlight, 256px]
[Topbar: frosted glass, 64px, blur effect]
[Cards: glass-bg with backdrop blur]
[Buttons: gradient-brand shimmer animation]
```

**After (aligned to Xphere v2.1 style):**
```
[Sidebar: flat dark #111113, 2.5px blue left bar, 232px]
[Topbar: flat dark #0A0A0B, 56px, crisp border]
[Cards: bg-elevated surface with subtle border]
[Buttons: solid accent with hover transition, no shimmer]
```

The brand color stays blue. The visual language becomes shared.

## Scope Estimate

**Large — 4 sequential phases (A → B → C → D)**

| Phase | Size | Files Touched | Dependency |
|-------|------|---------------|------------|
| A: Token Foundation | S | 3 files only | None |
| B: Shell Alignment | S-M | 4 shell files | A |
| C: Component Library | M | ~10 UI component files | A |
| D: Data Display | M | ~15 page/component files | C |

Total estimated plans: 6-8 plans across 4 phases.

**Out of scope:**
- Marketing landing page (`/`) and auth pages — they have their own scoped themes
- Admin pages (they benefit automatically from token changes)
- Xphere modifications — Xphere is the reference, it does not change
- Adding new features or changing any UX behavior
- Chart/Recharts theming (auto-updates via semantic tokens)

## Breadcrumbs

**Xtimator files to change:**
- `app/globals.css` — complete rewrite (Phase A)
- `components.json` — style: new-york → default (Phase A)
- `app/layout.tsx` — add JetBrains Mono (Phase A)
- `components/app-shell/sidebar.tsx` — dimensions + surface + active state (Phase B)
- `components/app-shell/topbar.tsx` — height + surface (Phase B)
- `components/app-shell/bottom-nav.tsx` — surface (Phase B)
- `app/(app)/layout.tsx` — container background (Phase B)
- `components/ui/button.tsx` — remove shimmer (Phase C)
- `components/ui/card.tsx` — remove glass variants (Phase C)
- `components/ui/badge.tsx` — remove gradient backgrounds (Phase C)
- `components/ui/input.tsx`, `select.tsx`, `textarea.tsx` — update focus states (Phase C)
- `components/ui/label.tsx`, `separator.tsx` — update token refs (Phase C)
- `components/ui/skeleton.tsx` — update animation (Phase D)
- `components/ui/sonner.tsx` — re-skin toasts (Phase D)
- All `*-table.tsx` wrapper components — update row/header styling (Phase D)
- Settings form components `components/settings/*.tsx` — layout cleanup (Phase D)

**Xphere reference files (read-only):**
- `C:\Users\Vanildo\Dev\xphere\src\app\globals.css` — canonical token values
- `C:\Users\Vanildo\Dev\xphere\src\components\layout\sidebar.tsx` — sidebar reference
- `C:\Users\Vanildo\Dev\xphere\src\components\layout\top-bar.tsx` — topbar reference
- `C:\Users\Vanildo\Dev\xphere\src\components\ui\button.tsx` — button reference

**lib/system-colors.ts** — references `--system-primary`; update to `--accent` direct reference after Phase A

## Notes

- **Do not align accent colors.** Xtimator is blue, Xphere is indigo. That's intentional product differentiation. Everything else aligns.
- **Phase A is the foundation.** If the shadcn shim is written correctly, Phases B/C/D become simpler — most components auto-adapt. The shim is the most important engineering decision.
- **Visual glitches are expected between phases.** Components using `glass-bg` will look broken after Phase A but before Phase B. This is acceptable — ship phases quickly in sequence.
- **Multi-tenant branding:** After Phase A, the `BrandingStyle` component should inject `--accent: #hexcolor` directly. Remove the `--platform-primary` HSL cascade. This simplifies the branding override system.
- **`tsc --noEmit` is the Phase A exit gate.** CSS visual regressions don't block the commit; TypeScript type errors do.
- **Xphere is v2.1 — it will continue to evolve.** Capture the current Xphere token values at the time of implementation. Future Xphere changes can be synced in follow-up seeds.
- **Performance win:** removing `backdrop-blur` from sidebar and topbar reduces GPU layer creation on every scroll. Lower-end devices (field contractors on Android) will notice smoother scroll performance.
- **No glassmorphism does not mean no depth.** Depth comes from `--shadow-sm/md/lg` elevation shadows, border colors, and surface levels (`bg-primary` < `bg-secondary` < `bg-tertiary` < `bg-elevated`). Xphere's depth system is actually richer — it just doesn't use blur.
