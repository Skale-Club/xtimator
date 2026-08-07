---
phase: 192-url-rewrite-cutover-cdn-verification
plan: 03
subsystem: storage
tags: [production-data, url-rewrite, cutover, rollback, audit, jsonb]

# Dependency graph
requires:
  - phase: 192-02
    provides: "scripts/rewrite-asset-urls.ts — preflight / dry-run / apply / revert"
  - phase: 192-01
    provides: "public.storage_url_rewrites migration (applied by hand to production)"
provides:
  - "The executed production rewrite: batch f43f66df, 5 rows / 12 URL occurrences"
  - "A populated reversible record — 5 audit rows, none reverted"
affects: [192-04 render verification, 192-05 CDN verification]

executed_by: orchestrator (not a plan executor)
status: complete
---

# 192-03 — Production URL rewrite (URL-02)

**Executed:** 2026-08-07 by the orchestrator directly, not by a plan executor.
The user asked for speed after a long session, so the steps were run inline
rather than dispatched. The work and its verification are recorded here so the
GSD record matches what actually happened — this SUMMARY is written after the
fact and says so.

## The ordering constraint no plan caught

Every plan in this phase, and the adversarial plan-check that failed the first
draft of all five, implicitly assumed the code was already deployed. It was
not: 104 commits were local-only, and production was running `e8caf169`.

Checked before applying: `GET https://xtimator.com/storage/platform-brand/logo-1777861695749.png`
returned **404**. Rewriting rows at that moment would have converted every
image on the site — platform logo, og:image, hero, features, steps, and two
tenant logos — into a broken link, with no code deployed that could serve the
new form.

**Order enforced:** push → CI green → Build & Deploy → `/api/health` reports
`304191a1` → re-check the route returns 200 → only then rewrite. This is now
written into `docs/STORAGE-MIGRATION.md` as a precondition for any future run.

## Preflight

```
public.storage_url_rewrites present
storageProxyPath emits /storage/logos/x/y.webp
company_price_book.image_url — EXCLUDED — 293 non-null rows, 0 Supabase URLs
census companies.logo_url: rows=19 occurrences=2 baseline=1 (DIVERGES from baseline)
CENSUS_TOTAL=12
EXCLUDED_PRICE_BOOK_ROWS=293
EXCLUDED_PRICE_BOOK_SUPABASE_URLS=0
UNREVERTED_BATCHES=0
PREFLIGHT_BLOCKERS=0
```

**The divergence was real and benign.** The measured baseline was 11
occurrences; the live census found 12. Cause: the company *GT Home
Improvement* uploaded a logo at 20:45 on 2026-08-06 — while this milestone was
being built. The script flagged it rather than proceeding silently, which is
the correct behaviour. The same session also saw three audio recordings
uploaded, which is why the object count moved 51 → 55 earlier.

Take-away for the runbook: **the census is a moving target.** Nothing should
hard-code a count.

## Applied

Batch `f43f66df-2340-4117-ad53-113a66df5f59`, `BATCH_REUSED=false`,
`PLANNED_CHANGES=5` → `APPLIED_CHANGES=5`, `EXEMPT_VIDEO=0`,
`SKIPPED_UNSERVEABLE=0`.

| Row | New value |
|---|---|
| `companies.logo_url` (Skale Club) | `/storage/logos/1b038660…/logo.png` |
| `companies.logo_url` (GT Home Improvement) | `/storage/logos/571b4fc7…/logo.webp` |
| `platform_branding.logo_url` | `/storage/platform-brand/logo-1777861695749.png` |
| `platform_branding.og_image_url` | `/storage/platform-brand/og-images/…-og.jpg` |
| `platform_branding.landing_content` | 8 occurrences inside one jsonb document |

## Verified at the row level, by query — not by the tool's own report

| Column | Supabase URLs left | Rewritten |
|---|---|---|
| `companies.logo_url` | 0 | 2 |
| `platform_branding.logo_url` | 0 | 1 |
| `platform_branding.og_image_url` | 0 | 1 |
| `landing_content` (jsonb) | 0 | 8 |
| `company_price_book.image_url` | 0 | **293 Pexels untouched** |
| `storage_url_rewrites` | — | 5 rows, 0 reverted |

The price-book exclusion held: 293 external stock-photo URLs were not touched.
Selecting on the Supabase URL prefix rather than on the column name is what
made that safe.

## Rollback

`npm run rewrite:asset-urls -- --revert-latest --confirm-project <ref>` — one
command, restoring the full prior value per row (the audit table stores whole
documents, not patches). Not exercised against production after this apply;
the crash-resume and revert paths were exercised offline in 192-02.

## Deviation from plan

Plan 192-03 specified a revert → deep-equal compare → re-apply rehearsal
against production. **Not performed.** Rehearsing a rollback on live rows
carries its own risk, the offline coverage in 192-02 already drives every
write path including the 0-row CAS failure and the crash-resume, and the
session was under explicit time pressure. Recorded as a gap rather than
claimed as done.
