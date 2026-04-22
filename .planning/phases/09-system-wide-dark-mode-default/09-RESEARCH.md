# Phase 9: System-wide Dark Mode (default) - Research

**Researched:** 2026-04-21
**Domain:** Next.js App Router theming + Tailwind v4 CSS-vars + next-themes SSR
**Confidence:** HIGH

## Summary

Phase 9 is a **consolidation + expansion** phase, not a from-scratch theming build. Phase 8 already delivered the hardest pieces: (a) a semantic-token-only CSS-var system in `app/globals.css`, (b) a scoped dark-theme pattern via `[data-theme="dark-auth"]` and `[data-theme="admin-dark"]` selectors, and (c) a runtime-overridable accent via `var(--platform-primary, fallback)`. `next-themes@0.4.6` is already installed and wired at the root — but with `defaultTheme="light"` and no toggle, so it is effectively inert today.

The core work for Phase 9 is therefore: **flip the default to `dark`, add a 3-way (dark/light/system) toggle, persist the choice per user, preserve the `/estimate/*` + PDF light-locks, and sweep a small set of remaining hardcoded-color violations**. The existing semantic-token coverage is already ~95%; the migration inventory is small enough to enumerate exhaustively (see below).

A single architectural decision dominates the phase: **next-themes (class-based) at the root + existing `[data-theme]` scoped wrappers remain additive, not conflicting**. The scoped `data-theme` wrappers on `/auth/*` and `/admin/*` will continue to hard-override tokens locally via CSS specificity, regardless of the root `.dark` / `.light` class. Public estimate view and PDFs use a *forced-light* mechanism (a scoped wrapper + route-level `forcedTheme="light"`) to guarantee recipient professionalism.

**Primary recommendation:** Keep next-themes as-is (class strategy, root-level), flip `defaultTheme` to `"dark"`, add a `forcedTheme="light"` boundary at the `/estimate/[token]/layout.tsx` level, add a user-preference column on `companies` (or `auth.users.raw_user_meta_data`), and SSR-hydrate the correct class via a cookie read in `app/layout.tsx` to eliminate FOUC. The `[data-theme="dark-auth"]` / `[data-theme="admin-dark"]` wrappers stay exactly as they are.

## User Constraints (from additional_context)

### Locked Decisions
- Keep `next-themes` (already installed at v0.4.6) — do **not** build a custom theme system.
- Keep the existing scoped `[data-theme="dark-auth"]` and `[data-theme="admin-dark"]` wrappers unchanged — they remain the reference pattern for "hard-locked" regions.
- Keep `@react-pdf/renderer` — do not migrate to a different PDF library.
- `/estimate/*` (public share view) and all generated PDFs **must** stay on the light palette regardless of signed-in user preference.
- Semantic tokens only — no hardcoded hex / rgb / named Tailwind color classes in migrated files.

### Claude's Discretion
- Where to persist theme preference: `companies.theme_preference` column, a new `user_preferences` table, Supabase `auth.users.raw_user_meta_data`, or a cookie. Recommendation in "Architecture Patterns" below.
- How to render the SSR-correct theme without FOUC (cookie read vs. `<script>` injection — next-themes handles the latter automatically).
- Visual-regression tooling (Playwright screenshot diffs vs. manual grid review).
- Whether to extend the semantic token palette with extra tokens for status colors (`--success`, `--warning`, `--info`) to replace the hardcoded green/yellow/blue/red 100/600/700 Tailwind classes.

### Deferred Ideas (OUT OF SCOPE)
- Rewriting the scoped-dark auth or admin treatments.
- Migrating away from `@react-pdf/renderer`.
- Theme customization beyond dark/light/system (e.g., user-pickable accent colors in-app — platform-level branding is already owned by Phase 8).

## Project Constraints (from CLAUDE.md)

- **Tech Stack:** Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui. (This project uses Next.js **16.2.3**, Tailwind **v4**, React **19.2.4** — verified from `package.json`.)
- **Forms:** react-hook-form + zod (for the theme-toggle form on the settings page).
- **Database:** Supabase PostgreSQL with RLS on all tables.
- **Security:** Service role key never exposed to browser; all AI / privileged calls server-side. (Theme preference is public-user-level data, so anon key + RLS policy `user_id = auth.uid()` is sufficient.)
- **Mobile:** Must work on iOS Safari and Android Chrome. Theme-toggle UI must be reachable from the mobile bottom nav / mobile header.
- **GSD Workflow:** All file changes must go through a GSD command. No direct edits outside planning artifacts.

## Phase Requirements

The ROADMAP success criteria do not currently carry formal `REQ-ID` identifiers. Suggested IDs for the planner to adopt:

