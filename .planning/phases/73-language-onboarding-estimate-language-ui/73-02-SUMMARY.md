---
phase: 73-language-onboarding-estimate-language-ui
plan: 02
subsystem: ui
tags: [i18n, language, pdf, estimate, capture, inngest]

# Dependency graph
requires:
  - phase: 52-per-estimate-language
    provides: resolveEstimateLanguage cascade, isSupportedLanguage type guard, EstimateLanguage type, DB columns (estimates.language, clients.preferred_language, companies.default_estimate_language)
  - phase: 67-inngest-background-ai-jobs
    provides: EstimateGeneratePayload, generateEstimateJob Inngest function

provides:
  - EstimateLanguageSelector UI component (Globe + Select dropdown, app-language seeded default)
  - language param wired end-to-end: UI → /api/generate-estimate → EstimateGeneratePayload → Inngest function → generateEstimateForProject options.language
  - EstimatePDF fully i18n'd: PDF_LABELS map (EN/PT/ES), locale-aware currency + date formatting for all three render paths (pdf/route, send/route, pdf-delivery)
  - Estimate.language TypeScript field added to Estimate interface (bug fix — Phase 52 added DB column but TypeScript type was never updated)

affects: [pdf generation, estimate generation, capture recorder, estimate tab, whatsapp delivery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PDF_LABELS static map: plain object lookup for @react-pdf/renderer (no React context in server-side renderer)"
    - "locale-aware formatCurrency/formatDate: accept locale string param, default to en-US"
    - "EstimateLanguageSelector: compact Globe+Select with app-language-seeded default state"

key-files:
  created:
    - components/estimate/estimate-language-selector.tsx
  modified:
    - lib/inngest/events.ts
    - lib/inngest/functions/generate-estimate.ts
    - app/api/generate-estimate/route.ts
    - components/workspace/estimate/estimate-tab.tsx
    - components/capture/capture-recorder.tsx
    - components/pdf/estimate-pdf.tsx
    - app/api/estimates/[id]/pdf/route.ts
    - app/api/estimates/[id]/send/route.ts
    - lib/whatsapp/pdf-delivery.ts
    - lib/queries/estimate.ts
    - tests/unit/utils/estimate-template.test.ts

key-decisions:
  - "PDF_LABELS static map (not React context) — @react-pdf/renderer runs server-side, no context available"
  - "EstimateLanguageSelector seeds default from app language (layer 4 of SEED-016 cascade) — user can override before generating"
  - "language field in EstimateGeneratePayload is optional — existing callers (WhatsApp Inngest) not broken"
  - "Estimate.language added to TypeScript interface as required field — DB has NOT NULL DEFAULT 'en' so all existing rows have a value"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-05-19
---

# Phase 73 Plan 02: Estimate Language UI Summary

**Language selector wired end-to-end from capture recorder and estimate tab through Inngest dispatch to EstimatePDF with full EN/PT/ES label i18n and locale-aware currency/date formatting.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-19T09:59:07Z
- **Completed:** 2026-05-19T10:10:00Z
- **Tasks:** 3
- **Files modified:** 11 (+ 1 created)

## Accomplishments

### Task 1: Wire language param through API + Inngest

- `EstimateGeneratePayload` gains optional `language?: 'en' | 'pt' | 'es'`
- `/api/generate-estimate` route reads `body.language`, validates with `isSupportedLanguage()`, forwards in payload
- Inngest `generateEstimateJob` extracts `language` and passes as `options.language` to `generateEstimateForProject()`

### Task 2: Language selector UI (capture recorder + estimate tab)

- New `EstimateLanguageSelector` component: compact Globe icon + shadcn Select with EN/PT/ES options
- `estimate-tab.tsx`: `estimateLanguage` state seeded from app language (PT/ES if active, else EN), selector shown in the "no estimate" CTA card, language passed to `fetch('/api/generate-estimate')`
- `capture-recorder.tsx`: same pattern — language state + selector in RecorderBody, wired into all three generation paths (audio pipeline, text-only, photos-only) and both `triggerEstimateGeneration` + `runPipeline` useCallback deps

### Task 3: EstimatePDF i18n (static labels + locale-aware formatting)

- `PDF_LABELS` static map for EN/PT/ES covering all structural PDF labels: ESTIMATE/ORÇAMENTO/PRESUPUESTO, Project, Bill To, Description, Qty, Unit, Unit Price, Total, Section Subtotal, Subtotal, Discount, Tax, Grand Total, Payment Terms, Timeline, Warranty, Notes, Page N of M, Date, Estimate #
- `CURRENCY_LOCALE` and `DATE_LOCALE` maps: `en-US`, `pt-BR`, `es-MX`
- `formatCurrency` and `formatDate` accept locale param (default `en-US`)
- `EstimatePDFProps` adds optional `language` prop
- `EstimatePDF` component uses `L = PDF_LABELS[language]`, `fmt = formatCurrency(v, currencyLocale)`, `fmtDate = formatDate(s, dateLocale)`
- All three PDF render sites updated: `pdf/route.ts`, `send/route.ts`, `lib/whatsapp/pdf-delivery.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Estimate.language missing from TypeScript Estimate interface**
- **Found during:** Task 3 — TypeScript error when accessing `estimate.language`
- **Issue:** Phase 52 added `estimates.language TEXT NOT NULL DEFAULT 'en'` DB column but never updated the `Estimate` interface in `lib/queries/estimate.ts`
- **Fix:** Added `language: 'en' | 'pt' | 'es'` field to Estimate interface; also added optional `payment_status`, `paid_at`, `payment_amount_cents` fields that Phase 70 added to DB but also missed from the interface
- **Files modified:** `lib/queries/estimate.ts`, `tests/unit/utils/estimate-template.test.ts`
- **Commit:** 461035c

## Commits

| Hash | Message |
|------|---------|
| b3806f6 | feat(73-02): wire language param through generate-estimate API and Inngest |
| 6652093 | feat(73-02): add language selector to capture recorder and estimate tab |
| 461035c | feat(73-02): i18n EstimatePDF static labels + locale-aware currency/date formatting |

## Self-Check: PASSED

All 7 key files exist. All 3 commits verified in git history.
