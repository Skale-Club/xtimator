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