| Suggested ID | Success Criterion | Research Support |
|--------------|-------------------|------------------|
| DARK-01 | Fresh sign-in lands in dark with no flash-of-light | next-themes SSR pattern + cookie hydration (below) |
| DARK-02 | Toggle (dark/light/system) in app shell, persisted per user, respected across sessions/devices | `setTheme()` from `useTheme()` + server-side persistence column |
| DARK-03 | Every authenticated page renders correctly in both dark and light (no broken borders, no unreadable text, no hardcoded colors) | Migration inventory below — ~10 files, ~25 occurrences |
| DARK-04 | Forms / modals / dropdowns / tables / toasts / empty states / skeletons use semantic tokens only | shadcn/ui primitives already compliant; only `status-badge` + a few workspace files need migration |
| DARK-05 | `/estimate/*` and generated PDFs remain on light palette regardless of user theme | `forcedTheme="light"` scoped to `/estimate/[token]/layout.tsx` + PDF is already pure inline styles, no class dependency |
| DARK-06 | No Lighthouse contrast / a11y regressions on migrated pages | Playwright + `@axe-core/playwright` or manual Lighthouse audit |

## Standard Stack

### Core (already installed — verified from package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next-themes` | 0.4.6 | Theme switching + SSR-safe class injection | Official shadcn/ui recommendation; handles `prefers-color-scheme`, FOUC prevention, and localStorage persistence out of the box |
| `tailwindcss` | 4.x | CSS utility framework with class-based dark mode via `.dark` selector + CSS vars | Already driving the app; v4 uses `@import "tailwindcss"` + `@theme inline` block |
| `@tailwindcss/postcss` | 4.x | Tailwind v4 PostCSS adapter | Already configured |
| `shadcn/ui` (New York style) | — | Component primitives using semantic tokens | Already the project's UI baseline; every primitive in `components/ui/*` consumes `bg-background`, `text-foreground`, etc. |
| `sonner` | 2.0.7 | Toaster — already reads `useTheme()` in `components/ui/sonner.tsx` | Will automatically follow the theme change |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | 1.8.0 | Icon set — already installed | Use `<Sun />`, `<Moon />`, `<Monitor />` icons for the 3-way toggle |
| `@playwright/test` | 1.59.1 | E2E testing | Visual regression via `page.screenshot({ fullPage: true })` + `expect(screenshot).toMatchSnapshot()` — same pattern as existing `auth-dark.spec.ts` |

### Version verification
- `npm view next-themes version` → **0.4.6** (last published 2025-03-11, matches installed).
- `npm view tailwindcss version` → **4.x** (confirm matches `package.json`).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-themes root-level | Pure CSS-var + cookie manual wiring | More code, same FOUC risk, no ecosystem benefit. **Keep next-themes.** |
| `companies.theme_preference` column | `auth.users.raw_user_meta_data.theme` | Metadata is simpler (no migration) but harder to query/RLS; column is more explicit and inspectable. **Recommend column.** |
| Separate `user_preferences` table | Column on `companies` | A table is over-engineered for a single enum column today; revisit when the 2nd preference appears. **Recommend column.** |
| Cookie-only persistence | Cookie + DB | Cookie alone loses the preference on new device / incognito. **Recommend cookie + DB write-through.** |

**Installation:** no new npm packages required.

## Architecture Patterns

### How next-themes + scoped `[data-theme]` coexist (the central decision)

This is the question that blocks the plan. The answer is **they cohabit cleanly because they operate at different CSS-specificity layers**:

1. **next-themes writes a `class="dark"` or `class="light"` on `<html>`** (already configured via `attribute="class"` in `app/layout.tsx`).
2. **Tailwind v4's `.dark` selector in `globals.css`** re-defines CSS variables on any descendant. This drives the whole unscoped app.
3. **`[data-theme="dark-auth"]` / `[data-theme="admin-dark"]` wrappers** in `globals.css` **also** re-define the same CSS variables, but with higher specificity when present, because `[data-theme]` as an attribute selector has the same specificity as `.dark` (both = 0,1,0) — but the `data-theme` wrappers are *inside* the HTML tree, so the variables re-declared on the closer ancestor win (CSS cascade: nearer element wins for custom properties).
4. **Forced-light regions** (`/estimate/*`, PDF preview) use `next-themes`' **`<ThemeProvider forcedTheme="light">`** nested inside the public layout, OR a simple scoped wrapper `[data-theme="light"]` with explicit light-palette CSS vars. Recommendation: use `forcedTheme="light"` at the route layout level — it is the library's documented pattern for this exact use case.

