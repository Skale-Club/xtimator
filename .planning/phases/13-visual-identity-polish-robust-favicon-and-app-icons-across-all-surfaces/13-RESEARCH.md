# Phase 13: Visual Identity Polish - Research

**Researched:** 2026-05-01
**Domain:** Next.js 16 App Router metadata icons, manifest wiring, and auth-safe public asset routing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use Next.js App Router metadata conventions as the single source of truth; icon assets live in `app/`, not `public/`, and no manual `<link>` tags go into `app/layout.tsx`.
- **D-02:** Ship `favicon.ico`, `icon.svg`, `icon.png`, `apple-icon.png`, and a web manifest entrypoint in this phase.
- **D-03:** Avoid duplicate icon definitions across `app/` and `public/`.
- **D-04:** Use a simple monogram mark, optimized for 16x16 and 32x32 readability.
- **D-05:** Keep the mark aligned with the existing brand: `#406EF1`, dark-first surfaces, geometric, legible on light browser chrome.
- **D-06:** `icon.svg` must explicitly handle light/dark presentation; raster assets can flatten the same mark.
- **D-07:** Icons stay repo-controlled; do not depend on `getBranding().logoUrl` or runtime logo uploads.
- **D-08:** Verification must cover browser favicon resolution, metadata output, Apple touch icon, Android/manifest exposure, and duplicate-definition avoidance.
- **D-09:** Add automated checks where practical plus a short manual verification checklist.

### Claude's Discretion

- Final monogram geometry so long as it stays unmistakable at favicon sizes
- Whether the manifest is authored as `app/manifest.ts` or a static manifest file
- Exact raster export sizes beyond the minimum required surfaces
- Whether `favicon.ico` is hand-authored or generated from the master artwork

### Deferred Ideas (OUT OF SCOPE)

- Admin-managed dynamic app icons from uploaded branding assets
- Open Graph / social-share image design
- Full PWA expansion (maskable icons, splash screens, offline support, shortcuts)
</user_constraints>

---

<phase_summary>
## Summary

This phase is mostly a framework-convention and routing correctness task, not a new design-system build. Next.js 16 already supports root-level `app/favicon.ico`, `app/icon.*`, `app/apple-icon.*`, and `app/manifest.ts`, and will inject the corresponding head tags automatically. That matches D-01 exactly and removes any need for manual `<link rel="icon">` tags.

The key implementation risk is the auth middleware, not the artwork itself. The current root `proxy.ts` matcher excludes `favicon.ico` and extension-based image files, but it does **not** exclude App Router metadata routes like `/icon`, `/apple-icon`, or `/manifest.webmanifest`. Likewise, `lib/supabase/proxy.ts` only treats `/`, auth routes, and `/estimate/*` as public. If left unchanged, anonymous metadata requests can be redirected to login, which breaks favicon and install surfaces. The plan must therefore ship both canonical assets **and** explicit public-route coverage for those metadata endpoints.

**Primary recommendation:** Keep all icon assets in `app/`, author `app/manifest.ts`, preserve `app/layout.tsx` without manual icon tags, and lock the whole contract with a file-read regression test plus a manual smoke checklist for desktop tabs and mobile install flows.
</phase_summary>

---

## Standard Stack

### Core

| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| Next.js App Router metadata files | 16.2.3 | `favicon.ico`, `icon.*`, `apple-icon.*`, `manifest.ts` | Native framework convention; no custom head wiring |
| TypeScript strict | Project-wide | `app/manifest.ts` typing via `MetadataRoute.Manifest` | Existing project constraint |
| Vitest | 4.1.4 | Regression checks for file presence and routing contract | Existing unit-test stack |

### Supporting

| Existing file | Use |
|---------------|-----|
| `components/auth/auth-card.tsx` | Reuse the compact blue monogram-tile motif for the icon geometry |
| `components/landing/top-nav.tsx` | Confirms the current platform shorthand is an initial-based square mark |
| `lib/platform-config.ts` | Optional manifest `name` / `short_name` source without making icons dynamic |
| `lib/supabase/proxy.ts` + `proxy.ts` | Public-route and matcher updates for metadata endpoints |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| App Router metadata files | `public/` assets + manual head links | Violates D-01/D-03 and recreates duplicate-source drift |
| Static raster-only icon set | SVG + raster fallbacks | Raster-only loses D-06 light/dark adaptability and small-size clarity |
| Runtime logo-based icon generation | `getBranding().logoUrl` or uploaded admin logos | Violates D-07 and adds unnecessary runtime coupling |

---

## Architecture Patterns

### Recommended File Structure

```text
app/
  favicon.ico
  icon.svg
  icon.png
  apple-icon.png
  manifest.ts
lib/supabase/
  proxy.ts
proxy.ts
tests/unit/
  app-icons.test.ts
```

### Pattern 1: Root metadata files own head tags

- `app/favicon.ico` emits `<link rel="icon" href="/favicon.ico" sizes="any" />`
- `app/icon.svg` and `app/icon.png` emit framework-generated `/icon?...` entries
- `app/apple-icon.png` emits a framework-generated `/apple-icon?...` entry
- `app/layout.tsx` should remain free of manual icon links and `icons:` metadata objects

