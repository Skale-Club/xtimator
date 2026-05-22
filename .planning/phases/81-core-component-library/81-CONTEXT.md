# Phase 81: Core Component Library — Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Update all primary UI components (Button, Card, Badge, Input, Select, Textarea, Checkbox, Radio, Label) to use the new token vocabulary from Phase 79. Remove gradient-brand shimmer from buttons. Remove glass card variants. Clean up any remaining `var(--glass-*)`, `var(--gradient-*)`, and HSL-based class references in component files.

**Out of scope:** Tables, forms layouts, skeletons, toasts (Phase 82). Shell (Phase 80). Token definitions (Phase 79).

</domain>

<decisions>
## Implementation Decisions

### Button

- **D-01:** Primary variant: `bg-[--accent] text-white hover:bg-[--accent-hover]` with `transition-colors duration-[--motion-fast]`. No `gradient-brand`, no shimmer animation, no `glow-brand` on hover.
- **D-02:** Destructive variant: `bg-[--danger] text-white hover:bg-[--danger]/90`.
- **D-03:** Outline variant: `border border-[--border] bg-transparent hover:bg-[--bg-tertiary] text-[--text-primary]`.
- **D-04:** Ghost variant: `bg-transparent hover:bg-[--bg-tertiary] text-[--text-primary]`.
- **D-05:** Secondary variant: `bg-[--bg-tertiary] text-[--text-primary] hover:bg-[--bg-elevated]`.
- **D-06:** Sizes unchanged (xs, sm, default, lg, icon).
- **D-07:** Focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--accent] focus-visible:ring-offset-1`.

### Card

- **D-08:** Default card: `bg-[--bg-elevated] border border-[--border] rounded-lg shadow-[--shadow-sm]`.
- **D-09:** Remove glass, glass-strong, stat card variants — they all collapse to the default variant.
- **D-10:** Card hover (for interactive cards): `hover:border-[--border-strong] transition-colors duration-[--motion-fast]`.
- **D-11:** Card header, content, footer padding unchanged.

### Badge

- **D-12:** Default: `bg-[--accent-muted] text-[--accent] border border-[--accent]/20`.
- **D-13:** Secondary: `bg-[--bg-tertiary] text-[--text-secondary]`.
- **D-14:** Success: `bg-[--success]/10 text-[--success]`.
- **D-15:** Warning: `bg-[--warning]/10 text-[--warning]`.
- **D-16:** Danger/Destructive: `bg-[--danger]/10 text-[--danger]`.
- **D-17:** Info: `bg-[--info]/10 text-[--info]`.
- **D-18:** No gradient backgrounds on any badge variant.

### Input

- **D-19:** Base: `bg-[--bg-tertiary] border border-[--border] text-[--text-primary] placeholder:text-[--text-tertiary]`.
- **D-20:** Focus: `border-[--accent] ring-0 outline-none` (no ring shadow, just border color change).
- **D-21:** Error/invalid: `border-[--danger]`.
- **D-22:** Disabled: `opacity-50 cursor-not-allowed`.

### Select, Textarea, Checkbox, Radio

- **D-23:** Same base treatment as Input (`bg-[--bg-tertiary] border border-[--border]`). Focus: `border-[--accent]`.
- **D-24:** Checkbox/Radio checked state: `bg-[--accent] border-[--accent]`.

### Label

- **D-25:** `text-[--text-secondary] text-sm font-medium` (matches Xphere pattern — label is secondary, not primary text).

### Separator

- **D-26:** `bg-[--border-subtle]` (was `bg-border` which resolved to HSL).

### Utility Classes Cleanup

- **D-27:** Remove `.glass`, `.glass-strong` utility classes from globals.css (used in old topbar dropdowns — Phase 80 replaces them).
- **D-28:** Remove `.shadow-glass` utility. Keep `.shadow-glow` (renamed or pointing to `--shadow-glow`).
- **D-29:** Remove `.gradient-brand`, `.animate-shimmer-gradient` utilities.

### Claude's Discretion

- Whether to update Dialog, Sheet, Popover, DropdownMenu and other overlay components in this phase or leave them to a follow-up. Recommended: update them here since they use `--popover` and `--card` tokens which are now aliased — they'll likely work without explicit changes; only fix if visual issues arise.

</decisions>

<canonical_refs>
## Canonical References

### Xphere Reference Components
- `C:\Users\Vanildo\Dev\xphere\src\components\ui\button.tsx` — reference button implementation
- `C:\Users\Vanildo\Dev\xphere\src\components\ui\card.tsx` — reference card
- `C:\Users\Vanildo\Dev\xphere\src\components\ui\badge.tsx` — reference badge
- `C:\Users\Vanildo\Dev\xphere\src\components\ui\input.tsx` — reference input

### Xtimator Files to Edit
- `components/ui/button.tsx` — remove gradient-brand shimmer
- `components/ui/card.tsx` — remove glass variants
- `components/ui/badge.tsx` — update variant classes
- `components/ui/input.tsx` — update focus/base styles
- `components/ui/select.tsx` — update base styles
- `components/ui/textarea.tsx` — update base styles
- `components/ui/checkbox.tsx` — update checked state
- `components/ui/label.tsx` — update text color
- `components/ui/separator.tsx` — update color
- `app/globals.css` — remove `.glass`, `.glass-strong`, `.shadow-glass`, `.gradient-brand` utilities

### Depends On
- Phase 79 (token foundation) must be complete first

</canonical_refs>

<code_context>
## Existing Code Insights

### Button (`components/ui/button.tsx`)
- Currently has `gradient-brand` shimmer variant
- Primary variant uses `hsl(var(--primary))` which after Phase 79 shim will resolve to `--accent` — but the explicit shimmer class needs removal

### Card (`components/ui/card.tsx`)
- Has `glass`, `glass-strong`, `stat` variants using `var(--glass-bg)` and `backdrop-blur`
- Default variant uses `bg-card` (shadcn shim → `--bg-secondary` after Phase 79)

### Badge (`components/ui/badge.tsx`)
- Has `brand`, `success`, `warning`, `danger`, `ghost` variants with gradient backgrounds
- Gradient backgrounds need replacing with solid muted color approach

### Integration Points
- After Phase 79 shadcn shim, many components will work without changes (--card → --bg-secondary, --popover → --bg-elevated)
- Explicit glass/gradient class references need manual cleanup

</code_context>

<specifics>
## Specific Ideas

Visual goal: when a user looks at Xtimator and Xphere side by side, buttons and cards should feel like they come from the same component library — same shape, same elevation, same surface treatment. The only visible difference is the accent color (blue vs indigo).

</specifics>

<deferred>
## Deferred Ideas

- **Dialog/Modal styling** — if shadcn shim handles it automatically, no work needed. If issues arise, add to Phase 82.
- **Command palette** — Xphere has heavily themed cmdk. Xtimator's command palette can be aligned in a follow-up.
- **Sonner toast re-skin** — deferred to Phase 82.

</deferred>

---

*Phase: 81-core-component-library*
*Context gathered: 2026-05-22*