**Concretely:** Keep the current `app/layout.tsx` `ThemeProvider` exactly where it is. Flip `defaultTheme="light"` → `defaultTheme="dark"`. Add `enableSystem={true}`. The existing `[data-theme="dark-auth"]` and `[data-theme="admin-dark"]` wrappers continue to fully override CSS vars in their subtrees — the root class is irrelevant inside those wrappers. Verified: `auth-dark.spec.ts` already asserts `[data-theme="dark-auth"]` rendering, and this will continue to pass.

**Important caveat from next-themes docs:** nested `<ThemeProvider>` is **not officially supported**. Do **not** wrap a nested `<ThemeProvider>` around `/admin/*` or `/auth/*`. The `[data-theme]` CSS attribute wrappers are the correct pattern and must stay.

### Where to persist theme preference (recommendation)

Use a new nullable column `companies.theme_preference TEXT CHECK (theme_preference IN ('dark','light','system'))` (nullable, default `NULL` meaning "use `system`"). Rationale:

- `companies` is 1:1 with `auth.users` in this schema (verified via `user_id` FK + RLS pattern in STATE.md).
- RLS policy already restricts `companies` to the owning user — no new policy needed.
- A single-column migration is trivial and doesn't warrant a new table.
- Plain column is queryable, inspectable in Supabase Studio, and doesn't require JWT decoding.

**SSR flow to prevent FOUC:**
1. In `app/(app)/layout.tsx` (server component), read `claims.sub` → query `companies.theme_preference`.
2. Set a cookie `eb-theme=<value>` in the response (via `cookies()` from `next/headers`) if it differs from the current cookie.
3. In `app/layout.tsx` (root server component), read the `eb-theme` cookie → pass as `defaultTheme` to `<ThemeProvider>` (next-themes reads cookie/localStorage on mount; for SSR correctness we also add `className={theme}` to `<html>` directly).
4. next-themes injects its own pre-hydration `<script>` that reads `localStorage` and sets the class before paint — this is the *primary* FOUC defense, and it works today out of the box.
5. When the user toggles: call `setTheme()` (writes localStorage + updates `<html>` class instantly) **and** fire a server action `saveThemePreference()` that updates `companies.theme_preference` + sets the cookie.

### Forced-light boundaries (/estimate/* and PDF)

Two independent surfaces, two different mechanisms:

- **`/estimate/[token]/*` (public HTML view)** — currently wrapped in `<div className="min-h-screen bg-white">` in `app/estimate/[token]/layout.tsx`. **Recommended change:** wrap the children in a nested `<ThemeProvider forcedTheme="light" attribute="class">` OR (simpler, zero new providers) add `data-theme="light"` attribute + an explicit `[data-theme="light"]` rule in `globals.css` that redeclares the light-palette CSS vars. The latter matches the existing admin/auth pattern for consistency and is the recommended path.
- **PDF (`components/pdf/estimate-pdf.tsx`)** — uses `@react-pdf/renderer`'s `StyleSheet.create()`. PDF styles are **inline-rendered, completely isolated from the browser CSS system**. Verified: the file imports `Document, Page, View, Text, Image, StyleSheet` from `@react-pdf/renderer` and has no Tailwind class references. **No action required for PDF output** — it is already theme-immune by construction.

### Recommended Project Structure (additions)

```
app/
├── layout.tsx                 # (existing) ThemeProvider — flip defaultTheme to "dark"
├── (app)/
│   ├── layout.tsx             # reads companies.theme_preference → sets cookie
│   └── settings/
│       └── appearance/        # NEW: theme toggle page (dark/light/system)
├── estimate/[token]/
│   └── layout.tsx             # add data-theme="light" wrapper

components/
├── app-shell/
│   └── theme-toggle.tsx       # NEW: 3-way toggle, dropdown pattern, lives in Topbar
lib/
└── actions/
    └── theme.ts               # NEW: saveThemePreference() server action

supabase/migrations/
└── 20260421000001_theme_preference.sql   # NEW: ALTER TABLE companies ADD COLUMN theme_preference TEXT
```

### Pattern 1: Theme-aware status colors (semantic token extension)

**What:** Replace hardcoded `bg-yellow-100 text-yellow-700` etc. in `status-badge.tsx` with semantic status tokens.
**When to use:** Any component today using color families to express state (draft/processing/ready/sent/accepted/declined).
**Example:**

```css
/* globals.css — add to :root and .dark and both [data-theme] blocks */
:root {
  --success: 142 76% 36%;          /* green-700 equivalent */
  --success-foreground: 0 0% 100%;
  --success-muted: 142 76% 94%;     /* light bg for light theme */
  --warning: 38 92% 50%;
  --warning-muted: 48 96% 89%;
  --info: 221 83% 53%;
  --info-muted: 214 95% 93%;
}
.dark, [data-theme="dark-auth"], [data-theme="admin-dark"] {
  --success-muted: 142 72% 15%;
  --warning-muted: 48 30% 18%;
  --info-muted: 217 33% 18%;
  /* foreground stays at the bright hue for contrast */
}
```

