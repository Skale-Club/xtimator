# Phase 10: Global Brand Tokens - Research

**Researched:** 2026-04-22
**Domain:** CSS custom properties / Tailwind v4 / shadcn/ui token system
**Confidence:** HIGH

## Summary

Phase 10 is a pure CSS token surgery — no component rewrites, no new dependencies, no DB
changes. The goal is to replace the default neutral primary (`240 5.9% 10%` / `0 0% 98%`
inherited from shadcn/ui's neutral palette) with the brand blue `#406EF1` (HSL `224 86% 60%`)
across every theme scope in `app/globals.css`, plus two layout fallback strings in
`app/(auth)/layout.tsx` and `app/admin/layout.tsx`.

The project uses Tailwind v4 with CSS custom properties consumed via `hsl(var(--primary))` and
the shadcn/ui New York style (D-09 locked). There are four independent CSS scopes that control
`--primary`:

1. `:root` — light theme (authenticated app pages)
2. `.dark` — dark theme (authenticated app pages, default)
3. `[data-theme="dark-auth"]` — auth pages scoped dark shell
4. `[data-theme="admin-dark"]` — admin panel scoped dark shell

Scopes 3 and 4 read `--primary` from `var(--platform-primary, <fallback>)`. The inline
`--platform-primary` style is injected by the layout server components from `getBranding()`.
When no admin override is configured, `getBranding().primaryColor` is `null`, so the CSS
fallback value fires — that fallback is currently `220 91% 60%` and must become `224 86% 60%`.

**Primary recommendation:** Change six token values in `app/globals.css` and the fallback
string literal in two layout files. No component touches required.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-01 | All authenticated app pages render with `#406EF1` as global primary color (`--primary` CSS token in `app/globals.css`) | Change `--primary` and `--ring` in `:root` and `.dark` scopes; also fix `--primary-foreground` in `.dark` |
| BRAND-02 | Admin panel uses `#406EF1` as default platform primary (CSS fallback in `--platform-primary` updated from `220 91% 60%` to `224 86% 60%`) | Update fallback in `[data-theme="admin-dark"]` selector in globals.css + `app/admin/layout.tsx` inline style |
| BRAND-03 | Auth pages render primary action buttons in `#406EF1` (fallback in auth layout updated) | Update fallback in `[data-theme="dark-auth"]` selector in globals.css + `app/(auth)/layout.tsx` inline style |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- Tech stack: Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui — no new dependencies for token changes
- shadcn/ui New York style with neutral base color and CSS variables (D-09 locked)
- Scoped dark theme via `[data-theme]` selector + `var(--platform-primary, fallback)` for runtime-overridable accent — does not collide with next-themes (D-20 locked)
- Security: Service role key never exposed to browser — `getBranding()` is already server-only; no changes needed

---

## Standard Stack

No new libraries. This phase touches CSS and two TypeScript layout files only.

### Core (what already exists)

| File | Role | What Changes |
|------|------|--------------|
| `app/globals.css` | Single source of all CSS tokens | 6 token values across 4 scopes |
| `app/(auth)/layout.tsx` | Injects `--platform-primary` for auth shell | Fallback string `'220 91% 60%'` → `'224 86% 60%'` |
| `app/admin/layout.tsx` | Injects `--platform-primary` for admin shell | Fallback string `'220 91% 60%'` → `'224 86% 60%'` |

**Installation:** None required.

---

## Architecture Patterns

### How the Token System Works (verified from codebase)

The project has four CSS scopes, each declaring its own `--primary`:

```
:root            → light theme (app pages when next-themes = light)
.dark            → dark theme (app pages, default per ThemeProvider defaultTheme)
[data-theme="dark-auth"]   → auth layout wrapper (login/signup/reset)
[data-theme="admin-dark"]  → admin layout wrapper (/admin/*)
```

Scopes 1 and 2 set `--primary` directly. Scopes 3 and 4 set it via:
```css
--primary: var(--platform-primary, <fallback>);
```

The `--platform-primary` value is injected as an inline style by the server layout. When
`getBranding().primaryColor` is null, the inline style is absent and the CSS fallback fires.

### Token Value Derivation

`#406EF1` → HSL via the existing `hexToHslTriplet()` utility → `224 86% 60%`

Verified by running the identical algorithm used in `lib/color.ts`:
```
r=0x40/255=0.251, g=0x6E/255=0.431, b=0xF1/255=0.945
max=0.945(b), min=0.251(r)
l=(0.945+0.251)/2=0.598 ≈ 60%
d=0.694, s=0.694/(2-1.196)=0.863 ≈ 86%
h=(0.251-0.431)/0.694+4=3.741, ×60=224°
Result: 224 86% 60%
```

### Foreground Contrast Consideration

The existing `--primary-foreground` values must be reviewed when `--primary` changes from
neutral to chromatic blue:

| Scope | Old --primary | Old --primary-foreground | After change | Action |
|-------|--------------|--------------------------|--------------|--------|
| `:root` (light) | `240 5.9% 10%` (near-black) | `0 0% 98%` (white) | primary = blue | **Keep** — white on `#406EF1` gives contrast 4.36 (acceptable per existing design) |
| `.dark` | `0 0% 98%` (white) | `240 5.9% 10%` (near-black) | primary = blue | **Must change** — dark text on blue button is wrong; change foreground to `0 0% 100%` |
| `[data-theme="dark-auth/admin-dark"]` | `var(--platform-primary, ...)` | `0 0% 100%` | fallback = blue | **Already correct** — white foreground is already set |
| `[data-theme="light"]` | `240 5.9% 10%` | `0 0% 98%` | primary = blue | **Keep** same as `:root` |

### Anti-Patterns to Avoid

- **Touching component files:** BRAND-01–03 are token-only. No Button, Link, or Input component file needs editing. Tailwind's `bg-primary` / `text-primary-foreground` classes consume CSS vars automatically.
- **Hardcoding hex in CSS:** Use the HSL triplet form `224 86% 60%` (no `hsl()` wrapper) — that is the shadcn/ui convention used everywhere in globals.css.
- **Forgetting `--ring`:** The `--ring` token drives focus rings (`ring-primary`, `ring-ring`). It is currently set to the same neutral as `--primary` in `:root` and `.dark` and must be updated alongside `--primary` so focus indicators also show the brand color.
- **Breaking the runtime override path:** The `[data-theme]` scopes must keep `var(--platform-primary, NEW_FALLBACK)` — do not replace this with a hardcoded value or the admin branding override will stop working.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hex-to-HSL conversion | Custom script | `hexToHslTriplet()` in `lib/color.ts` | Already exists, already tested |
| Token propagation | Explicit class overrides on each component | CSS custom property cascade | shadcn/ui tokens already wired to all components |

---

## Exact Change Inventory

Every change required. Nothing else.

### 1. `app/globals.css` — 6 value changes

| Location | Property | Old Value | New Value |
|----------|----------|-----------|-----------|
| `:root` | `--primary` | `240 5.9% 10%` | `224 86% 60%` |
| `:root` | `--ring` | `240 5.9% 10%` | `224 86% 60%` |
| `.dark` | `--primary` | `0 0% 98%` | `224 86% 60%` |
| `.dark` | `--primary-foreground` | `240 5.9% 10%` | `0 0% 100%` |
| `.dark` | `--ring` | `240 4.9% 83.9%` | `224 86% 60%` |
| `[data-theme="admin-dark"], [data-theme="dark-auth"]` | `--primary` fallback | `220 91% 60%` | `224 86% 60%` |
| `[data-theme="admin-dark"], [data-theme="dark-auth"]` | `--ring` fallback | `220 91% 60%` | `224 86% 60%` |
| `[data-theme="light"]` | `--primary` | `240 5.9% 10%` | `224 86% 60%` |
| `[data-theme="light"]` | `--ring` | `240 5.9% 10%` | `224 86% 60%` |

Note: `[data-theme="light"]` is for the `/estimate/*` public share view (forced-light scope). Updating it is consistent but does not affect any Phase 10 success criterion directly. Include for completeness.

### 2. `app/(auth)/layout.tsx` — 1 string change (BRAND-03)

```typescript
// Before
['--platform-primary' as string]: triplet ?? '220 91% 60%',
// After
['--platform-primary' as string]: triplet ?? '224 86% 60%',
```

### 3. `app/admin/layout.tsx` — 1 string change (BRAND-02)

```typescript
// Before
['--platform-primary' as string]: triplet ?? '220 91% 60%',
// After
['--platform-primary' as string]: triplet ?? '224 86% 60%',
```

---

## Common Pitfalls

### Pitfall 1: Wrong HSL values produce a visually different blue
**What goes wrong:** Using `226 85% 60%` (the old fallback hint from BRAND-02 requirement) instead of the derived `224 86% 60%`.
**Why it happens:** The REQUIREMENTS.md describes the change as updating `220 91% 60%` to `226 85% 60%`, but that was a rough approximation. Running `hexToHslTriplet('#406EF1')` produces `224 86% 60%`.
**How to avoid:** Use `224 86% 60%` derived from the actual algorithm. Both values are close enough visually but use the exact computed value for consistency.
**Warning signs:** Button color looks slightly off compared to other uses of `#406EF1` on the page.

### Pitfall 2: Forgetting the `.dark` primary-foreground
**What goes wrong:** In dark mode the primary button shows near-black text on a blue background (dark text = old neutral foreground `240 5.9% 10%`).
**Why it happens:** In the old neutral scheme, `.dark` had `--primary: 0 0% 98%` (white) with `--primary-foreground: 240 5.9% 10%` (dark) for dark-on-light contrast. Swapping primary to blue without changing foreground produces dark text on blue.
**How to avoid:** Change `.dark --primary-foreground` to `0 0% 100%` (pure white).

### Pitfall 3: Breaking the admin runtime override
**What goes wrong:** Replacing `var(--platform-primary, NEW_FALLBACK)` with a hardcoded triplet in the scoped dark selectors breaks the admin branding UI.
**Why it happens:** Misreading the requirement as "always use brand blue" without preserving the runtime override path.
**How to avoid:** Keep the `var(--platform-primary, 224 86% 60%)` pattern intact. Only update the fallback value.

### Pitfall 4: Forgetting `--ring`
**What goes wrong:** Interactive elements (buttons, inputs) show focus rings in the old neutral color, not the brand blue.
**Why it happens:** `--ring` is a separate token even though it was set to the same value as `--primary` in the neutral palette.
**How to avoid:** Update `--ring` alongside `--primary` in every scope.

---

## Code Examples

### Correct scoped dark selector after change
```css
/* Source: app/globals.css — Phase 10 */
[data-theme="admin-dark"],
[data-theme="dark-auth"] {
  /* ... other tokens ... */
  --primary: var(--platform-primary, 224 86% 60%);
  --primary-foreground: 0 0% 100%;
  --ring: var(--platform-primary, 224 86% 60%);
}
```

### Correct layout fallback after change
```typescript
// Source: app/(auth)/layout.tsx and app/admin/layout.tsx — Phase 10
const style = {
  ['--platform-primary' as string]: triplet ?? '224 86% 60%',
} as CSSProperties
```

### Correct dark scope tokens after change
```css
/* Source: app/globals.css .dark — Phase 10 */
.dark {
  --primary: 224 86% 60%;
  --primary-foreground: 0 0% 100%;  /* white on brand blue */
  --ring: 224 86% 60%;
}
```

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure CSS/TypeScript token changes with no CLI tools, external services, or runtimes beyond the existing Next.js dev server).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAND-01 | `globals.css :root --primary` and `.dark --primary` equal `224 86% 60%` | unit (file snapshot) | `npm test -- --reporter=verbose tests/unit/globals-brand-tokens.test.ts` | ❌ Wave 0 |
| BRAND-02 | Admin layout fallback string equals `224 86% 60%` | unit (file snapshot) | same file | ❌ Wave 0 |
| BRAND-03 | Auth layout fallback string equals `224 86% 60%` | unit (file snapshot) | same file | ❌ Wave 0 |

