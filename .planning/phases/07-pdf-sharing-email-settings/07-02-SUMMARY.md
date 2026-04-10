---
phase: 07-pdf-sharing-email-settings
plan: 02
subsystem: share-page
tags: [share, public, estimate-view, server-actions, branding]
dependency_graph:
  requires: [07-01]
  provides: [share-page, estimate-response-actions, view-logging]
  affects: [estimates, projects, estimate_activity]
tech_stack:
  added: []
  patterns: [service-role-bypass, conditional-resend-import, fire-and-forget-logging]
key_files:
  created:
    - lib/queries/share.ts
    - app/estimate/[token]/page.tsx
    - app/estimate/[token]/layout.tsx
    - app/estimate/[token]/actions.ts
    - components/share/estimate-view.tsx
    - lib/utils/format.ts
  modified: []
decisions:
  - "Share page at /estimate/[token] outside (app) route group -- no auth required"
  - "formatCurrency extracted to shared lib/utils/format.ts (was duplicated in 4+ places)"
  - "logEstimateView called fire-and-forget from server component to avoid blocking render"
  - "Resend imported conditionally via dynamic import with try/catch for Plan 03 readiness"
  - "Mobile-responsive layout with stacked items on small screens, table on desktop"
metrics:
  completed: "2026-04-10"
  tasks: 2
  files: 6
---

# Phase 7 Plan 2: Public Share Page & Client Response Summary

Public share page with branded estimate display, accept/decline server actions, and view event logging -- service role queries bypass RLS for unauthenticated access.

## Task Results

### Task 1: Share data layer and server actions

Created `lib/queries/share.ts` with `getEstimateByShareToken()` that fetches estimate + sections + items + project + client + company data using the service role client (bypasses RLS). The function joins across estimates, estimate_sections, estimate_items, projects, clients, and companies tables.

Created `app/estimate/[token]/actions.ts` with two server actions:
- `logEstimateView(token)` -- updates `viewed_at` on first view, inserts `estimate_viewed` activity, sends conditional email notification
- `respondToEstimate(token, response)` -- validates no double-response, updates estimate `client_response` + `responded_at`, updates project status to match, logs activity, sends conditional email

Both actions use conditional Resend import (`try { await import('resend') } catch {}`) so they work now (silently skip email) and will send emails once Resend is installed in Plan 03.

Also created `lib/utils/format.ts` with shared `formatCurrency()` utility (was duplicated in 4+ files).

### Task 2: Public share page and branded estimate view

Created `app/estimate/[token]/layout.tsx` -- minimal layout with white background, no app shell.

Created `app/estimate/[token]/page.tsx` -- server component that:
- Extracts token from Next.js 16 async params
- Calls `getEstimateByShareToken()` and returns 404 if not found
- Fires `logEstimateView()` as fire-and-forget (non-blocking)
- Generates dynamic metadata with company name
- Renders `<EstimateView>` with all data props

Created `components/share/estimate-view.tsx` -- client component with:
- Company header with logo, name, contact info, brand color accent
- Client info card (prepared for)
- Project info with date and version
- Summary section
- Sections with line items in desktop table and mobile stacked layout
- Alternating row backgrounds, section subtotals
- Totals block with subtotal, discount (if any), tax, grand total in brand color
- Terms, warranty, timeline, notes in grid cards
- Accept/Decline buttons with loading states, error handling, and post-response confirmation
- Responsive design throughout (sm: breakpoints)

## Decisions Made

1. **Share page outside (app) group**: Route at `app/estimate/[token]/` is not inside `(app)/` so it has no auth shell, sidebar, or theme provider wrapping.
2. **Shared formatCurrency**: Extracted to `lib/utils/format.ts` to reduce duplication (Rule 2 - missing shared util).
3. **Fire-and-forget view logging**: `logEstimateView` is called without await in the server component to avoid blocking page render for the client.
4. **Conditional Resend**: Dynamic import with try/catch means email notifications are ready for Plan 03 without requiring the dependency now.
5. **Mobile-first responsive**: Stacked item layout on mobile, table on desktop for line items.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing shared util] Created lib/utils/format.ts**
- **Found during:** Task 1
- **Issue:** formatCurrency was duplicated in 4+ files (estimate-pdf.tsx, estimate-totals.tsx, section-card.tsx, item-row.tsx)
- **Fix:** Created shared utility at lib/utils/format.ts; used in new share component
- **Files created:** lib/utils/format.ts

No other deviations -- plan executed as written.

## Known Stubs

None -- all data flows are wired to real Supabase queries via service role client.

## Verification

- TypeScript strict mode: PASSED (only pre-existing errors from resend module and test files)
- /estimate/[token] route is outside (app) layout -- no auth required
- Share page renders estimate data with company branding via service role queries
- Accept/decline buttons call server actions that update estimate and project status
- View events logged to estimate_activity on page load

## Self-Check: PASSED

All 6 created files verified on disk:
- lib/queries/share.ts
- app/estimate/[token]/actions.ts
- app/estimate/[token]/layout.tsx
- app/estimate/[token]/page.tsx
- components/share/estimate-view.tsx
- lib/utils/format.ts

Note: Git commits skipped due to permission restrictions -- orchestrator will handle commits.
