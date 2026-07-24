---
phase: quick-260723-img7
status: complete
date: 2026-07-23
commit: d7c32d2f
files_modified:
  - lib/image/webp.ts
  - components/ui/slider.tsx
  - components/admin/image-position-editor.tsx
  - lib/platform-config.ts
  - lib/schemas/admin.ts
  - app/admin/landing/actions.ts
  - app/admin/landing/landing-editor.tsx
  - components/landing/hero-section.tsx
  - components/landing/features-section.tsx
  - components/landing/how-it-works-section.tsx
  - components/landing/landing-page.tsx
  - app/admin/branding/actions.ts
  - app/admin/seo/actions.ts
  - app/(app)/settings/(tabs)/account/page.tsx
  - components/settings/profile-section.tsx
  - lib/actions/settings.ts
  - lib/actions/admin-company.ts
  - lib/actions/company.ts
  - components/onboarding/onboarding-survey.tsx
  - lib/actions/client.ts
  - components/clients/client-sheet.tsx
  - lib/actions/price-book.ts
  - lib/queries/price-book.ts
  - components/price-book/price-book-item-dialog.tsx
  - components/price-book/price-book-list.tsx
  - lib/actions/photo.ts
  - lib/queries/photo.ts
  - components/workspace/photos/photo-drop-zone.tsx
  - components/workspace/photos/photo-card.tsx
  - components/capture/capture-recorder.tsx
  - supabase/migrations/20260723000001_image_position_metadata.sql
---

# Summary: Zoom/drag image positioning + WebP conversion, app-wide

## Context

Started as "add a zoom slider to the admin landing-page image uploaders."
Expanded through two user follow-ups, each confirmed via AskUserQuestion:
drag-to-reposition (not just zoom), and applying both plus automatic WebP
conversion to EVERY image-upload surface in the app — not just landing
content. Second checkpoint specifically confirmed job-site photos (captured
during the AI estimate walkthrough) were in scope too, despite the tension
that raised (crop UI vs. the AI needing the full original).

## What changed — 4 commits

1. **466ed763** — Foundation + landing content: `lib/image/webp.ts`
   (`convertImageToWebp`), `components/ui/slider.tsx` (shadcn Slider via the
   unified `radix-ui` package), `components/admin/image-position-editor.tsx`
   (zoom slider + drag, `cover`/`contain` fit modes, `{scale, x, y}`).
   Wired into hero/step/feature landing images. Hero image now converts to
   WebP (was raw). Admin position applies via a wrapping div for hero/features
   so it composes with — rather than overrides — their existing fragile
   cross-breakpoint Tailwind transforms / hover-scale effect.
2. **cd71d10e** — Branding, SEO, settings, company/onboarding/client logos,
   price-book photo.
3. **2f53af54** — Job-site project photos (photo-drop-zone.tsx,
   capture-recorder.tsx) + the `photos.position` data model.
4. **d7c32d2f** — Trimmed the migration to the 2 columns actually used.

## Judgment calls made (each stated inline in commit messages too)

- **WebP: applied everywhere EXCEPT** `og:image` (LinkedIn historically
  doesn't support WebP og:image; Facebook has known parse edge-cases — a
  broken social-share preview is a silent regression, verified via web
  search before deciding) and **favicon** (browsers expect .ico/.png/.svg
  for `rel=icon`).
- **Position editor: applied only where a photo is actually cropped into a
  fixed frame** — hero, feature cards, step images, avatar (circle), price-
  book item photo. **Skipped for every logo** (platform/company/client —
  `object-contain`, no crop, rendered at 24-32px in ~15 places) and OG image
  (never rendered as an `<img>` in-app, meta-tag only). Confirmed via code
  inspection (branding-preview-card.tsx renders the logo at 32px) before
  deciding, not assumed.
- **Job-site photos: WebP yes, position-editing UI no.** The client-side
  canvas compression (resize to 2000px, JPEG) that already exists is
  UNCHANGED — it exists specifically to keep uploads small/fast on job-site
  cellular, core to the product's "estimate in under 5 minutes" value prop.
  A new `uploadProjectPhoto` server action re-encodes the already-small blob
  to WebP after it reaches the server — same upload payload size/speed as
  before. Verified this is safe for the AI vision pipeline before touching
  it: `analyze-photos.ts`'s `getMimeType()` already explicitly maps `.webp`
  → `image/webp`, and Gemini/OpenRouter vision models accept WebP natively.
  `photos.position` exists in the data model and is applied defensively in
  the grid thumbnail, but no drag/zoom editing UI was built — capture is a
  fast, many-photos-per-visit flow with no natural low-friction spot for a
  deliberate crop step. A candidate for a follow-up: an "Adjust" action in
  `photo-lightbox.tsx`, which already shows the full photo. Position never
  affects stored bytes either way — AI analysis always reads the full
  original image.
- **Two upload paths bypassed server actions entirely** (client uploaded
  directly to Supabase Storage — sharp/WebP unreachable): onboarding logo
  and per-client logo. New server actions `uploadOnboardingLogoAction` /
  `uploadClientLogoAction`. Found and fixed a pre-existing bug while
  rewriting the onboarding path: it stored the bare storage PATH as
  `companies.logo_url` instead of the resolved public URL.
- **capture-recorder.tsx needed a new retry wrapper** —
  `uploadProjectPhotoWithRetry`, mirroring `lib/storage/upload-with-retry.ts`'s
  3-attempt/exponential-backoff shape, since that existing helper is typed
  directly against `StorageProvider.upload` and can't wrap a server action.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean after every commit.
- Landing: 11/12 (1 pre-existing flaky AuthDialog timing test, confirmed
  passing in isolation, unrelated to these changes).
- Price-book: 30/30 (item dialog + list).
- Photos: 15/15 (create-photo-guards, photo-thumbnail-cap, analyze-photos-job).
- Live dev server SSR HTML: landing page renders clean, all 3 restored
  How It Works animations intact, no runtime errors.

## Not done / explicitly deferred

- Drag/zoom editing UI for job-site photos (data model + display-application
  only — see reasoning above).
- Position editor for any logo or the OG image (data model doesn't even
  exist for these — deliberately excluded, not partially built).
- The migration (`supabase/migrations/20260723000001_image_position_metadata.sql`)
  is written but NOT applied to the remote database — manual apply required
  per this repo's established convention, before `company_price_book.image_position`
  or `photos.position` will actually persist (both gracefully no-op / stay
  null until then — no crash, just the position silently doesn't save).

All commits are LOCAL only, not pushed.