### Pattern 2: Manifest stays in `app/` and references the same icon routes

Use `app/manifest.ts` with `MetadataRoute.Manifest` and a static icon list. Keep the icon imagery repo-controlled, but it is safe for the manifest `name` and `short_name` to come from `getBranding().appName` if desired; that preserves Phase 08 branding behavior without making icon graphics dynamic.

Recommended manifest fields for this phase:

- `start_url: '/'`
- `display: 'standalone'`
- `background_color: '#0a0a0f'`
- `theme_color: '#406EF1'`
- `icons`: include `/favicon.ico`, `/icon`, and `/apple-icon`

### Pattern 3: Metadata routes must bypass auth middleware

Two protections are needed:

1. Update `lib/supabase/proxy.ts` so `isPublicRoute()` returns `true` for `/icon`, `/apple-icon`, and `/manifest.webmanifest`
2. Update `proxy.ts` matcher so those same metadata endpoints bypass middleware entirely

Why both? The matcher is the first line of defense; the public-route helper keeps the contract explicit and regression-testable.

### Pattern 4: Regression test is file-read based, not browser-mocked

Phase 10 established a fast pattern: use `readFileSync`, `existsSync`, and regex assertions to lock source-level contracts without spinning up a browser. That works well here for:

- required file existence
- absence of manual icon tags
- manifest content
- route-publicity contract
- duplicate-asset sweep under `public/`

---

## Common Pitfalls

### Pitfall 1: `/icon` and `/apple-icon` are not covered by the current matcher

The current matcher excludes `favicon.ico` and file extensions like `.svg` and `.png`, but App Router metadata icon routes resolve as `/icon?...` and `/apple-icon?...`. Without matcher and `isPublicRoute()` updates, anonymous requests can be redirected to login.

### Pitfall 2: Adding manual `<link rel="icon">` tags in `app/layout.tsx`

This duplicates framework-generated metadata and directly violates D-01/D-03. The correct approach is file conventions only.

### Pitfall 3: Splitting icons across `app/` and `public/`

Keeping `public/favicon.ico` or `public/icon.png` alongside `app/` metadata assets reintroduces ambiguous ownership. The phase should end with exactly one canonical source: `app/`.

### Pitfall 4: SVG looks fine on dark chrome but disappears on light chrome

D-06 requires explicit light/dark handling. A transparent or low-contrast glyph can vanish in browser UI. Bake contrast rules into `icon.svg` itself.

### Pitfall 5: Manifest exists but install surfaces still miss branded icons

Manifest fields alone are not enough; the icon `src` values must reference public, anonymous-safe routes and match real asset sizes.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run tests/unit/app-icons.test.ts` |
| Full suite command | `npm test` |

### Phase Checks

| Behavior | Test Type | Automated Command | Notes |
|----------|-----------|-------------------|-------|
| Canonical asset files exist in `app/` | unit | `npm test -- --run tests/unit/app-icons.test.ts` | File existence + duplicate sweep |
| Root layout has no manual icon links | unit | `npm test -- --run tests/unit/app-icons.test.ts` | Regex against `app/layout.tsx` |
| Manifest exposes install metadata and icon routes | unit | `npm test -- --run tests/unit/app-icons.test.ts` | Regex against `app/manifest.ts` |
| `/icon`, `/apple-icon`, `/manifest.webmanifest` stay public | unit | `npm test -- --run tests/unit/app-icons.test.ts` | Regex / helper assertions in proxy files |
| App compiles with metadata assets present | build smoke | `npm run build` | Confirms Next accepts the metadata files |
| Desktop tab + iOS/Android install preview show the new icon | manual | N/A | Human smoke checklist required |

### Sampling Rate

- After each task: `npm test -- --run tests/unit/app-icons.test.ts`
- After the implementation plan: `npm test -- --run tests/unit/app-icons.test.ts && npm run build`
- Before phase verification: run the manual checklist on at least one desktop browser plus one mobile install surface

### Wave 0 Gaps

- [ ] `tests/unit/app-icons.test.ts` - create the regression suite for file existence, manifest, and proxy coverage

Existing infrastructure already covers everything else.

---

## Sources

### Primary

- `13-CONTEXT.md`
- `app/layout.tsx`
- `proxy.ts`
- `lib/supabase/proxy.ts`
- `lib/platform-config.ts`
- `components/auth/auth-card.tsx`
- `components/landing/top-nav.tsx`
- `components/landing/landing-footer.tsx`
- `tests/unit/globals-brand-tokens.test.ts`
- Next.js metadata docs: `app-icons` and `manifest`

### Secondary

- Phase 10 summary for file-read regression-test pattern
- Phase 11 summary for brand-palette and landing-mark context

---

## Metadata

**Confidence breakdown:**

- Framework conventions: HIGH
- Middleware/public-route risk: HIGH
- Asset-authoring specifics: MEDIUM-HIGH

**Valid until:** 2026-06-01
