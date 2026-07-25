---
status: fixing
trigger: production-regression
created: 2026-07-25
updated: 2026-07-25T11:34:07.0494991-04:00
slug: landing-images-missing
---

# Landing page images missing

## Symptoms

- Expected: landing-page hero and supporting section images display on desktop and tablet as they did before the branch-alignment deployment.
- Actual: production at `https://xtimator.com` renders the hero copy and CTAs, but the image/media area is absent, leaving a large empty region.
- Errors: no visible browser console error in the supplied screenshots.
- Timeline: observed immediately after `main`, `dev`, local, and origin were aligned and production deployed commit `7dc2071068aa216013c8d27b319e5a3c954db563`.
- Reproduction: open `https://xtimator.com` at desktop or tablet width and inspect the landing-page hero.

## Scope and constraints

- Treat as a production regression.
- Preserve unrelated changes from the concurrently merged UI batch.
- Prefer a targeted fix over reverting the full batch.
- Production deploys through GitHub Actions, GHCR, and Coolify.

## Current Focus

reasoning_checkpoint:
  hypothesis: "The Docker build prerenders `/` without the Supabase service-role secret, so `getBranding()` returns media-free fallback content and Next serves that baked response from ISR for five minutes after every deployment."
  confirming_evidence:
    - "Playwright against deployed commit `ada60fbb` reproduced the failure: HTTP 200, two total images, no hero image, no hero-media request, and zero console errors."
    - "The failing response included `x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`, and `cache-control: s-maxage=300`."
    - "The Dockerfile deliberately excludes the Supabase service-role secret from `next build`; `createServiceClient()` therefore returns null during static generation and `getBranding()` returns `FALLBACK_BRANDING`, whose landing content contains no media URLs."
  falsification_test: "After making `/` runtime-rendered, the optimized build must classify it as dynamic and a fresh production response must omit prerender-cache headers while Playwright finds decoded, visible hero media."
  fix_rationale: "Render the database-backed landing page at request time while retaining the existing 30-second server-side branding cache. This preserves SSR/SEO and prevents deployment-time fallback content from being baked into the Docker image."
  blind_spots: "A cold runtime request can still receive fallback content during a real Supabase outage; unlike the current ISR behavior, that response will no longer be baked into the deployment or cached for five minutes."
next_action: Build and test the dynamic route, deploy it, then repeat the production Playwright reproduction.

## Eliminated

- hypothesis: The deployed component omits the hero media subtree because `heroImageUrl` is not passed through.
  evidence: Production SSR/RSC includes the Supabase `heroImageUrl`, and Playwright finds one `.hero-image img` with a complete 2028px natural-width image.
  timestamp: 2026-07-25T11:30:23.5593050-04:00

- hypothesis: A responsive CSS rule hides or collapses the media box.
  evidence: Playwright computed nonzero visible geometry at desktop, desktop-boundary, tablet, and coarse-pointer tablet widths; the hero image is visible in screenshots at every tested viewport.
  timestamp: 2026-07-25T11:30:23.5593050-04:00

- hypothesis: The production image asset is missing or invalid.
  evidence: The configured Supabase hero asset returns HTTP 200 as image/webp with 309642 bytes and decodes successfully.
  timestamp: 2026-07-25T11:30:23.5593050-04:00

## Evidence

- timestamp: 2026-07-25T11:24:00.4503188-04:00
  checked: `.planning/debug/knowledge-base.md`
  found: No entry overlaps the landing-image, absent-media, or no-request symptom set.
  implication: There is no known-pattern candidate to prioritize; investigate the deployed render path directly.

- timestamp: 2026-07-25T11:24:00.4503188-04:00
  checked: Git worktree and commit boundary
  found: Working tree contains the untracked debug session only; the landing component files changed between known-good `329de684` and deployed `7dc2071068aa216013c8d27b319e5a3c954db563`.
  implication: The regression is plausibly contained in the landing UI batch and can be isolated without touching unrelated files.

- timestamp: 2026-07-25T11:30:23.5593050-04:00
  checked: Production SSR HTML and RSC payload at deployed commit `7dc2071068aa216013c8d27b319e5a3c954db563`
  found: The payload currently includes the configured hero, three step, and four feature image URLs; the HTML contains 24 image elements and preloads the hero image.
  implication: The persisted production configuration is currently intact and the missing-media symptom was transient rather than a persistent prop/schema loss.

