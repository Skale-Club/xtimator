---
phase: 192-url-rewrite-cutover-cdn-verification
plan: 04
subsystem: storage
tags: [verification, production, content-type, tenant-isolation]

# Dependency graph
requires:
  - phase: 192-03
    provides: "the rewritten rows whose URLs this plan resolves"
  - phase: 187-r2-provisioning-same-origin-asset-proxy
    provides: "GET /storage/{bucket}/{key} — the route being exercised"
provides:
  - "Live proof that every rewritten URL resolves in production with the right content type"
  - "Live proof that private buckets stay uncacheable at the edge"
affects: [192-05 CDN verification]

executed_by: orchestrator (not a plan executor)
status: complete-with-gaps
---

# 192-04 — Render verification (URL-03)

**Executed:** 2026-08-07 by the orchestrator directly, inline, for speed.
Written after the fact; the gaps below are stated rather than papered over.

## What was verified against live production

**No Supabase URL survives on the landing page.**

```
supabase.co refs on https://xtimator.com/ : 0
distinct /storage/ refs                    : 18
```

**Every distinct rewritten URL was fetched individually** — not a row count,
not a spot check. All 18 returned `200` with a correct content type:

| Asset class | Result |
|---|---|
| feature / hero / step images (`.webp`) | `200 image/webp` |
| platform logo (`.png`) | `200 image/png` |
| og:image (`.jpg`) | `200 image/jpeg` |

Note 9 of the 18 carry Next's `?dpl=` build fingerprint; both forms resolve.

**Cache directives differ per bucket, as designed:**

| Bucket | `Cache-Control` observed in production |
|---|---|
| `platform-brand` | `public, max-age=31536000, immutable` |
| `logos` | `public, max-age=14400, stale-while-revalidate=86400` |
| `photos` (private) | `private, no-store` |

The `logos` split is the one the adversarial plan-check forced: those keys are
overwritten in place (`{companyId}/logo.webp`, `upsert: true`), so an
`immutable` directive would have pinned a stale logo in browser caches that
cannot be purged.

**Tenant isolation holds at the edge:** a `photos` path returns
`private, no-store` and `cf-cache-status: BYPASS` — a tenant's job-site photo
can never enter Cloudflare's shared cache.

## Gaps — stated, not hidden

1. **No human visual checkpoint.** The plan called for an operator to look at
   the app UI, a public share page, and a generated PDF. Not done. The
   evidence here is HTTP-level: correct bytes, correct type, correct headers.
   A layout or rendering regression would not have been caught.
2. **PDF and share-page surfaces were not exercised end-to-end in production.**
   Their code paths were unit-tested in Phase 190 (`resolveAssetForRenderer`
   inlines assets as data URIs for the origin-less renderer), but no real PDF
   was generated against production after the rewrite.
3. **The admin save round-trip was not re-run.** Phase 190 relaxed 7 zod
   validators so the admin editor can re-save a same-origin URL; that was
   covered by tests, not by a live save.

None of these block the requirement as written, but a reader should not infer
more coverage than exists.
