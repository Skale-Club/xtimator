---
phase: 192-url-rewrite-cutover-cdn-verification
plan: 05
subsystem: storage
tags: [cdn, cloudflare, r2, cutover, egress, verification]

# Dependency graph
requires:
  - phase: 192-04
    provides: "the rewritten URLs whose edge behaviour this plan measures"
  - phase: 191-object-migration-verification
    provides: "all 55 objects copied and verified in R2 — the precondition for switching reads to R2"
provides:
  - "PROXY-05 proven against production: landing images served from xtimator.com with a Cloudflare cache HIT"
  - "R2 activated in production — x-asset-source: r2"
affects: [FUT-R2-01 disable the Supabase fallback, FUT-R2-02 decommission Supabase Storage]

executed_by: orchestrator (not a plan executor)
status: complete-with-gaps
---

# 192-05 — CDN verification and R2 activation (PROXY-05)

**Executed:** 2026-08-07 by the orchestrator directly. Written after the fact.

## PROXY-05 — proven

```
GET /storage/platform-brand/hero-images/1779656411137-landing-persona.webp
  Cache-Control: public, max-age=31536000, immutable
  cf-cache-status: HIT      (HIT on three consecutive requests)
```

Landing page: **0** `*.supabase.co` references, 18 distinct `/storage/` URLs,
each fetched and confirmed `200` with the correct content type.

Private bucket, same route: `private, no-store` + `cf-cache-status: BYPASS`.
A tenant's job-site photo cannot enter Cloudflare's shared cache.

No Cloudflare cache rule was needed — unlike the sibling xkedule setup, these
keys carry real file extensions, so Cloudflare's default rules cache them.

## R2 activated

Six variables were created on the Coolify app (`cf1cqh0bq8jyw91e78tcw8c6`) via
the API, values read from the operator's scratchpad file — never typed into a
web form:

`STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=true`.

After the restart, verified with cache-busted requests across both public
buckets:

| Asset | Result |
|---|---|
| `platform-brand/logo-…png` | `200 image/png` · `x-asset-source: r2` |
| `platform-brand/og-images/…jpg` | `200 image/jpeg` · `x-asset-source: r2` |
| `logos/1b038660…/logo.png` | `200 image/png` · `x-asset-source: r2` |
| `logos/571b4fc7…/logo.webp` | `200 image/webp` · `x-asset-source: r2` |

`/api/health` reports `ok` with `storage: ok`.

**Supabase Storage egress for these assets is now zero** — reads come from R2,
and repeat reads never reach the origin at all.

## Two corrections found while doing this

1. **`skaleclub-apps/COOLIFY.md` documents the wrong app UUID for Xtimator.**
   It lists `wucewun01rpf7z29qjmhhvbn`, which returns an empty record from the
   Coolify API. The real one is `cf1cqh0bq8jyw91e78tcw8c6`, confirmed by
   querying `/applications` and matching on `fqdn`. Anyone following that doc
   would target a non-existent app. Not fixed here — it is another repo.
2. **`COOLIFY_BASE` already includes `/api/v1`.** Appending the path again
   yields a 404 that looks exactly like a dead token. This is the mirror image
   of an earlier note that said the opposite; the reliable move is to probe
   `$COOLIFY_BASE/version` before concluding anything about the token.

Coolify's API also mirrors each variable into a preview-scoped copy
(`is_preview: true`) even when the request sets `is_preview: false`. That is
Coolify behaviour, not a duplicate-write bug — production and preview scopes
are separate.

## Gaps — stated, not hidden

1. **The reversibility proof was not executed.** The plan called for
   enumerating R2-only objects (`npm run migrate:r2 -- --verify-only`, reading
   the `[EXTRA]` rows) *before* removing `S3_*`, then removing them and
   confirming reads fall back to Supabase. Not done — it would mean toggling
   production storage off and on again minutes after switching it on. The
   mechanism is unit-tested and the fallback is demonstrably live (every read
   before the switch reported `x-asset-source: supabase` through the same code
   path), but the end-to-end rollback drill remains unexercised in production.
2. **From now on, writes land in R2 only.** The documented caveat applies:
   removing `S3_*` restores Supabase reads unconditionally only while no object
   exists solely in R2. Before any rollback, run
   `npm run migrate:r2 -- --verify-only` and treat `[EXTRA]` rows as a
   copy-back list.
3. **No cold-load purity check across every landing asset.** One hero image was
   measured for MISS→HIT; the other 17 were confirmed `200` + content type but
   not individually measured for cache status.
