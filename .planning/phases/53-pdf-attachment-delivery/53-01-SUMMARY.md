---
phase: 53-pdf-attachment-delivery
plan: 01
subsystem: api
tags: [whatsapp, pdf, storage, supabase, react-pdf, tdd]

requires:
  - phase: 07-pdf-sharing-email-settings
    provides: EstimatePDF component and getEstimateWithContext query pattern
  - phase: 44-outbound-client-delivery
    provides: delivery_format column on company_whatsapp with existing CHECK constraint

provides:
  - generateAndUploadEstimatePDF helper that renders PDF, uploads to Supabase pdfs bucket, returns 24h signed URL
  - buildPdfFilename helper that sanitizes client names for WhatsApp document filenames
  - DB migration extending delivery_format CHECK to include 'pdf_attachment'
  - Wave 0 test stubs (9 tests, RED → GREEN) for WAPDF-02 and WAPDF-04

affects:
  - 53-02-PLAN (Plan 02 wires generateAndUploadEstimatePDF into confirm.ts handleSend)

tech-stack:
  added: []
  patterns:
    - "Service-role supabase injected by caller — pdf-delivery.ts never calls requireServiceClient() internally (webhook context pattern from Phase 41)"
    - "renderToBuffer + getEstimateWithContext direct call — mirrors PDF route pattern but without auth cookies"
    - "Wave 0 stub pattern: test file imports non-existent module to fail RED before implementation"
    - "Timestamp-suffixed storage path for Meta URL cache uniqueness (Meta caches by URL string ~10 min)"

key-files:
  created:
    - lib/whatsapp/pdf-delivery.ts
    - supabase/migrations/20260511000003_phase53_pdf_attachment.sql
    - tests/unit/whatsapp/pdf-delivery.test.ts
  modified: []

key-decisions:
  - "supabase injected by caller (not created internally) — consistent with Phase 41 generate-estimate service extraction pattern for webhook context"
  - "86400s (24h) signed URL TTL — enough window for Meta to fetch the document; Meta caches document messages by URL"
  - "Storage path {companyId}/whatsapp-pdf/{estimateId}-{Date.now()}.pdf — timestamp suffix ensures a new URL on each send (Meta's ~10-min URL cache otherwise reuses old PDFs)"
  - "makeSupabase factory fix: 'signedUrl' in overrides check (not ??) — null ?? default evaluates to default; sentinel pattern required to pass explicit null"
  - "Space-first sanitization in buildPdfFilename: replace spaces with hyphens first, then strip non-alphanumeric/hyphen — produces O'Brien & Sons -> OBrien--Sons as spec requires"

patterns-established:
  - "PDF rendering in webhook context: import renderToBuffer + getEstimateWithContext directly; do NOT HTTP-call /api/estimates/[id]/pdf (requires auth cookies)"
  - "Supabase storage signed URL for WhatsApp document delivery: from('pdfs').createSignedUrl(path, 86400)"

requirements-completed:
  - WAPDF-01
  - WAPDF-02
  - WAPDF-04

duration: 9min
completed: 2026-05-11
---

# Phase 53 Plan 01: PDF Attachment Delivery Infrastructure Summary

**`generateAndUploadEstimatePDF` helper renders estimate PDF via @react-pdf/renderer, uploads to Supabase `pdfs` bucket with 24h signed URL, and `buildPdfFilename` sanitizes client names — foundation for WhatsApp PDF attachment delivery in Plan 02**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-11T10:26:07Z
- **Completed:** 2026-05-11T10:34:27Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Wave 0 test stubs (9 tests) written first and confirmed RED before implementation
- DB migration extending delivery_format CHECK constraint to `('share_link', 'formatted_text', 'pdf_attachment')` — uses DROP+ADD pattern (Postgres cannot ALTER CONSTRAINT)
- `lib/whatsapp/pdf-delivery.ts` implemented — all 9 tests GREEN, no regressions in existing passing tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test stubs (RED)** - `7d15bb3` (test)
2. **Task 2: DB migration** - `659dbdb` (chore)
3. **Task 3: Implementation (GREEN)** - `f52b101` (feat)

