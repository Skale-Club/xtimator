---
status: partial
phase: 17-navigation-performance
source: [17-VERIFICATION.md]
started: 2026-05-05T08:55:00Z
updated: 2026-05-05T08:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end perceived navigation latency
expected: |
  - `npm run build && npm start`
  - Log in, open Chrome DevTools → Network → throttle to "Fast 4G"
  - Navigate Dashboard → Clients → Projects/[id] → Settings → back to Dashboard
  - Skeleton appears within ~50ms; meaningful content within ~300ms; no blank screen at any point
  - Stat cards on dashboard pop in independently of project list (visible streaming)
  - Project workspace page header pops first; tabs stream in afterwards
result: [pending]

### 2. Hover-prefetch network behaviour
expected: |
  - Open Chrome DevTools → Network → filter by RSC (or `_rsc=`)
  - Hover over a sidebar nav item without clicking
  - Observe a single prefetch request fires
  - Click the same link — navigates without a second roundtrip
result: [pending]

### 3. revalidateTag end-to-end
expected: |
  - Note the company name shown in the sidebar
  - Settings → change company name → Save
  - Navigate to Dashboard — updated company name appears in the sidebar immediately (not after a 60-second wait)
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
