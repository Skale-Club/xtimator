# Phase 192: URL Rewrite Cutover & CDN Verification — Context

**Gathered:** 2026-08-06 by direct query against the production database
(Supabase project `prmqgcrnpuvpzruyzvuv`). These are measurements, not
estimates. Do not re-derive them; do not widen the rewrite beyond them.

## The actual URL-02 rewrite scope in production is 11 occurrences

| Table.column | Type | Rows/occurrences holding a `*.supabase.co` storage URL |
|---|---|---|
| `companies.logo_url` | text | **1** (of 1 non-null) |
| `platform_branding.logo_url` | text | **1** (of 1 non-null) |
| `platform_branding.og_image_url` | text | **1** (of 1 non-null) |
| `platform_branding.landing_content` | **jsonb** | **8** occurrences inside one 3 050-byte document |
| **Total** | | **11** |

Empty / not in scope — verified zero Supabase storage URLs:
`clients.logo_url` (0 non-null rows), `platform_branding.favicon_url` (null),
`blog_posts.cover_image_url` (0 non-null rows).

## Two traps this measurement exposes

**1. `company_price_book.image_url` must NOT be rewritten.** The requirement
text names "price-book image URLs", and a naive rewrite would target this
column. It has **293 non-null rows and ZERO Supabase URLs** — every one is an
external `https://images.pexels.com/...` stock photo. Rewriting them would
corrupt 293 rows of working data. Match on the Supabase storage URL prefix,
never on "column is named image_url".

**2. Most of the work is inside JSONB, not flat columns.** 8 of the 11
occurrences live in `platform_branding.landing_content` — the hero image,
hero background image, hero background *video*, step images and feature
images written by `app/admin/landing/actions.ts`. A rewrite that only handles
`text` columns would silently miss 73 % of the scope and leave the landing
page — the exact surface PROXY-05 must prove — still pulling from
`*.supabase.co`. The JSONB shape must be walked, and the rewrite must be
value-level (replace the URL prefix inside the document), not
document-level.

Note the background **video**: URL-04's CSP check must cover `media-src`, not
only `img-src`.

## Consequences for the plan

- A reversible record for 11 occurrences does not need infrastructure. The
  whole pre-state fits in a single small artifact; rollback should be one
  command restoring exact prior values, and that is achievable literally, not
  approximately.
- Idempotency is trivially testable at this size: run twice, assert the
  second run reports zero changes.
- Because the total is 11, **every single rewritten value can be verified
  individually** — asserting "N rows updated" is not enough. Fetch each
  rewritten URL through the proxy afterwards and confirm it returns the bytes.
- `company_price_book` should appear in the plan as an explicit
  **excluded-and-why** item with the 293/0 numbers, so a later reader does not
  "fix" the omission.

## Related verified facts (from earlier phases)

- Production storage totals 51 objects / 14.3 MB.
- The landing page pulls ~41 image references / ~1.9 MB per cold visit — that
  count is *references on the page*, not distinct DB values; the 8 JSONB
  occurrences plus the platform logo/og image are what back them.
- Migrations are applied MANUALLY to production; the deploy pipeline never
  runs them.
- The proxy falls back to Supabase for anything missing from R2, so the
  rewrite is safe to land before or after the object copy.