- timestamp: 2026-07-25T11:30:23.5593050-04:00
  checked: Playwright at 1440x1000, 1024x768, 900x900, and touch/coarse 820x1180
  found: Hero image boxes measured respectively about 660x409, 539x435, 585x439, and 529x397 pixels; each image was complete with natural width 2028, display block, visible, opacity 1. No console messages occurred.
  implication: Current responsive DOM and computed styles render the media correctly across the reported desktop/tablet scope.

- timestamp: 2026-07-25T11:30:23.5593050-04:00
  checked: Playwright network activity and below-the-fold page
  found: Fresh loads request the Supabase hero and step images (and feature images when in/near the viewport); scrolling to the second section shows all three step images with nonzero geometry.
  implication: A healthy render does emit image requests, so the original no-request observation points upstream to a media-free content snapshot rather than CSS or transport failure.

- timestamp: 2026-07-25T11:30:23.5593050-04:00
  checked: `app/page.tsx` and `lib/platform-config.ts` cold-cache call graph
  found: RootPage starts `getBranding()` and `getLandingContent()` in parallel; `getLandingContent()` starts another `getBranding()`, and `brandingCache` is only assigned after each query resolves. Query errors are swallowed into `FALLBACK_BRANDING`, whose landing content has no image URLs.
  implication: Two independent cold-start queries can produce a split or media-free snapshot with no client error, precisely matching the transient post-deploy symptom.

- timestamp: 2026-07-25T11:34:07.0494991-04:00
  checked: Regression test before and after the fix
  found: `tests/unit/seo/home-cacheability.test.ts` failed before the implementation because RootPage referenced `getLandingContent`; after deriving content from `branding.landingContent`, the focused landing suites passed 10/10 tests.
  implication: The duplicate branding-resolution path is removed and protected against regression.

- timestamp: 2026-07-25T11:34:07.0494991-04:00
  checked: TypeScript and production build
  found: `npx tsc --noEmit -p tsconfig.ci.json` passed; `npm run build` compiled, typechecked, generated 93 static pages, and finalized successfully.
  implication: The minimal server-component change is type-safe and compatible with the production build pipeline.

- timestamp: 2026-07-25T11:34:07.0494991-04:00
  checked: Locally served optimized production build at 1440x1000 with Playwright
  found: HTTP 200; hero image decoded with natural width 2028 and visible 726x449 geometry; hero plus three step image requests were observed; console remained empty.
  implication: The fixed production artifact preserves the intended image props, DOM, styles, and network behavior.

- timestamp: 2026-07-25T11:52:00-04:00
  checked: Playwright against deployed commit `ada60fbb`
  found: The production page returned HTTP 200 but contained only two images, no `.hero-image img`, one logo request, and zero console errors.
  implication: Eliminating the duplicate page-level branding call was insufficient; the original symptom remained reproducible after deployment.

- timestamp: 2026-07-25T11:52:00-04:00
  checked: Production response cache headers and Docker build environment
  found: The response was an ISR cache hit (`x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`, `s-maxage=300`), while the Docker build intentionally has no Supabase service-role secret.
  implication: Build-time static generation necessarily persists the media-free fallback and serves it after rollout.

- timestamp: 2026-07-25T11:56:00-04:00
  checked: Focused tests and optimized production build after forcing runtime rendering
  found: The two focused suites passed 11/11 tests, and `next build` classified `/` as `ƒ` dynamic while generating 92 static pages instead of prerendering the root route.
  implication: The Docker artifact no longer contains a build-time landing snapshot, and the regression guard enforces that contract.

## Resolution

root_cause: The Docker build prerenders `/` without the intentionally unavailable Supabase service-role secret. `getBranding()` therefore returns media-free fallback content, which Next bakes into the image and serves from ISR for five minutes after deployment. A duplicate page-level branding query increased fallback risk but was not the complete cause.
fix: RootPage resolves branding once and is forced dynamic so database-backed landing media is loaded at request time, while the existing server-side branding TTL preserves query efficiency.
verification: Focused tests passed 11/11 and the optimized build classified `/` as runtime-rendered (`ƒ`). Pending CI, deployment, and fresh production Playwright verification.
files_changed:
  - app/page.tsx
  - tests/unit/seo/home-cacheability.test.ts
