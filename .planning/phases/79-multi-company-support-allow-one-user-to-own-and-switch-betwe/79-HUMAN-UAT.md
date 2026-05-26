---
status: partial
phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
source: [79-VERIFICATION.md]
started: 2026-05-25
updated: 2026-05-25
---

## Current Test

[awaiting human testing]

## Tests

### 1. Single-company user sees no regression in /dashboard
expected: Sign in as a user that has exactly one `companies` row (the pre-existing backfilled membership). The `/dashboard` page renders identically to its pre-Phase-79 state — same tier badge, same usage meters, same nav, same data — even though the layout now reads via `getActiveCompany()` instead of `getCachedCompany(claims.sub)`. No client-visible difference. No new console errors. The `active_company_id` cookie is set on first load (visible in DevTools → Application → Cookies) and re-used on refresh.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0
