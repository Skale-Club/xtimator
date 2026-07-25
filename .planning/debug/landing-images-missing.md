---
status: awaiting_human_verify
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
  hypothesis: "`app/page.tsx` causes the transient media-free render because it starts `getBranding()` and `getLandingContent()` concurrently; on a cold cache `getLandingContent()` starts a second independent `getBranding()` database query, and either swallowed query failure can substitute `DEFAULT_LANDING_CONTENT`, whose hero/step/feature image URLs are absent."
  confirming_evidence:
    - "The reported output (copy and CTAs, no media requests) is exactly the render produced by `DEFAULT_LANDING_CONTENT`: its text is the production headline/subheadline while every landing image URL is absent."
    - "Source inspection directly shows `Promise.all([getBranding(), getLandingContent()])`, while `getLandingContent()` calls `getBranding()` again and the module cache is populated only after a query resolves."
    - "Fresh Playwright runs at 1440x1000, 1024x768, 900x900, and touch/coarse 820x1180 show nonzero visible hero-image geometry, successful image requests, and zero console errors, ruling out a persistent CSS, DOM, asset, or responsive regression."
  falsification_test: "If the root page still performs more than one branding resolution after the change, or if it does not pass `branding.landingContent` to `LandingPage`, the hypothesis/fix is wrong."
  fix_rationale: "Resolve branding exactly once and derive landing content from that same object, removing the cold-cache race and making branding plus media configuration an atomic snapshot without changing any landing layout."
  blind_spots: "The original browser/profile state is unavailable, so the exact failed Supabase response was not captured; the production issue is no longer reproducible in a fresh browser and could also have involved stale client state."
next_action: Have the user confirm the landing images remain visible in the original production browser/profile after the fix is deployed through the normal GitHub Actions/Coolify pipeline.

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

## Resolution

root_cause: RootPage performs two concurrent branding resolutions on a cold cache, allowing the landing-content branch to silently receive media-free fallback content independently of the branding branch.
fix: RootPage now awaits `getBranding()` once and derives `landingContent` from `branding.landingContent`; a source-level regression test locks the single-resolution contract.
verification: Focused tests passed 10/10; strict TypeScript passed; optimized production build passed; Playwright against the local production build returned HTTP 200 with visible hero geometry, successful image requests, and zero console errors. Fresh deployed production also renders hero and supporting images at all tested desktop/tablet viewports.
files_changed:
  - app/page.tsx
  - tests/unit/seo/home-cacheability.test.ts