All three requirements are pure static-text assertions — a single unit test file that reads the
target files and asserts the new string values are present (and old strings are absent) covers
all three with no mocking overhead.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/globals-brand-tokens.test.ts` — file-snapshot test covering BRAND-01, BRAND-02, BRAND-03
  - Reads `app/globals.css` and asserts `224 86% 60%` present in `:root`, `.dark`, `[data-theme]` scopes
  - Reads `app/(auth)/layout.tsx` and asserts fallback is `224 86% 60%`
  - Reads `app/admin/layout.tsx` and asserts fallback is `224 86% 60%`
  - Asserts old string `220 91% 60%` is absent from all three files

---

## Sources

### Primary (HIGH confidence)

- Codebase: `app/globals.css` — direct inspection of all four CSS scopes and current token values
- Codebase: `app/(auth)/layout.tsx`, `app/admin/layout.tsx` — direct inspection of fallback strings
- Codebase: `lib/color.ts` + `hexToHslTriplet('#406EF1')` runtime execution — verified HSL triplet `224 86% 60%`
- Codebase: `lib/platform-config.ts` — confirmed `getBranding().primaryColor` is null when no DB row exists, meaning CSS fallback fires
- Project decisions (STATE.md): D-09 (shadcn/ui neutral + CSS vars), D-20 (scoped dark theme via `[data-theme]`), confirmed no component rewrites needed

### Secondary (MEDIUM confidence)

- REQUIREMENTS.md BRAND-02: references `226 85% 60%` as target — overridden by exact computation (`224 86% 60%`). Requirement description is a human approximation; the codebase algorithm is authoritative.

---

## Metadata

**Confidence breakdown:**
- Change inventory: HIGH — derived directly from reading every affected file
- HSL value: HIGH — computed by running the exact `hexToHslTriplet` algorithm the codebase uses
- Foreground adjustment: HIGH — luminance/contrast arithmetic performed, result is unambiguous
- Pitfalls: HIGH — each pitfall identified from direct code inspection, not speculation

**Research date:** 2026-04-22
**Valid until:** Stable indefinitely (token-only CSS phase; no external library dependencies)
