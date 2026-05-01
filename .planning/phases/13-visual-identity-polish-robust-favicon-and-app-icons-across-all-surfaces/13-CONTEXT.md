# Phase 13: Visual Identity Polish - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the platform's visual identity by shipping a complete, conflict-free app icon set across browser tabs, pinned/home-screen installs, and manifest-driven surfaces.

Covers:
- Legacy `favicon.ico` support
- Canonical App Router icon assets in `app/`
- Light/dark-safe `icon.svg`
- PNG fallbacks for browsers and install surfaces
- Apple touch icon coverage
- Web manifest wiring for install metadata
- Removal/avoidance of duplicate `public/` vs `app/` icon conflicts
- No manual `<link rel="icon">` tags in layout/head files

Out of scope:
- Reworking the wordmark or broader marketing brand system
- Runtime per-tenant/per-admin icon customization from uploaded logos
- Open Graph / social share image design
- Notification badges, splash screens, or full PWA/offline work

</domain>

<decisions>
## Implementation Decisions

### Asset Strategy
- **D-01:** Use Next.js App Router metadata conventions as the single source of truth for app icons. Icon assets live under `app/`, not `public/`, and no manual `<link>` tags are added to `app/layout.tsx`.
- **D-02:** Ship the full baseline asset set in this phase: `favicon.ico`, `icon.svg`, `icon.png`, `apple-icon.png`, and a web manifest entrypoint so all major browser/install surfaces resolve a first-party icon.
- **D-03:** Avoid duplicate icon definitions across `app/` and `public/`. If a legacy asset must exist for compatibility, it should be the canonical App Router-served version, not a second competing copy.

### Visual Direction
- **D-04:** The icon system uses a simple platform-level monogram mark, not the full wordmark. Priority is recognizability and legibility at 16x16 and 32x32 before decorative detail.
- **D-05:** Visual language stays aligned with the current brand: `#406EF1` primary blue, dark-first surfaces, and a clean geometric mark that still reads on light browser chrome and iOS home-screen backgrounds.
- **D-06:** The SVG variant should explicitly handle light/dark presentation so the glyph never disappears into browser UI; the PNG and Apple assets can flatten that same mark into install-safe raster fallbacks.

### Branding Boundary
- **D-07:** App icons are platform-controlled repo assets for now; they do not fetch `getBranding().logoUrl` or depend on runtime DB branding. This phase delivers a stable default identity, not dynamic icon theming.

### Verification
- **D-08:** Verification should cover browser tab favicon resolution, App Router metadata output, Apple touch icon presence, Android/manifest icon exposure, and absence of duplicate icon declarations.
- **D-09:** Add automated checks where practical (file presence and metadata/head coverage) plus a short manual verification checklist for desktop browser tabs and mobile install surfaces.

### Claude's Discretion
- Exact monogram shape and geometry so long as it stays unmistakable at small sizes
- Whether the manifest is authored as `app/manifest.ts` or a static manifest file
- Precise PNG export sizes beyond the minimum required surfaces
- Whether `favicon.ico` is hand-authored or generated from the finalized PNG/SVG master

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project core
- `.planning/PROJECT.md` — product vision, current milestone history, and platform-branding context
- `.planning/STATE.md` — phase transition notes; includes the Phase 13 scope note added after v1.2 completion
- `.planning/ROADMAP.md` §"Phase 13" — canonical phase entry and dependency on Phase 12
- `CLAUDE.md` — repo constraints and GSD workflow enforcement

### Existing app metadata and routing
- `app/layout.tsx` — root metadata entrypoint; confirms there are currently no manual icon links
- `proxy.ts` — static-asset matcher already exempts `favicon.ico` and image extensions; icon/manifest routing must stay compatible

### Existing branding surfaces
- `lib/platform-config.ts` — current runtime branding boundary and fallback brand identity
- `components/auth/auth-card.tsx` — existing fallback visual motif (blue rounded tile + initial) that can inform icon direction
- `components/landing/top-nav.tsx` — current lightweight platform mark treatment in the marketing nav
- `components/landing/landing-footer.tsx` — repeated platform mark treatment and current brand presentation

### Current asset baseline
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`
- `public/file.svg`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`LogoFallback` in `components/auth/auth-card.tsx`** — already expresses the platform as a compact blue monogram tile; likely the best starting point for a favicon-scale mark
- **Brand mark blocks in `components/landing/top-nav.tsx` and `components/landing/landing-footer.tsx`** — confirm the current visual shorthand is an initial-based square mark, not a standalone SVG logo file
- **`getBranding()` in `lib/platform-config.ts`** — documents the current platform-branding boundary and why runtime logo URLs should stay out of favicon generation for this phase

### Established Patterns
- **App Router metadata ownership** — `app/layout.tsx` already owns root metadata via `generateMetadata()`, so icon work should use framework conventions instead of manual head injection
- **Static asset bypass in `proxy.ts`** — icon and manifest requests must remain outside auth/session middleware handling
- **Dark-first brand palette** — `#406EF1` is already locked as the default platform blue across auth and landing surfaces

### Integration Points
- `app/` — new icon and manifest assets belong here
- `app/layout.tsx` — should remain free of manual icon tags after this phase
- `proxy.ts` — may need matcher expansion if manifest or nonstandard icon filenames are not already excluded
- `public/` — review for obsolete placeholder assets or icon conflicts before shipping

</code_context>

<specifics>
## Specific Ideas

- Favor a bold `X` or similarly unmistakable monogram built for favicon sizes, not a tiny wordmark
- Keep the mark centered in a rounded-square field so it feels consistent with the auth and landing brand chips already in the product
- Make the SVG the visual master, then derive raster fallbacks from it for install surfaces
- Prefer crisp, high-contrast shapes over gradients that disappear at 16px

</specifics>

<deferred>
## Deferred Ideas

- **Admin-managed dynamic app icons** — using uploaded platform branding/logo assets as generated favicons belongs in a future branding phase
- **Open Graph / share-card image system** — adjacent to visual identity, but a separate deliverable from browser/install icons
- **Full PWA polish** — splash screens, maskable icons, shortcuts, and offline metadata remain out of scope

</deferred>

---

*Phase: 13-visual-identity-polish-robust-favicon-and-app-icons-across-all-surfaces*
*Context gathered: 2026-05-01*
