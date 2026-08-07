# Phase 190 — deferred / out-of-scope discoveries

## From 190-01

### 1. `storage-seam-census` red on `lib/storage/browser-upload.ts` (NOT ours)

`tests/unit/storage/storage-seam-census.test.ts` fails with
`expected [ 'lib/storage/browser-upload.ts' ] to deeply equal []` — a raw
`<client>.storage.from(...)` call outside the two legitimate adapter holders.

That file was created by the **concurrently-running 189-03** executor
(`9c86157c feat(189-03): ticket-driven browser upload module`), not by this plan.
None of 190-01's files contain `.storage.from(`. Left untouched per the scope
boundary; 189-03 owns either routing it through the adapter or adding the
manifest row.

### 2. `z.string().url()` accepts `javascript:` under zod 4.3.6

Discovered while mutation-testing the Task 2 gate: reverting
`priceBookItemSchema.image_url` to `z.string().url()` made the
`still rejects javascript:alert(1)` assertion fail — i.e. zod v4's `.url()`
**accepts** `javascript:alert(1)`.

The 7 fields relaxed by this plan are now STRICTER than before (the new
`isAcceptableAbsoluteAssetUrl` predicate allows only `http:`, `https:`, `data:`).
But the two fields deliberately left on `z.string().url()` still inherit the
permissive behavior:

- `lib/schemas/admin.ts` `blogPostSchema.coverImageUrl` — an admin-pasted value
  rendered as a blog cover image `src`.
- `lib/schemas/onboarding.ts` `website` — rendered as a link on company surfaces.

Pre-existing, out of scope here (the plan explicitly requires both to stay on
`z.string().url()`), and admin/owner-authored in both cases. Worth a follow-up:
swap them to a strict absolute-only predicate built on
`isAcceptableAbsoluteAssetUrl` minus `data:`.

## From 190-03

### PDF-LOGO-01: company logos are stored as WebP and have NEVER rendered in any estimate PDF

A live product bug that **predates Phase 190 and is unchanged by it**. 190-03 was
explicitly instructed to record it, not fix it.

Evidence (all verified during 190-03, not assumed):

1. The four writers that upload to the `logos` bucket — `lib/actions/company.ts`,
   `lib/actions/settings.ts`, `lib/actions/client.ts`,
   `lib/actions/admin-company.ts` — all call `convertImageToWebp`
   (`lib/image/webp.ts`), so every stored logo is WebP.
2. `@react-pdf/image` decodes only jpg/jpeg/png, verbatim
   (`node_modules/@react-pdf/image/lib/index.js:128-131`):
   `isValidFormat = lower === 'jpg' || lower === 'jpeg' || lower === 'png'`,
   and `getImage()`'s switch returns `null` for anything else. This holds on
   **both** the remote-URL path and the data-URI path, so it is orthogonal to
   which URL form the row carries.
3. `lib/pdf/measure-header-height.ts:111` nonetheless reserves
   `headerRightGapPt + logoHeightPt` (64pt modern / 72pt classic) charged purely
   on `company.logo_url` being **truthy**.

**Net effect:** every estimate PDF for a company with a logo has a blank reserved
block where the logo should be.

**Why not fixed here:** the fix changes what those four server actions upload
(PNG, or dual-writing a PNG next to the WebP), which alters upload behaviour in
four places and needs a story for existing rows. It deserves its own scoped plan.

**Note on the favicon route:** WebP is deliberately KEPT in
`lib/storage/asset-inline.ts`'s allowlist, because `app/icon.tsx`'s
`ImageResponse` renderer *does* decode WebP. Dropping it to "help" the PDF would
break the favicon. Also relevant: react-pdf rejects a WebP data URI via
`Base64 image invalid format: webp` — the format string only, no URI — so WebP
does not trigger the base64-blob log leak the allowlist exists to prevent.