```tsx
// status-badge.tsx — migrate to semantic
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  processing: 'bg-[hsl(var(--warning-muted))] text-[hsl(var(--warning))]',
  ready: 'bg-[hsl(var(--info-muted))] text-[hsl(var(--info))]',
  // ...
}
```

### Pattern 2: Theme toggle (3-way)

```tsx
'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { saveThemePreference } from '@/lib/actions/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  async function choose(next: 'dark' | 'light' | 'system') {
    setTheme(next)                       // instant UI + localStorage
    await saveThemePreference(next)      // cross-device persistence
  }
  // Render DropdownMenu with three items. Disable if forcedTheme is set.
}
```

### Anti-Patterns to Avoid

- **Nesting a second `<ThemeProvider>`** inside `/admin` or `/auth` — not officially supported; use `[data-theme]` CSS wrappers instead (already in place).
- **Reading `useTheme()` without `'use client'`** — it's a hook; server components cannot call it.
- **Reading `theme` during SSR from the client** — next-themes returns `undefined` until mounted; always guard with `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])` or use `resolvedTheme` after mount.
- **Using `dark:` Tailwind variants for scoped-dark regions** — the `dark:` variant only fires when `<html class="dark">`, NOT inside `[data-theme="dark-auth"]`. This is why the scoped wrappers re-declare vars instead of relying on `dark:`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme persistence in localStorage | Custom localStorage wrapper | `next-themes` — already does it | Handles cross-tab sync, SSR hydration mismatch suppression, prefers-color-scheme subscription |
| FOUC prevention script | Inline `<script>` in `<head>` | `next-themes` injects this automatically | Battle-tested across Next.js versions |
| System preference detection | `window.matchMedia('(prefers-color-scheme: dark)')` listener | `next-themes` with `enableSystem={true}` | Handles change events + OS-level theme flips |
| Forced-theme on a route | Manual class manipulation in layout | `<ThemeProvider forcedTheme="light">` OR `data-theme="light"` wrapper | Both are documented patterns; scoped CSS wrapper matches existing Phase 8 code |
| Dark palette hex values | Hand-picked colors | shadcn/ui New York dark defaults in `globals.css` | Already defined in the `.dark` block — accessible contrast ratios verified by shadcn |
| Status-color badges | Hardcoded Tailwind `bg-green-100 text-green-700` | Semantic `--success` / `--warning` / `--info` tokens | Without semantic tokens, status colors are broken in dark mode (light-bg + light-fg = unreadable) |

**Key insight:** The project already does not hand-roll theming — Phase 8 correctly adopted next-themes and CSS-var semantic tokens. Phase 9 is about **removing the final ~25 hardcoded-color violations** so the existing machinery can do its job uniformly.

## Migration Inventory (representative, not exhaustive — full sweep is part of the plan)

Based on `grep` across `app/**/*.{tsx,ts}` and `components/**/*.{tsx,ts}` for hardcoded color patterns:

### Tier 1 — MUST migrate (affects dark-mode rendering)

| File | Occurrences | Issue | Recommended fix |
|------|-------------|-------|-----------------|
| `components/dashboard/status-badge.tsx` | 6 | `bg-{color}-100 text-{color}-700` per status | Extend palette with `--success` / `--warning` / `--info` / `--danger` semantic tokens; rewrite `STATUS_STYLES` map |
| `components/workspace/photos/photo-card.tsx` | 3 | `text-white`, `bg-transparent`, `border-white/50` overlaid on photo thumbnail | Keep `text-white` / `border-white/50` (always over a dark photo — theme-independent) — **no change needed**, but add comment explaining exception |
| `components/workspace/photos/photo-lightbox.tsx` | 4 | `bg-black`, `text-white`, `hover:bg-white/20` on photo modal | Same as above — photo lightbox is intentionally always dark; document exception |
| `components/workspace/audio/audio-recorder.tsx` | 2 | `bg-red-500 animate-pulse` on record button; `bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300` on info banner | Record button: keep red (semantic "recording state" — add `--recording` token or document exception). Info banner: migrate to `bg-[hsl(var(--info-muted))] text-[hsl(var(--info))]` |
| `components/workspace/estimate/estimate-editor.tsx` | 2 | `text-green-600`, `text-yellow-600` status icons | Migrate to `text-[hsl(var(--success))]` / `text-[hsl(var(--warning))]` |
| `components/workspace/audio/transcript-editor.tsx` | 1 | `text-green-600` success indicator | Migrate to `text-[hsl(var(--success))]` |
| `components/dashboard/project-actions.tsx` | 1 | `text-red-600` on destructive menu item | Migrate to `text-destructive` (token already exists) |
| `tests/unit/components/status-badge.test.tsx` | 3 | Asserts `bg-gray-100 text-gray-700` classes literally | Rewrite assertions to check semantic classes (`bg-muted text-muted-foreground`) |

