---
phase: 07-pdf-sharing-email-settings
plan: 01
subsystem: pdf-generation
tags: [pdf, react-pdf, api-route, branding]
dependency_graph:
  requires: [estimate-queries, supabase-auth, company-data]
  provides: [pdf-document-component, pdf-api-route, getEstimateWithContext]
  affects: [email-attachment-plan-03, share-page-plan-02, download-button]
tech_stack:
  added: ["@react-pdf/renderer ^4.3.0"]
  patterns: [react-pdf-document-component, renderToBuffer-server-side, createElement-in-route-handler]
key_files:
  created:
    - components/pdf/estimate-pdf.tsx
    - app/api/estimates/[id]/pdf/route.ts
  modified:
    - lib/queries/estimate.ts
    - package.json
decisions:
  - "Helvetica (built-in) used as PDF font -- no custom font registration needed"
  - "createElement used instead of JSX in route handler for renderToBuffer compatibility"
  - "Client extracted from Supabase join array with Array.isArray guard"
  - "Filename sanitized with regex to remove special characters"
metrics:
  duration: "5min"
  completed: "2026-04-10"
---

# Phase 7 Plan 1: PDF Generation Pipeline Summary

Branded PDF document component with @react-pdf/renderer and authenticated GET API route returning downloadable PDF binary.

## One-liner

EstimatePDF component with branded header, line-item tables, totals, terms, and page numbers; GET /api/estimates/[id]/pdf route authenticates and returns PDF binary via renderToBuffer.

## What was built

### Task 1: EstimatePDF Document Component (components/pdf/estimate-pdf.tsx)

- **Props interface**: EstimatePDFProps accepting EstimateWithSections, company info, client info, project name/type
- **Header**: Company logo (Image if logo_url exists), company name in brand color, contact info (phone | email | website), address -- `fixed` on every page
- **Project info**: Project name, type, estimate date (formatted), version number
- **Client info**: "Bill To" block with name, email, phone, address
- **Summary**: Rendered if non-null
- **Sections**: Each section gets brand-colored header, 5-column table (Description, Qty, Unit, Unit Price, Total) with alternating row backgrounds (#f9fafb / white), section subtotal row
- **Totals block**: Right-aligned subtotal, conditional discount line (percentage or flat), conditional tax line with percentage, bold grand total in brand color
- **Terms section**: Payment terms, timeline, warranty, notes -- each rendered if non-null
- **Footer**: "Page X of Y" centered at bottom using `render` prop on fixed Text element
- **Styling**: Helvetica font, 40pt margins, professional typography, brand_primary_color accent throughout
- **Helper**: `formatCurrency()` using Intl.NumberFormat for $X,XXX.XX format
- **Helper**: `formatAddress()` combining address/city/state/zip with proper formatting

### Task 2: GET /api/estimates/[id]/pdf Route Handler

- **Auth**: getClaims() pattern via createClient() -- returns 401 if not authenticated
- **Data fetch**: `getEstimateWithContext()` new query function in lib/queries/estimate.ts
  - Fetches estimate with sections+items via existing getEstimateById
  - Fetches project with client join (name, email, phone, address fields)
  - Fetches company branding info (name, logo_url, brand_primary_color, contact fields)
- **Client extraction**: Handles Supabase join returning array with Array.isArray guard
- **PDF render**: createElement(EstimatePDF, props) + renderToBuffer for server-side generation
- **Response**: Binary PDF with Content-Type: application/pdf, Content-Disposition: attachment, Cache-Control: no-store
- **Filename**: Sanitized project name (alphanumeric + spaces + hyphens only, max 50 chars)
- **Error handling**: try/catch with 500 JSON response on failure

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all data sources are wired to real Supabase queries.

## Manual Steps Required

**IMPORTANT**: Bash was denied during this session. The following must be run manually:

1. `npm install @react-pdf/renderer` -- package.json was updated but node_modules not installed
2. `npx tsc --noEmit` -- type checking was not verified
3. Git commits for both tasks need to be created

## Self-Check: DEFERRED

Self-check requires Bash access to verify commits exist. Files were created and can be verified by the orchestrator.

**Files verified via Read tool:**
- FOUND: components/pdf/estimate-pdf.tsx (310 lines)
- FOUND: app/api/estimates/[id]/pdf/route.ts (74 lines)
- FOUND: lib/queries/estimate.ts (157 lines, with getEstimateWithContext added)
- FOUND: package.json (updated with @react-pdf/renderer)
