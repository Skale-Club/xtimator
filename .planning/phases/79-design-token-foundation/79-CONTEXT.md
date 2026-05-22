# Phase 79: Design Token Foundation — Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate Xtimator's entire CSS variable architecture from the current HSL-based shadcn system to Xphere v2.1's hex-based semantic token system. This phase touches only `app/globals.css`, `components.json`, `app/layout.tsx` (add JetBrains Mono), and any utility files that generate or reference CSS custom properties. No component JSX files are changed in this phase — those are Phases 80-82.

**Out of scope:** Sidebar/topbar layout (Phase 80), component library (Phase 81), data display (Phase 82), any new feature work.

</domain>

<decisions>
## Implementation Decisions

### Token Architecture

- **D-01:** Migrate from HSL shadcn tokens to Xphere v2.1 hex-based semantic tokens. The token file is `app/globals.css` — complete rewrite of the `:root` and `.dark` blocks.
- **D-02:** Xtimator keeps its own brand color: `--accent: #406EF1` (blue). All other token values mirror Xphere v2.1 exactly.
- **D-03:** Surface tokens: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-elevated` (4 levels matching Xphere).
- **D-04:** Border tokens: `--border-subtle`, `--border`, `--border-strong` (3 levels replacing old `--border` and `--input`).
- **D-05:** Text tokens: `--text-primary`, `--text-secondary`, `--text-tertiary` (3 levels replacing `--foreground` and `--muted-foreground`).
- **D-06:** Accent tokens: `--accent`, `--accent-hover`, `--accent-muted`, `--accent-glow` (4 tokens, all derived from #406EF1).
- **D-07:** Semantic status tokens kept but migrated to hex format: `--success: #16A34A`, `--warning: #D97706`, `--danger: #DC2626`, `--info: #2563EB`; plus muted variants.

### Shadcn Compatibility Shim

