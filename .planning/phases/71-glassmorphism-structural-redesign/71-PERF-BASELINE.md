# Phase 71 — Performance Baseline

Recorded by `scripts/lighthouse.mjs` against `localhost:9633` (`bun run dev`).
Re-run after each wave; final values gate REDESIGN-10 (≥80 perf+a11y on / and /dashboard).

| Wave | Date | URL | Perf | A11y | BP | SEO |
|------|------|-----|------|------|----|-----|
| pre-71 | TBD | / | TBD | TBD | TBD | TBD |
| pre-71 | TBD | /dashboard | TBD | TBD | TBD | TBD |

First Load JS for /dashboard (from `bun run build`):
- pre-71: TBD KB (target: < 500 KB)

## Notes

- `lighthouse` + `chrome-launcher` not yet installed as devDeps. Plan 71-01 ships the
  runner; install + mint baseline numbers gate happens in Plan 71-10 (final perf gate)
  or earlier if needed. To install:
  ```
  bun add -d lighthouse chrome-launcher
  ```
- To run baseline locally once installed:
  ```
  bun run dev          # in one shell
  bun scripts/lighthouse.mjs http://localhost:9633/ http://localhost:9633/dashboard
  ```
- `/dashboard` requires an authenticated session; for true CI gating, wire
  Lighthouse to use an auth cookie or call it after a fixture login.
