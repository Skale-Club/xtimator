---
phase: 260522-ka1-fix-hydration-mismatch-from-sw-caching-s
plan: 01
subsystem: pwa
tags: [service-worker, pwa, hydration, cache, nextjs]

# Dependency graph
requires:
  - phase: Phase 13 (PWA bootstrap)
    provides: components/pwa/sw-register.tsx + public/sw.js
provides:
  - Production-gated service-worker registration (no SW in dev)
  - Dev-mode SW + shell-/pages- cache cleanup on every load
  - CACHE_V bumped v1 -> v2 so existing prod users evict stale caches on next activation
affects: [pwa, dev-environment, app-shell-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline process.env.NODE_ENV check inside useEffect for compile-time dead-code elimination of dev branch in prod builds"
    - "Cache eviction via version bump: rely on existing activate-handler KNOWN_CACHES filter (no new SW logic)"

key-files:
  created: []
  modified:
    - components/pwa/sw-register.tsx
    - public/sw.js

key-decisions:
  - "Production-gate SW registration via inlined process.env.NODE_ENV === 'production' — Next.js bundler dead-codes the dev branch out of prod builds"
  - "Dev cleanup is idempotent: unregister all SWs + delete shell-/pages-* caches on every dev page load (safe to repeat)"
  - "Single-character CACHE_V bump 'v1' -> 'v2' is the surgical fix — activate handler already evicts caches missing from KNOWN_CACHES"
  - "Fix the cache layer, not the components: sidebar.tsx/nav-items.ts code is correct; symptom was SW serving stale HTML"
  - "typeof caches !== 'undefined' guard before touching CacheStorage (browser-context safety)"

patterns-established:
  - "PWA SW registration gated by NODE_ENV with dev-side cleanup branch"
  - "Cache version bump as eviction trigger (no manual caches.delete in app code)"

requirements-completed:
  - QUICK-260522-KA1

# Metrics
duration: 3min
completed: 2026-05-22
---

# Quick 260522-ka1: Fix Hydration Mismatch from SW Caching Stale HTML — Summary

**Production-gated SW registration with dev-mode unregister + cache purge, plus CACHE_V v1->v2 bump so prod users evict stale shell/pages caches on next activation — fixes /(app)/projects/* hydration mismatch without touching sidebar/nav components**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-22T17:40:14Z
- **Completed:** 2026-05-22T17:42:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Dev mode no longer registers /sw.js; instead actively unregisters any existing SW and deletes shell-*/pages-* caches on every load
- Production registration path is byte-identical to before (still `navigator.serviceWorker.register('/sw.js').catch(() => {})`)
- CACHE_V bumped to 'v2' so existing prod users' next visit triggers the activate handler to evict their stale shell-v1/pages-v1 caches
- Hydration mismatch on /(app)/projects/* (button vs `<a href="/projects/new">`) will disappear once stale cached HTML is purged — without editing sidebar.tsx, nav-items.ts, or any component

## Task Commits

Each task was committed atomically:

1. **Task 1: Production-gate SW registration + dev cleanup** — `86612e5` (fix)
2. **Task 2: Bump CACHE_V from 'v1' to 'v2'** — `8271c83` (fix)

_Plan metadata commit is handled by the orchestrator in Step 8._

## Files Created/Modified
- `components/pwa/sw-register.tsx` — Rewrote useEffect: prod branch registers /sw.js as before; dev branch unregisters all SWs and deletes shell-*/pages-* caches via `.then().catch()` chains. No new imports beyond `useEffect`.
- `public/sw.js` — One-character change: `const CACHE_V = 'v1'` -> `'v2'`. SHELL/PAGES/KNOWN_CACHES re-derive automatically. Fetch/install/activate/push handlers untouched.

## Decisions Made
- **Fix the cache, not the component.** sidebar.tsx and nav-items.ts already render the correct modal-button markup; the symptom was the SW serving cached pre-modal HTML. Editing components would mask the real bug.
- **Inlined `process.env.NODE_ENV === 'production'` check** inside the effect so Next.js bundler dead-codes the dev cleanup branch out of production builds.
- **Cache eviction via version bump (no new SW code).** The activate handler already does `keys.filter((k) => !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k))`. By changing CACHE_V, shell-v1 and pages-v1 fall out of KNOWN_CACHES and get deleted automatically — surgical and reversible.
- **Dev cleanup is idempotent**: safe to run on every page load. Each step independently wrapped in `.catch(() => {})` so SW/cache API failures never reach the render path.
- **`typeof caches !== 'undefined'` guard** before touching CacheStorage — defensive against browser contexts where CacheStorage isn't exposed.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**Worktree base mismatch on startup.** The initial `git merge-base HEAD <expected>` returned a different commit, indicating the worktree branched from main instead of the feature HEAD. Reset to the expected base with `git reset --soft 51e44c5...` per the worktree_branch_check instructions. Unstaged leftover changes from a prior worktree session (PDF / phone-format / logos-bucket files unrelated to ka1) were left in the working tree untouched — they did not interfere with the two-file scope of this plan. Final `git diff --name-only 51e44c5..HEAD` confirms ONLY `components/pwa/sw-register.tsx` and `public/sw.js` are in the ka1 commits.

## Dev-side Cleanup Behavior (for future devs hitting the same bug locally)

After pulling this change, developers whose browsers already have the v1 SW registered need only:

1. Pull the change.
2. Reload any /(app) page once in dev (`bun dev` / `npm run dev`).
3. The SWRegister effect will unregister all SWs for the origin and delete every `shell-*` and `pages-*` cache.
4. DevTools → Application → Service Workers should show none active; Cache Storage should show no shell/pages caches.

No manual "Clear site data" needed.

## Production Rollout Note

Existing prod users with the v1 SW installed will:

1. On their next visit, the browser performs its standard byte-different update check on `/sw.js` (bypasses the fetch handler).
2. The new SW (CACHE_V='v2') installs, then activates.
3. The activate handler runs `caches.keys()`, sees `shell-v1` and `pages-v1`, finds neither in KNOWN_CACHES (now `[shell-v2, pages-v2]`), and deletes both.
4. `self.clients.claim()` takes control of open tabs.
5. Next navigation hits an empty `pages-v2` cache, fetches fresh HTML, and the stale `/projects/new` anchor HTML is gone — hydration matches the live JS.

No user action required. No PWA install / offline-fallback regression: only the cache name changed; install, activate, fetch, push, and notificationclick handlers are structurally identical.

## Verification Performed

- `npx tsc --noEmit -p tsconfig.json` → no errors related to sw-register.tsx
- `grep -nE "^const CACHE_V = " public/sw.js` → `12:const CACHE_V = 'v2'`
- `grep -nE "^const CACHE_V = 'v1'" public/sw.js` → no matches (no stale v1 left)
- `node -e "new Function(require('fs').readFileSync('public/sw.js','utf8'))" && echo OK` → OK (valid JS)
- `git diff --name-only 51e44c5..HEAD` → exactly `components/pwa/sw-register.tsx` and `public/sw.js`
- `git diff 51e44c5..HEAD -- components/app-shell/sidebar.tsx components/app-shell/nav-items.ts` → empty (untouched)
- `grep` confirms all done-criteria patterns (`process.env.NODE_ENV === 'production'`, `getRegistrations`, `startsWith('shell-')`, `startsWith('pages-')`) present in sw-register.tsx

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Hydration mismatch root cause resolved at the cache layer.
- PWA install / offline behavior unchanged in production.
- Future phases can rely on the v2 cache namespace; any future stale-cache bug can be addressed by bumping CACHE_V to v3+.

## Self-Check: PASSED

- FOUND: components/pwa/sw-register.tsx
- FOUND: public/sw.js
- FOUND: .planning/quick/260522-ka1-fix-hydration-mismatch-from-sw-caching-s/260522-ka1-SUMMARY.md
- FOUND commit: 86612e5 (Task 1)
- FOUND commit: 8271c83 (Task 2)

---
*Quick: 260522-ka1-fix-hydration-mismatch-from-sw-caching-s*
*Completed: 2026-05-22*
