---
status: resolved
trigger: "Browser console reports Failed to load /_next/static/chunks/*.js because a ServiceWorker intercepted the request and encountered an unexpected error at sw.js:53"
created: 2026-07-07
updated: 2026-07-07
---

# Debug Session: service-worker-next-chunks-intercept

## Symptoms

- expected_behavior: "Production pages should load Next.js JavaScript chunks normally."
- actual_behavior: "Multiple /_next/static/chunks/*.js script requests fail before the app boots."
- error_messages:
  - "Failed to load 'https://xtimator.com/_next/static/chunks/*.js?...'. A ServiceWorker intercepted the request and encountered an unexpected error. sw.js:53:11"
  - "Loading failed for the <script> with source 'https://xtimator.com/_next/static/chunks/*.js?...'"
- timeline: "Reported on 2026-07-07 from production browser console."
- reproduction: "Open https://xtimator.com with the PWA service worker active and inspect console/network while the app loads."

## Root Cause

`public/sw.js` intercepted every same-origin `/_next/static/*` request and wrapped it in `event.respondWith(cacheFirst(...))`.
For Next.js boot chunks, any service worker exception or fallback response at that point prevents the browser from loading critical scripts, and the client-side chunk recovery code may never get a chance to run.

## Fix

- Bumped the service worker cache version from `v3` to `v4` so existing `shell-v3` / `pages-v3` caches are evicted on activation.
- Changed `/_next/static/*` handling to return without `respondWith`, letting the browser, CDN, and normal HTTP cache handle Next.js chunks.
- Kept `/icons/*` cache-first so installable PWA icons remain available without letting the worker sit in the critical script path.
- Updated the service worker unit contract to lock this behavior.

## Verification

- passed: `node --check public/sw.js`
- passed: `npm test -- tests/unit/pwa-service-worker.test.ts tests/unit/pwa/chunk-recovery.test.ts`
