---
status: resolved
trigger: "Scheduled Cron Jobs GitHub Actions workflow repeatedly fails with HTTP 307 responses that redirect cron endpoints to /?auth=login."
created: 2026-06-28
updated: 2026-06-28
---

# Debug Session: scheduled-cron-auth-redirect

## Symptoms

- expected_behavior: "GitHub Actions calls /api/cron/* with the CRON_SECRET Bearer token and receives HTTP 200."
- actual_behavior: "Every scheduled request receives HTTP 307 and is redirected to /?auth=login."
- error_messages:
  - "[/api/cron/trial-warning-emails] failed after 3 attempts (HTTP 307)"
  - "Last response body: /?auth=login"
- timeline: "Four consecutive scheduled runs failed on 2026-06-27 after middleware.ts was reintroduced."
- reproduction: "Call a production /api/cron/* endpoint without a Supabase session while supplying the valid CRON_SECRET Bearer token."

## Current Focus

- hypothesis: "Confirmed: middleware.ts classified all /api paths as Supabase-session protected and redirected cron requests before route-level Bearer authentication executed."
- test: "Regression tests exercise all four /api/cron/* paths, a similarly prefixed non-cron path, and an ordinary private API path."
- expecting: "Cron endpoints bypass the Supabase session guard while all other API paths remain protected."
- next_action: "Commit, push, and manually dispatch the Scheduled Cron Jobs workflow."

## Evidence

- timestamp: 2026-06-28
  observation: "GitHub Actions run 28287189828 received HTTP 307 three times from /api/cron/trial-warning-emails and the response body was /?auth=login."
- timestamp: 2026-06-28
  observation: "middleware.ts includes /api in PROTECTED_ROUTE_PREFIXES and redirects unauthenticated protected requests before the route handler runs."
- timestamp: 2026-06-28
  observation: "The cron route independently validates Authorization: Bearer <CRON_SECRET> using isAuthorizedCron()."
- timestamp: 2026-06-28
  observation: "All 27 focused cron/auth tests pass and tsconfig.ci.json typecheck passes."
- timestamp: 2026-06-28
  observation: "Three unrelated tests that timed out under full local parallel load pass 29/29 when rerun together in isolation; the current HEAD also has a green GitHub Actions test run."

## Eliminated

- hypothesis: "SITE_URL or CRON_SECRET is missing from GitHub Actions."
  evidence: "Both variables are present and masked in the failing run; the workflow passes its explicit missing-secret guards."

## Resolution

- root_cause: "The reintroduced middleware protected the entire /api prefix and its redirect guard did not consult isPublicRoute(), so cron requests were redirected to the login page before CRON_SECRET authentication."
- fix: "Classified only exact /api/cron and /api/cron/* paths as middleware-public, consulted isPublicRoute() in the unauthenticated redirect guard, and retained route-level constant-time Bearer authentication."
- verification: "27 focused tests passed; 29 unrelated timeout candidates passed on isolated rerun; npx tsc --noEmit -p tsconfig.ci.json passed."
- files_changed: "middleware.ts; tests/unit/cron-middleware-auth.test.ts"
