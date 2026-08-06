---
phase: quick-260806-ngz
plan: 01
subsystem: industries-catalog
tags: [industries, onboarding, price-book, catalog]
dependency-graph:
  requires: []
  provides:
    - "INDUSTRIES catalog entries: home_improvement, general_contracting, remodeling"
    - "INDUSTRY_PRICE_BOOK seed templates for the 3 new trades"
  affects:
    - "components/onboarding/industry-selector.tsx"
    - "company onboarding / settings industry picker"
    - "price-book auto-seed on company industry selection"
tech-stack:
  added: []
  patterns:
    - "Industry catalog entry: id/label/icon/projectTypes, icon key must exist in ICON_MAP"
    - "Price-book seed folder: name/image_url(PX id)/items[], deduped by folder name across trades"
key-files:
  created: []
  modified:
    - lib/industries.ts
    - components/onboarding/industry-selector.tsx
    - tests/unit/industries.test.ts
    - lib/price-book-seed.ts
decisions:
  - "Followed the plan's exact folder names, PX ids, and unit vocabulary (hr, each, sqft, lf, job) to avoid collisions with the 28 existing folder names."
metrics:
  duration: "~25 minutes"
  completed: "2026-08-06"
---

# Quick Task 260806-ngz: Add Home Improvement, General Contracting & Remodeling Trades Summary

Added three first-class trades to Xtimator's industry catalog — Home Improvement, General Contracting, Remodeling — taking `INDUSTRIES` from 10 to 13 entries, with matching selector icons and 9 new seeded price-book folders (~50 line items) using realistic US national-average pricing.

## What Was Built

**Task 1 — Catalog entries, selector icons, test update**
- `lib/industries.ts`: appended 3 `Industry` entries after `hvac` — `home_improvement` (icon `HousePlus`), `general_contracting` (icon `HardHat`), `remodeling` (icon `Ruler`) — each with 5 distinct `projectTypes`.
- `components/onboarding/industry-selector.tsx`: added `HousePlus, HardHat, Ruler` to the `lucide-react` import and to `ICON_MAP`, so all 13 industries render a real icon (no blank icon slot).
- `tests/unit/industries.test.ts`: bumped the entry-count assertion from 10 to 13 and appended the 3 new ids to the `'contains all known industries'` expected list.

**Task 2 — Price-book seed templates**
- `lib/price-book-seed.ts`: added `home_improvement`, `general_contracting`, `remodeling` keys to `INDUSTRY_PRICE_BOOK`, 3 folders each (9 total), 6–7 items per folder:
  - `home_improvement`: Siding & Exterior · Windows & Entry Doors · Decks, Porches & Fencing
  - `general_contracting`: Framing & Structural · Additions & New Construction · Permits, Management & Site Work
  - `remodeling`: Kitchen Remodeling · Bathroom Remodeling · Flooring & Basement Finishing
- All `image_url` values reuse only Pexels IDs from the plan's allowed list (`186461`, `1145434`, `1453499`). All `unit` values reuse only the plan-approved set (`sqft`, `lf`, `each`, `job`, `hr`) — no new unit strings introduced.

## Verification

- `npx tsc -p tsconfig.ci.json` — clean, no errors.
- `npx vitest run tests/unit/industries.test.ts` — 18/18 passed.
- `npx vitest run tests/unit tests/eval` — 5130 passed, 6 failed, 20 todo (608 files passed, 3 failed, 1 skipped). All 6 failures are pre-existing and unrelated to this task (see Deferred Issues below); none touch the 4 files this plan modified.
- `grep -o "^      name: '[^']*'" lib/price-book-seed.ts | sort | uniq -d` — prints exactly one pre-existing duplicate (`Repairs & Service`, plumbing + hvac) that predates this task; none of the 9 new folder names collide with each other or any existing name.
- `grep -o 'PX([0-9]*)' lib/price-book-seed.ts | sort -u` — every id present is in the plan's allowed list.
- `git status` after both commits shows exactly the 4 files listed in `files_modified`, plus unrelated concurrent work from another session (see note below) — `lib/seo/industries.ts` and `lib/tax-rates.ts` untouched, as required.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues (out of scope, not fixed)

Logged in detail at `.planning/quick/260806-ngz-add-home-improvement-general-contracting/deferred-items.md`:

1. **Pre-existing duplicate price-book folder name** — `plumbing` and `hvac` both already use the folder name `'Repairs & Service'` (predates this task, confirmed via `git show HEAD` before any edits here). `buildMergedFolders()` de-dupes by name, so a company selecting both trades silently loses one folder's items. Not caused by this task; recommend a follow-up quick task to rename one.
2. **4 pre-existing test failures in `tests/unit/storage/server-provider.test.ts`** (targeting untracked `lib/storage/server.ts`) — both files predate this task and belong to unrelated, concurrently in-progress work (a separate GSD phase/session landed a `feat(188-01)` commit on `main` between this plan's two task commits). Not touched.
3. The 2 known-benign CRLF migration-shape test failures (`sign-estimate-atomic-migration.test.ts`, `signature-evidence-retention-migration.test.ts`) occurred as expected per the execution constraints — Windows-only, pass in CI.

## Concurrent Activity Note

While this quick task ran, a separate session/agent committed `1a95ce01 feat(188-01): build lib/storage/server.ts, the single server-wide storage provider seam` directly to `main` between this plan's Task 1 and Task 2 commits, and left further uncommitted import-path edits in `app/api/health/route.ts`, `lib/actions/admin-whatsapp.ts`, and `lib/estimate/adapters/whatsapp.ts` in the working tree at the time this SUMMARY was written. None of those files are part of this plan's scope; they were left untouched and unstaged.

## Self-Check: PASSED

- FOUND: lib/industries.ts
- FOUND: components/onboarding/industry-selector.tsx
- FOUND: tests/unit/industries.test.ts
- FOUND: lib/price-book-seed.ts
- FOUND commit: 8329aaa0 (feat(quick-260806-ngz): add home_improvement, general_contracting, remodeling to INDUSTRIES catalog)
- FOUND commit: 1ec8f937 (feat(quick-260806-ngz): seed price-book folders for the 3 new trades)