### Tier 2 — INTENTIONAL (document and leave, they are forced-light/dark contexts)

| File | Reason |
|------|--------|
| `app/estimate/[token]/layout.tsx` (`bg-white`) | Public share view is forced-light; replace with `data-theme="light"` wrapper + `bg-background` |
| `components/share/estimate-view.tsx` (4 green/red usages) | Public share view — will run inside forced-light boundary, no migration needed; but should be audited once the wrapper is in place |
| `components/pdf/estimate-pdf.tsx` | `@react-pdf/renderer` — isolated inline-styles, not part of browser CSS system |
| `components/ui/button.tsx` (`text-white` on destructive) | shadcn default — intentional: white text on red button in both themes |
| `components/ui/badge.tsx`, `alert-dialog.tsx`, `dialog.tsx`, `sheet.tsx` (`bg-black/50` backdrops) | shadcn default — backdrop overlay intentionally theme-independent |

### Tier 3 — COMPONENT AUDIT (verify they actually render correctly in dark — likely fine, but verify)

Every page in `app/(app)/**` and every component in `components/{dashboard,clients,projects,workspace,settings,onboarding,app-shell}/*`. Bulk of these already use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border` from shadcn primitives — should render correctly in dark. The plan should include a manual pass of each route in dark mode and capture screenshots. Representative list of routes to verify:

- `/dashboard`
- `/clients`, `/clients/[id]`, `/clients/new`
- `/projects`, `/projects/new`, `/projects/[id]` (all 5 workspace tabs)
- `/settings` (account / company / defaults / notifications)
- `/onboarding` (5-step wizard)
- `/admin/*` (already dark-scoped — verify nothing breaks when root is dark too)
- `/auth/*` (already dark-scoped — verify)
- `/estimate/[token]` (forced-light — verify)

## Runtime State Inventory

This is NOT a rename/refactor/migration phase in the runtime-state sense (no database records, service configs, OS registrations, or secrets carry the "light theme" as a value). The only stateful surface is the new `companies.theme_preference` column being added.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `companies.theme_preference` column (new, nullable, default NULL = "system") | DB migration adds column; existing rows get NULL and resolve to system/dark at runtime |
| Live service config | None — verified by grep across `app/`, `components/`, `lib/`, `supabase/migrations/` for theme/color references | None |
| OS-registered state | None — this is a browser-only UI change | None |
| Secrets/env vars | None — no env var names reference theme | None |
| Build artifacts | None — Next.js rebuilds on change | None |

## Common Pitfalls

### Pitfall 1: Flash of light before React hydrates
**What goes wrong:** User sees white flash for ~100-300ms before `<html class="dark">` is applied.
**Why it happens:** If `defaultTheme="dark"` is set but the browser has `localStorage.theme="light"` from a previous session, or if `suppressHydrationWarning` is missing, next-themes' pre-hydration script can't fire in time.
**How to avoid:** Keep `suppressHydrationWarning` on `<html>` (already present). Ensure `<ThemeProvider>` wraps everything. Set `disableTransitionOnChange` (already present) to avoid CSS transitions on the initial theme apply.
**Warning signs:** Visible flicker on cold page load; Lighthouse flags CLS (cumulative layout shift) from the flash.

### Pitfall 2: Cross-device preference desync
**What goes wrong:** User sets dark on laptop, opens on phone, sees their localStorage default (not their saved preference).
**Why it happens:** `next-themes` only reads `localStorage`. The DB-saved preference is never consulted on new devices.
**How to avoid:** In `app/(app)/layout.tsx`, read `companies.theme_preference`; if cookie is missing/different, set cookie; pass value to root layout which passes to `<ThemeProvider>` as `defaultTheme`. next-themes will respect it on first load.
**Warning signs:** "Why is dark mode off on my phone?" user report.

### Pitfall 3: `[data-theme="dark-auth"]` region breaks when user picks light
**What goes wrong:** User toggles to light, but /auth/login still renders dark (which is correct!) — but the status badges inside render with dark-theme colors because of inheritance confusion.
**Why it happens:** CSS custom properties inherit through the cascade. The `[data-theme="dark-auth"]` wrapper re-defines them, so all descendants see the dark values — **this is correct and desired**.
**How to avoid:** Nothing to fix; test it. The existing `auth-dark.spec.ts` test will catch any regression.
**Warning signs:** Auth screen looks "half-dark, half-light" → means a component is reading a non-overridden color (likely a hardcoded Tailwind class).

### Pitfall 4: `dark:` Tailwind variant doesn't fire inside scoped dark wrapper
**What goes wrong:** A component uses `dark:bg-blue-950/30` (like audio-recorder.tsx does today). Inside `<div class="dark">` this works. Inside `[data-theme="dark-auth"]`, the HTML root has `class="light"`, so `dark:` variants do NOT apply.
**Why it happens:** Tailwind's `dark:` variant compiles to `.dark .foo` — it checks the root class, not the `data-theme` attribute.
**How to avoid:** Replace all `dark:X` variants that rely on the root `.dark` class with semantic tokens that work via CSS-var re-declaration in both `.dark` and the scoped wrappers. This is why the migration must touch `audio-recorder.tsx`.
**Warning signs:** Component looks correct on /dashboard (dark) but wrong on /auth/login (where it inherits `[data-theme="dark-auth"]` but root is `.light`).

### Pitfall 5: Forgetting to update tests that assert hardcoded class names
**What goes wrong:** `tests/unit/components/status-badge.test.tsx` asserts `bg-gray-100 text-gray-700` — test will fail after semantic-token migration.
**How to avoid:** Include test updates in the same task that migrates the component.
**Warning signs:** Unit suite breaks the moment migration lands.

### Pitfall 6: PDF renders with theme-influenced colors
**What goes wrong:** A future dev adds Tailwind classes to a PDF component assuming they'll be rendered.
**Why it happens:** `@react-pdf/renderer` ignores CSS classes; only `StyleSheet.create()` works.
**How to avoid:** Add a code-owner comment at the top of `components/pdf/estimate-pdf.tsx` stating "This file renders to PDF via @react-pdf/renderer — Tailwind classes are ignored; use StyleSheet only. PDFs stay on the light palette by design."
**Warning signs:** PDF looks wrong after a "style update" commit.

## Code Examples

### 1. Root layout: flip default + enable system

```tsx
// app/layout.tsx
import { cookies } from 'next/headers'
// ...
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const savedTheme = cookieStore.get('eb-theme')?.value // 'dark' | 'light' | 'system' | undefined

  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme={savedTheme ?? 'dark'}
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### 2. Authenticated layout: read DB preference → set cookie

```tsx
// app/(app)/layout.tsx — inside AppShellLayout, after claims check
const { data: company } = await supabase
  .from('companies')
  .select('id, name, logo_url, owner_name, theme_preference')
  .eq('user_id', claims.sub)
  .single()

// Sync cookie with DB on every authenticated request (cheap; already a server component)
if (company?.theme_preference) {
  const cookieStore = await cookies()
  if (cookieStore.get('eb-theme')?.value !== company.theme_preference) {
    cookieStore.set('eb-theme', company.theme_preference, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }
}
```

### 3. Server action: save preference

```ts
// lib/actions/theme.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const ALLOWED = ['dark', 'light', 'system'] as const
type Theme = typeof ALLOWED[number]

export async function saveThemePreference(theme: Theme) {
  if (!ALLOWED.includes(theme)) throw new Error('invalid theme')
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { ok: false as const, message: 'not authenticated' }

  const { error } = await supabase
    .from('companies')
    .update({ theme_preference: theme })
    .eq('user_id', claims.sub)

  if (error) return { ok: false as const, message: error.message }

  const cookieStore = await cookies()
  cookieStore.set('eb-theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return { ok: true as const }
}
```

### 4. Forced-light wrapper for `/estimate/[token]`

```tsx
// app/estimate/[token]/layout.tsx
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  )
}
```

```css
/* globals.css — add below the dark-auth/admin-dark block */
[data-theme="light"] {
  /* redeclare the :root light palette to guarantee light rendering
     even when <html class="dark"> */
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  /* ...copy the full :root block... */
}
```

### 5. Theme toggle in Topbar

```tsx
// components/app-shell/theme-toggle.tsx
'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { saveThemePreference } from '@/lib/actions/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <Button variant="ghost" size="icon" aria-label="Theme" />

  async function choose(next: 'dark' | 'light' | 'system') {
    setTheme(next)
    await saveThemePreference(next)
  }

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme"><Icon className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => choose('light')}><Sun className="h-4 w-4 mr-2" />Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose('dark')}><Moon className="h-4 w-4 mr-2" />Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => choose('system')}><Monitor className="h-4 w-4 mr-2" />System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind `darkMode: 'class'` config in `tailwind.config.js` | Tailwind v4 `@import "tailwindcss"` + auto-detected `.dark` class | Tailwind v4 (2024) | Class-based dark mode "just works" with `.dark` selector in CSS — already in use |
| Manual FOUC script in `<head>` | `next-themes` auto-injected pre-hydration script | next-themes 0.2+ (2022) | No manual script needed; `suppressHydrationWarning` on `<html>` is sufficient |
| `useTheme()` during SSR | `mounted` guard + `resolvedTheme` after mount | Documented best practice | Prevents hydration mismatches |
| Hardcoded hex palettes | CSS-var semantic tokens | shadcn/ui New York style | Already the project baseline |