- **D-08:** Keep shadcn's expected variable names as aliases pointing at the new semantic tokens:
  - `--primary` → `--accent` (#406EF1)
  - `--primary-foreground` → `#FFFFFF`
  - `--secondary` → `--bg-tertiary`
  - `--muted` → `--bg-tertiary`
  - `--muted-foreground` → `--text-secondary`
  - `--card` → `--bg-secondary`
  - `--card-foreground` → `--text-primary`
  - `--popover` → `--bg-elevated`
  - `--popover-foreground` → `--text-primary`
  - `--destructive` → `--danger`
  - `--destructive-foreground` → `#FFFFFF`
  - `--border` → `--border` (same name, keep it, change value to hex)
  - `--input` → `--border` (collapse: input border = default border)
  - `--ring` → `--accent`
  - `--background` → `--bg-primary`
  - `--foreground` → `--text-primary`
  - `--accent` (shadcn's accent, used for hover backgrounds) → `--bg-tertiary`
  - `--accent-foreground` → `--text-primary`
- **D-09:** `components.json` style changed from `new-york` to `default`.

### Typography

- **D-10:** Add JetBrains Mono via `next/font/google` alongside existing Inter. CSS variable `--font-mono`. Used for numbers, code, prices, and data values.
- **D-11:** Enable OpenType features on Inter: `cv02`, `cv03`, `cv04`, `cv11`, `ss01`. Apply via `font-feature-settings` in `body`.
- **D-12:** Letter spacing: body `-0.005em`, headings (h1/h2) `-0.022em`, (h3/h4) `-0.015em`.

### Motion Tokens

- **D-13:** Motion duration tokens: `--motion-fast: 100ms`, `--motion-base: 200ms`, `--motion-modal: 300ms`, `--motion-slow: 500ms`.
- **D-14:** Easing tokens: `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)`.

### Radius Scale

- **D-15:** Migrate from rem-based scale to px-based: `--radius-xs: 4px`, `--radius-sm: 6px`, `--radius: 8px`, `--radius-md: 10px`, `--radius-lg: 12px`, `--radius-xl: 16px`, `--radius-2xl: 20px`. Remove old `--radius-sm: 0.375rem`, `--radius-md: 0.5rem`, etc.

### Shadow Tokens

- **D-16:** Add shadow tokens matching Xphere: `--shadow-sm: 0 1px 2px rgba(16,24,40,0.06)`, `--shadow-md: 0 4px 12px rgba(16,24,40,0.08)`, `--shadow-lg: 0 16px 40px rgba(16,24,40,0.10)`, `--shadow-glow: 0 0 24px rgba(64,110,241,0.20)`.
- **D-17:** Remove old `--shadow-glass`, `--glow-brand`, `--glow-success`, `--focus-shadow` tokens.

### Removed Tokens

- **D-18:** Remove all glassmorphism tokens: `--glass-bg`, `--glass-bg-strong`, `--glass-bg-light`, `--glass-border`, `--glass-blur`, `--glass-blur-strong`.
- **D-19:** Remove gradient tokens: `--gradient-brand`, `--gradient-hero`, `--gradient-success`, `--gradient-warning`, `--gradient-danger`, `--gradient-premium`.
- **D-20:** Remove old shimmer/glow tokens no longer needed: `--shimmer-duration`, platform-primary cascade (`--platform-primary`, `--system-primary`, `--system-secondary`).
- **D-21:** Multi-tenant whitelabel color override: simplify to just `--accent` override (remove the full `--system-primary` cascade). The `BrandingStyle` component should inject `--accent: {hex}` directly.

### Dark Mode Philosophy

- **D-22:** Dark mode is primary — it's the default and the "designed" mode. Light mode is a calculated inversion (not a separate palette). Theme provider default stays `system` but dark looks better and is the launched state.

### Scoped Themes

- **D-23:** Keep `[data-theme="admin-dark"]` and `[data-theme="dark-auth"]` scoped overrides for `/admin/*` and auth routes. Update their values to the new token system.
- **D-24:** Keep `[data-theme="light"]` forced-light for `/estimate/*` (public estimate view and PDF preview) — estimates must always render in light mode for client readability.

### What Does NOT Change in This Phase

- **D-25:** No JSX/TSX component files are edited. `globals.css`, `components.json`, `app/layout.tsx` (fonts) only.
- **D-26:** Existing component files will have broken references to removed tokens (e.g., `glass-bg`, `gradient-brand`). These are intentionally deferred to Phase 80 (shell) and Phase 81 (components). TypeScript/build errors from CSS class mismatches are expected and acceptable until those phases complete. Goal: `tsc --noEmit` passes; CSS visual glitches are acceptable.

### Claude's Discretion

- Exact hex values for `--accent-hover` and `--accent-muted` for Xtimator blue — derive from `#406EF1` following the same pattern Xphere uses for indigo (darken ~10% for hover, rgba 8% opacity for muted, rgba 18% opacity for glow).
- Ordering and comment structure inside `globals.css` — follow Xphere's "Operator Design System" style header and section comments.
- Whether to keep the existing animation utilities (`.shimmer`, `.animate-fade-in`, `.pulse-dot`) — keep them but update variable references. Equivalent utilities exist in Xphere so they belong in the shared language.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of Truth: Xphere Design System

- `C:\Users\Vanildo\Dev\xphere\src\app\globals.css` — Xphere v2.1 complete token system. This is the canonical reference. Copy token values from here, substituting #406EF1 for #6366F1 wherever accent is referenced.

### Current Xtimator Files to Replace

- `app/globals.css` — current HSL-based token file (full rewrite)
- `components.json` — change `style: "new-york"` to `style: "default"`
- `app/layout.tsx` — add JetBrains Mono font import

### Supporting Files

- `lib/system-colors.ts` — may reference `--system-primary`; update to `--accent` direct reference
- `lib/color.ts` — color utilities; check for hardcoded `#406EF1` references (keep them, they're already correct)

### No External Specs

Token decisions are fully captured in the decisions above and the Xphere globals.css reference.

</canonical_refs>

<code_context>
## Existing Code Insights

### Current Token State (what's being replaced)
- `app/globals.css` uses HSL shadcn tokens: `--background: 0 0% 100%`, `--primary: 224 86% 60%`, etc.
- No `--bg-primary` / `--bg-secondary` hierarchy exists today
- `--glass-bg`, `--glass-border`, `--gradient-brand` are actively used in sidebar and topbar (they'll break visually in Phase 79 and be fixed in Phase 80)
- `--system-primary` and `--platform-primary` cascade exists for multi-tenant branding

### Font Setup
- `app/layout.tsx` line ~7: `import { Inter } from "next/font/google"` — add JetBrains Mono here
- CSS variable `--font-inter` already set — add `--font-mono` alongside it

### Shadcn Impact
- `components.json` style `new-york` affects button border-radius, input padding, card styling
- Changing to `default` will subtly alter all shadcn-generated components — this is intentional and the visual delta is corrected in Phase 81

### Multi-tenant Branding
- `lib/system-colors.ts` — exports `SYSTEM_PRIMARY_HSL`, feeds into `--system-primary`
- `components/app-shell/branding-style.tsx` — injects `--platform-primary` override per org
- After migration: branding injects `--accent: #hexcolor` directly, not via HSL cascade

### Integration Points
- Phases 80-82 consume the tokens defined here
- `lib/utils.ts` `cn()` function — no changes needed
- All component files using `glass-bg`, `glass-border`, `gradient-brand` classes will have CSS warnings until Phase 80/81 clean them up

</code_context>

<specifics>
## Specific Ideas

### Token Value Reference (Xphere v2.1 → Xtimator adaptation)

**Dark mode surfaces:**
- `--bg-primary: #0A0A0B`
- `--bg-secondary: #111113`
- `--bg-tertiary: #1A1A1D`
- `--bg-elevated: #222226`

**Dark mode borders:**
- `--border-subtle: #1E1E22`
- `--border: #2A2A2F`
- `--border-strong: #3A3A40`

**Dark mode text:**
- `--text-primary: #FAFAFA`
- `--text-secondary: #A1A1AA`
- `--text-tertiary: #71717A`

**Light mode surfaces:**
- `--bg-primary: #FCFCFD`
- `--bg-secondary: #FFFFFF`
- `--bg-tertiary: #F4F4F5`
- `--bg-elevated: #FFFFFF`

**Light mode borders:**
- `--border-subtle: #ECECEF`
- `--border: #E4E4E7`
- `--border-strong: #D4D4D8`

**Light mode text:**
- `--text-primary: #18181B`
- `--text-secondary: #52525B`
- `--text-tertiary: #A1A1AA`

**Accent (Xtimator blue — NOT Xphere indigo):**
- `--accent: #406EF1`
- `--accent-hover: #2F5DE0` (darken ~10%)
- `--accent-muted: rgba(64, 110, 241, 0.08)`
- `--accent-glow: rgba(64, 110, 241, 0.18)`

**Semantic colors (both modes):**
- Success light: `#16A34A` / dark: `#22C55E`
- Warning light: `#D97706` / dark: `#F59E0B`
- Danger light: `#DC2626` / dark: `#EF4444`
- Info light: `#2563EB` / dark: `#3B82F6`

</specifics>

<deferred>
## Deferred Ideas

- **Omnichannel brand colors** (WhatsApp #25D366, Instagram #E1306C, etc.) — Xphere has these but Xtimator doesn't need them yet. Can be added as a future addendum.
- **Viewport theme-color meta tag** — Xphere sets `#0A0A0B` for dark and `#FCFCFD` for light. Currently Xtimator uses `#0a0a0f`. Update in Phase 80 alongside the shell work as it's tied to the topbar color.
- **Marketing landing page token alignment** — The `/` landing page and auth pages have their own scoped themes. Those will naturally benefit from Phase 79 but any landing-page-specific tuning is deferred.
- **PWA manifest theme_color** — Should match `--bg-primary`. Update alongside Phase 80.

</deferred>

---

*Phase: 79-design-token-foundation*
*Context gathered: 2026-05-22*
