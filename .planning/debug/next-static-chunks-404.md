---
status: resolved
trigger: "Next.js deployed page fails to load _next/static/chunks JavaScript files with 404 and text/plain MIME type on https://xtimator.com"
created: 2026-06-12
updated: 2026-06-12
---

# Debug Session: next-static-chunks-404

## Symptoms

- expected_behavior: "The deployed xtimator.com page should load its Next.js JavaScript chunks from /_next/static/chunks with executable JavaScript MIME types."
- actual_behavior: "The browser receives 404 responses for chunk URLs, then refuses to execute them because the response MIME type is text/plain."
- error_messages:
  - "/_next/static/chunks/0bfqyfu~p.0fp.js:1 Failed to load resource: the server responded with a status of 404"
  - "(index):1 Refused to execute script from 'https://xtimator.com/_next/static/chunks/0bfqyfu~p.0fp.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled."
  - "/_next/static/chunks/0d1v7c9ocvpc4.js:1 Failed to load resource: the server responded with a status of 404"
  - "(index):1 Refused to execute script from 'https://xtimator.com/_next/static/chunks/0d1v7c9ocvpc4.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled."
- timeline: "Unknown from report."
- reproduction: "Open https://xtimator.com and inspect the browser console/network panel."

## Current Focus

- hypothesis: "The deployed HTML references Next.js build chunk names that are not present or not served by the current deployment."
- test: "Inspect Next.js build/deploy config and compare generated chunk paths with server/static asset handling."
- expecting: "A config or deployment packaging issue that drops or mismatches .next/static assets."
- next_action: "Gather initial evidence from Next/Vercel/Docker config and build output."

## Evidence

- timestamp: 2026-06-12
  observation: "Live https://xtimator.com HTML references current chunk names that differ from the reported failing chunk names."
- timestamp: 2026-06-12
  observation: "The reported chunk URL https://xtimator.com/_next/static/chunks/0bfqyfu~p.0fp.js returns 404 text/plain; a current chunk from the live HTML returns 200 application/javascript."
- timestamp: 2026-06-12
  observation: "public/sw.js used stale-while-revalidate for document navigations, allowing cached HTML to be served while online after a deploy."
- timestamp: 2026-06-12
  observation: "public/sw.js also used cache version v2, so old pages-v2 cached documents would remain available until the worker changed cache versions."

## Eliminated

## Resolution

- root_cause: "The service worker could serve stale cached Next.js HTML while online. After a deployment, that HTML can reference chunk filenames from a previous build that no longer exist on the server, causing 404 text/plain script responses and strict MIME execution failures."
- fix: "Changed document navigation caching from stale-while-revalidate to network-first with offline fallback, and bumped the service worker cache version from v2 to v3 to evict stale page caches."
- verification: "npm test -- tests/unit/pwa-service-worker.test.ts passed; node --check public/sw.js passed. npm run lint still fails on pre-existing unrelated repo-wide lint errors."
- files_changed: "public/sw.js; tests/unit/pwa-service-worker.test.ts"
