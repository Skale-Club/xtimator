---
phase: 38-custom-domain-db-settings-ui
plan: 02
subsystem: settings-ui
tags: [nextjs, react, typescript, settings, custom-domain, shadcn-ui, react-hook-form]

requires:
  - phase: 38-01
    provides: "saveCustomDomain server action, getCustomDomainSettings query, customDomainSchema"
  - phase: 24-estimate-template-engine-settings-page
    provides: "settings sub-page pattern (server page + client form + entry card)"

provides:
  - "/settings/custom-domain server component page rendering CustomDomainForm"
  - "CustomDomainForm client component with domain input, save, and conditional DNS instructions"
  - "Custom Domain entry card on /settings linking to /settings/custom-domain"

affects:
  - 38-03 (or Phase 39 routing) reads custom_domain set via this UI

tech-stack:
  added: []
  patterns:
    - "useState for local savedDomain — immediate DNS card update pre-router.refresh()"
    - "Apex detection by dot count (2-part = apex, 3+ = subdomain)"
    - "Conditional DNS instructions card (savedDomain truthy guard)"

key-files:
  created:
    - app/(app)/settings/custom-domain/page.tsx
    - components/settings/custom-domain-form.tsx
  modified:
    - app/(app)/settings/page.tsx

key-decisions:
  - "Local useState for savedDomain: updates DNS card immediately post-save before router.refresh() round-trip"
  - "Apex detection by split('.').length === 2 (2 parts = apex e.g. mycompany.com)"
  - "subdomainPart fallback to full domain to handle edge cases in CNAME Name field"

requirements-completed: [DOMAIN-01, DOMAIN-02, DOMAIN-05]

duration: ~5min
completed: 2026-05-10
---

# Phase 38 Plan 02: Settings UI for Custom Domain Summary

**Server component page + client form with DNS instructions + settings entry card — /settings/custom-domain wired end-to-end**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-10T17:54:44Z
- **Completed:** 2026-05-10T18:00:00Z
- **Tasks:** 2 auto + 1 checkpoint (human-verify)
- **Files modified:** 3

## Accomplishments

- Created `app/(app)/settings/custom-domain/page.tsx` — server component mirroring the estimate-templates/page.tsx pattern; fetches getCustomDomainSettings, passes to CustomDomainForm
- Created `components/settings/custom-domain-form.tsx` — client form with react-hook-form + zodResolver wired to saveCustomDomain; conditional DNS instructions card using local useState for immediate update
- DNS instructions show CNAME record (`cname.vercel-dns-0.com`) for subdomains and A-record (`76.76.21.21`) for apex domains
- Added Globe icon entry card to `app/(app)/settings/page.tsx` below Estimate Templates card
- TypeScript compiles clean (npx tsc --noEmit exits 0)
- All 7 custom-domain unit tests remain GREEN

## Task Commits

Each task was committed atomically:

1. **Task 1: /settings/custom-domain page + CustomDomainForm component** — `943afa5` (feat)
2. **Task 2: Add Custom Domain entry card to /settings page** — `73c90e5` (feat)

## Files Created/Modified

- `app/(app)/settings/custom-domain/page.tsx` — Server component page; imports getCustomDomainSettings + CustomDomainForm; export metadata = { title: 'Custom Domain' }
- `components/settings/custom-domain-form.tsx` — Client form: domain Input, Save button with isPending spinner, conditional DNS instructions Card; uses useState(settings.custom_domain) for immediate post-save render
- `app/(app)/settings/page.tsx` — Added Globe import and Custom Domain entry card after Estimate Templates card

## Decisions Made

- Local `useState` for `savedDomain`: Updates the DNS card immediately after `onSubmit` success before `router.refresh()` completes — avoids flash-of-no-DNS-card
- Apex domain detection by `savedDomain.split('.').length === 2`: 2 parts = apex (e.g. `mycompany.com`); 3+ = subdomain (e.g. `estimates.mycompany.com`)
- `subdomainPart` fallback: `savedDomain.split('.').slice(0, -2).join('.') || savedDomain` — handles edge case where split produces empty string
- Existing /settings cards (Price Book, Estimate Templates) left completely unchanged — DOMAIN-05 compliance

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the form is fully wired to `saveCustomDomain` and `getCustomDomainSettings`. DNS instructions are static content (not fetched from a service).

## Self-Check: PASSED

- `app/(app)/settings/custom-domain/page.tsx` — FOUND
- `components/settings/custom-domain-form.tsx` — FOUND
- Task 1 commit `943afa5` — FOUND
- Task 2 commit `73c90e5` — FOUND
- `grep "cname.vercel-dns-0.com" custom-domain-form.tsx` — FOUND (line 137)
- `grep "76.76.21.21" custom-domain-form.tsx` — FOUND (line 130)
- `grep "savedDomain" custom-domain-form.tsx` — FOUND (lines 40, 42, 69-71, 117)
- `grep "custom-domain" app/(app)/settings/page.tsx` — FOUND (line 82)
- TypeScript compile — CLEAN (no errors)
- Custom-domain unit tests — 7/7 PASS

---
*Phase: 38-custom-domain-db-settings-ui*
*Completed: 2026-05-10*