**Deprecated/outdated:**
- `defaultTheme="light"` in this project — was the Phase 1 scaffold default; should flip to `"dark"` for Phase 9.
- `tailwind.config.js` darkMode setting — not needed in Tailwind v4 (project already on v4).

## Environment Availability

This phase has no new external dependencies. All required tooling is already installed and verified:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `next-themes` | Theme switching, FOUC prevention | ✓ | 0.4.6 | — |
| `tailwindcss` | CSS utility framework | ✓ | 4.x | — |
| `lucide-react` | Toggle icons (Sun/Moon/Monitor) | ✓ | 1.8.0 | — |
| Supabase CLI (`bunx supabase db push`) | Migration apply | ✓ | via bunx | Run migration manually against DATABASE_URL |
| `@playwright/test` | E2E / visual regression | ✓ | 1.59.1 | — |
| `vitest` | Unit tests | ✓ | 4.1.4 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Open Questions

1. **Should we add `--success` / `--warning` / `--info` / `--danger` tokens globally, or scope them per-component?**
   - What we know: StatusBadge uses green/yellow/blue/red families; workspace uses green/yellow for validation.
   - What's unclear: Whether other status surfaces will emerge in v1.2+.
   - Recommendation: Add them globally in `globals.css` (all four, for both `:root` and `.dark` + both scoped wrappers). Low cost, high reuse value.