## Files Created/Modified

- `tests/unit/whatsapp/pdf-delivery.test.ts` — 9-test suite covering success path, upload failure, signedUrl failure, estimate-not-found, storage path assertion, filename variants
- `supabase/migrations/20260511000003_phase53_pdf_attachment.sql` — DROP+ADD constraint to add pdf_attachment value
- `lib/whatsapp/pdf-delivery.ts` — `generateAndUploadEstimatePDF` + `buildPdfFilename` exports

## Decisions Made

- **supabase injected by caller:** Consistent with Phase 41 webhook pattern — service role SupabaseClient is created by handleSend and passed down; pdf-delivery.ts never calls `requireServiceClient()` internally.
- **86400s TTL for signed URL:** 24h gives Meta plenty of window to fetch; document messages are cached ~10 min by Meta so timestamp suffix in path ensures fresh URL on each re-send.
- **Space-first sanitization:** `replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '')` — converts spaces to hyphens BEFORE stripping other chars, so `O'Brien & Sons!` → `OBrien--Sons` (two hyphens from the spaces surrounding `&`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null-coalescing in makeSupabase test factory**
- **Found during:** Task 3 (GREEN phase — running tests after implementation)
- **Issue:** `overrides.signedUrl ?? 'https://...'` — null coalesces to the default, so `makeSupabase({ signedUrl: null })` still returned the real URL. The "throws when signedUrl creation fails" test always resolved instead of rejecting.
- **Fix:** Changed to `'signedUrl' in overrides ? overrides.signedUrl : 'default-url'` sentinel pattern; when `signedUrl: null` explicitly supplied, factory returns `{ data: null, error: null }` making the code throw correctly.
- **Files modified:** `tests/unit/whatsapp/pdf-delivery.test.ts`
- **Verification:** All 9 tests pass GREEN after fix
- **Committed in:** f52b101 (Task 3 commit)

**2. [Rule 1 - Bug] Fixed buildPdfFilename sanitization order**
- **Found during:** Task 3 (GREEN phase — test `strips special characters from client name` failed)
- **Issue:** `replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-')` — `O'Brien & Sons!` produces `OBrien Sons` → `OBrien-Sons` (one hyphen); test expects `OBrien--Sons` (two hyphens from spaces surrounding `&`)
- **Fix:** Reversed order: first `replace(/\s/g, '-')` then `replace(/[^a-zA-Z0-9-]/g, '')` — spaces become individual hyphens before stripping, so `Brien` + `-` + `-` + `Sons` = `OBrien--Sons`
- **Files modified:** `lib/whatsapp/pdf-delivery.ts`
- **Verification:** All 9 tests pass GREEN after fix
- **Committed in:** f52b101 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes are in test helper logic and filename sanitization — no scope creep. All 9 tests pass.

## Issues Encountered

- **Pre-existing failures in buffer/handler/webhook tests:** 3 test files (`buffer.test.ts`, `handler.test.ts`, `webhook-route.test.ts`) fail with `@upstash/redis` import error — pre-existed before this plan (confirmed by stash test). Out of scope per scope boundary rule.

## User Setup Required

**DB migration must be applied before Plan 02 can be tested end-to-end:**
```bash
bunx supabase db push --db-url {DATABASE_URL}
```
Migration file: `supabase/migrations/20260511000003_phase53_pdf_attachment.sql`

## Next Phase Readiness

- Plan 02 can now import `generateAndUploadEstimatePDF` from `@/lib/whatsapp/pdf-delivery`
- `delivery_format: 'pdf_attachment'` can be written to `company_whatsapp` once the migration is applied
- confirm.ts `handleSend` needs updating to branch on `'pdf_attachment'` and call `generateAndUploadEstimatePDF` (Plan 02)

---
*Phase: 53-pdf-attachment-delivery*
*Completed: 2026-05-11*
