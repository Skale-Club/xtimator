# Phase 13: Visual Identity Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 13-visual-identity-polish-robust-favicon-and-app-icons-across-all-surfaces
**Areas discussed:** asset strategy, visual direction, branding boundary, verification

---

## Asset Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| App Router metadata assets | Use `app/` icon files and manifest conventions as the single source of truth | ✓ |
| Public-folder legacy setup | Put favicon/app icons in `public/` and wire them manually in head/layout | |
| Hybrid duplicate setup | Keep both `app/` and `public/` icon copies for safety | |

**User's choice:** Auto-selected recommended option: App Router metadata assets.
**Notes:** Chosen to avoid `public/` vs `app/` conflicts and keep icon delivery aligned with Next.js conventions.

---

## Visual Direction

| Option | Description | Selected |
|--------|-------------|----------|
| Monogram mark | Small, high-contrast platform monogram tuned for favicon sizes | ✓ |
| Full wordmark | Try to fit the full brand name into icon surfaces | |
| Uploaded logo dependent | Depend on runtime logo uploads for the core icon shape | |

**User's choice:** Auto-selected recommended option: Monogram mark.
**Notes:** Small-size clarity matters more than brand-name detail; existing auth/landing brand chips already support this direction.

---

## Branding Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Repo-controlled default icon set | Ship stable platform icons checked into the repo for all surfaces | ✓ |
| Runtime-generated icons | Derive icons from `getBranding()` / uploaded logo assets at request time | |
| Tenant-specific icons | Different icon identity per tenant/company | |

**User's choice:** Auto-selected recommended option: Repo-controlled default icon set.
**Notes:** Dynamic icon generation is a future enhancement; this phase focuses on robust coverage and consistent defaults.

---

## Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Automated + manual matrix | Add lightweight automated coverage and a short manual install/browser checklist | ✓ |
| Manual-only smoke test | Verify in browsers/devices without code-based checks | |
| Automated-only | Rely entirely on tests with no install-surface checklist | |

**User's choice:** Auto-selected recommended option: Automated + manual matrix.
**Notes:** Browser tab and manifest coverage can be asserted in code; mobile home-screen/install surfaces still need a brief human check.

---

## Claude's Discretion

- Final monogram geometry
- Exact raster export sizes
- Manifest implementation format
- Asset-generation workflow from the chosen master artwork

## Deferred Ideas

- Admin-managed dynamic app icons from uploaded branding assets
- Open Graph / social share image design
- Full PWA icon and splash-screen expansion