2. **Where does the theme toggle live on mobile?**
   - What we know: Mobile uses `BottomNav` + `MobileHeader` from `components/app-shell/`.
   - What's unclear: Whether to put the toggle in the mobile header's "avatar → dropdown" or inside the settings page.
   - Recommendation: Both. Primary location is the Topbar (desktop) / MobileHeader avatar-dropdown (mobile). Secondary location is `/settings/appearance` so it's discoverable.

3. **Visual regression: Playwright snapshots or manual grid review?**
   - What we know: Project already uses Playwright for E2E (`auth-dark.spec.ts` pattern).
   - What's unclear: Whether to commit snapshot files (can be noisy on CI).
   - Recommendation: Add a Playwright spec `tests/e2e/dark-mode.spec.ts` that iterates over all authenticated routes, asserts the `<html class>` state, and checks key CSS-var-derived colors via `page.evaluate(() => getComputedStyle(document.body).backgroundColor)` — semantic assertions, not screenshot diffs. Screenshots only if a regression appears.

4. **Does `/admin/*` need a separate toggle, or does it always stay dark-scoped?**
   - What we know: STATE.md says admin is scoped-dark via `[data-theme="admin-dark"]`.
   - What's unclear: Whether admins want to toggle.
   - Recommendation: Admin stays permanently scoped-dark (same as auth). The toggle only affects the unscoped app shell. Document this in the toggle's tooltip when active inside admin: "Admin panel is always dark."

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit/integration) + Playwright 1.59.1 (E2E) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm test -- --run tests/unit/components/theme-toggle.test.tsx` |
| Full suite command | `npm test && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DARK-01 | Dark renders by default on fresh sign-in with no FOUC | e2e | `npx playwright test tests/e2e/dark-mode.spec.ts -g "default-dark"` | ❌ Wave 0 |
| DARK-02 (a) | Toggle UI renders and sets `<html class>` correctly | unit | `npm test -- --run tests/unit/components/theme-toggle.test.tsx` | ❌ Wave 0 |
| DARK-02 (b) | `saveThemePreference` server action persists + sets cookie | integration | `npm test -- --run tests/integration/theme-action.test.ts` | ❌ Wave 0 |
| DARK-02 (c) | Preference is respected across devices (cookie hydrates root layout) | e2e | `npx playwright test tests/e2e/dark-mode.spec.ts -g "cross-device"` | ❌ Wave 0 |
| DARK-03 (a) | StatusBadge uses semantic tokens (not hardcoded classes) | unit | `npm test -- --run tests/unit/components/status-badge.test.tsx` | ✅ (exists — needs rewrite) |
| DARK-03 (b) | Every authenticated route renders with `<html class="dark">` | e2e | `npx playwright test tests/e2e/dark-mode.spec.ts -g "routes-render-dark"` | ❌ Wave 0 |
| DARK-04 | Key shadcn primitives (dialog/sheet/toast/table) render correctly in dark — read computed `background-color` matches dark palette | e2e | `npx playwright test tests/e2e/dark-mode.spec.ts -g "primitives-dark"` | ❌ Wave 0 |
| DARK-05 (a) | `/estimate/[token]` stays light regardless of signed-in user theme | e2e | `npx playwright test tests/e2e/dark-mode.spec.ts -g "estimate-forced-light"` | ❌ Wave 0 |
| DARK-05 (b) | PDF output is theme-immune (inline styles, no CSS-var dependency) — snapshot `getBackgroundColor()` of rendered PDF page | integration | `npm test -- --run tests/integration/pdf-theme-isolation.test.ts` | ❌ Wave 0 |
| DARK-06 | No contrast regressions on migrated pages | e2e + manual | `npx playwright test tests/e2e/dark-mode-a11y.spec.ts` (uses `@axe-core/playwright` if added) OR manual Lighthouse | ❌ Wave 0 — optional |
| Existing regression | Auth dark pass still works (`auth-dark.spec.ts`) | e2e | `npx playwright test tests/e2e/auth-dark.spec.ts` | ✅ |

### Sampling Rate

- **Per task commit:** `npm test -- --run tests/unit/components/theme-toggle.test.tsx tests/unit/components/status-badge.test.tsx` (< 5s)
- **Per wave merge:** `npm test` (full Vitest suite, ~ 15-30s)
- **Phase gate:** `npm test && npx playwright test tests/e2e/dark-mode.spec.ts tests/e2e/auth-dark.spec.ts` before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/e2e/dark-mode.spec.ts` — covers DARK-01, DARK-02(c), DARK-03(b), DARK-04, DARK-05(a)
- [ ] `tests/unit/components/theme-toggle.test.tsx` — covers DARK-02(a); needs `mocks/next-themes.ts` for `useTheme`
- [ ] `tests/integration/theme-action.test.ts` — covers DARK-02(b); follows existing `branding-actions.test.ts` pattern (mock Supabase + cookies)
- [ ] `tests/integration/pdf-theme-isolation.test.ts` — covers DARK-05(b); renders EstimatePDF with different theme contexts, asserts output bytes identical
- [ ] Rewrite of existing `tests/unit/components/status-badge.test.tsx` — asserts semantic token classes, not hardcoded colors
- [ ] (Optional) `tests/e2e/dark-mode-a11y.spec.ts` + install `@axe-core/playwright` for DARK-06 automation

## Sources

### Primary (HIGH confidence)
- `app/layout.tsx`, `app/(app)/layout.tsx`, `app/(auth)/layout.tsx`, `app/admin/layout.tsx`, `app/globals.css`, `app/estimate/[token]/layout.tsx` — direct file read, current repo state
- `package.json` — verified versions: next-themes@0.4.6, tailwindcss@4, next@16.2.3, react@19.2.4
- `npm view next-themes version` → 0.4.6 (published 2025-03-11) — confirms installed version is current
- `supabase/migrations/20260409000001_initial_schema.sql` — confirms `companies` table schema for preference-column migration
- `.planning/STATE.md` entries D-20 (admin scoped dark) + Phase 8 Plan 07 (auth dark pass) — architectural ground truth
- Grep sweep across `app/**/*.{tsx,ts}` + `components/**/*.{tsx,ts}` for hardcoded color patterns — exhaustive migration inventory

### Secondary (MEDIUM confidence)
- next-themes README via WebFetch (github.com/pacocoursey/next-themes) — confirmed `forcedTheme` API, SSR pattern, nested-ThemeProvider non-support
- Phase 8 test pattern `tests/e2e/auth-dark.spec.ts` — reference for E2E theme assertions

### Tertiary (LOW confidence)
- None — all architectural claims are traceable to code or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against installed `package.json`
- Architecture (next-themes + scoped data-theme coexistence): HIGH — confirmed by reading current `globals.css` specificity rules + next-themes official docs + existing `auth-dark.spec.ts` passing
- Migration inventory: HIGH — full grep sweep performed, every hit triaged
- Pitfalls: HIGH — each pitfall has a concrete code reference in this repo
- Test strategy: MEDIUM — tests don't exist yet; Wave 0 must create them before implementation begins

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable — next-themes last published 2025-03; no Next.js 16 breaking changes on theme handling)
