---
phase: 73-language-onboarding-estimate-language-ui
plan: "05"
subsystem: pdf-rendering
tags: [i18n, pdf, locale, EstimatePDF]
dependency_graph:
  requires: [73-04, 73-02]
  provides: [LANG-ONBOARD-06]
  affects: [components/pdf/estimate-pdf.tsx]
tech_stack:
  added: []
  patterns: [static-label-lookup, Intl-locale-formatters, react-pdf-text-chip]
key_files:
  created: []
  modified:
    - components/pdf/estimate-pdf.tsx
decisions:
  - LANG_INDICATOR uses plain text (EN/PT/ES) rather than emoji flags — react-pdf/renderer does not reliably render Unicode emoji on all platforms
  - CURRENCY_CODE map added (pt→BRL, en/es→USD) — 73-02 implemented locale-aware formatting but left currency hardcoded to USD; plan specifies BRL for PT
  - 73-02 already implemented PDF_LABELS, CURRENCY_LOCALE, DATE_LOCALE, and L.* consumption — plan 73-05 was a delta of three missing items
metrics:
  duration: "2min"
  completed: "2026-05-19"
  tasks_completed: 1
  files_modified: 1
requirements:
  - LANG-ONBOARD-06
---

# Phase 73 Plan 05: EstimatePDF i18n — Language Indicator + Currency Fix Summary

**One-liner:** Added LANG_INDICATOR text chip and per-language currency code to EstimatePDF, completing the i18n that 73-02 had mostly implemented.

## What Was Found Before Acting

The context note warned that 73-02 may have already implemented this plan. Before writing any code, `components/pdf/estimate-pdf.tsx` was read in full. Findings:

**Already present (from 73-02):**
- `PDF_LABELS` static map with EN/PT/ES covering 18 label keys (more than the plan specified)
- `CURRENCY_LOCALE` and `DATE_LOCALE` maps with correct locales per language
- `formatCurrency(value, locale)` and `formatDate(dateStr, locale)` with locale parameter
- Component body: `const L = PDF_LABELS[language] ?? PDF_LABELS.en` + `fmt` / `fmtDate` wrappers
- All JSX uses `L.summary`, `L.total`, `L.notes`, `L.paymentTerms`, `L.timeline`, `L.warranty`, `L.billTo`, etc.
- `language` prop on `EstimatePDFProps` with `language = 'en'` default

**Genuinely missing:**
1. Language indicator chip in PDF header — no `LANG_INDICATOR` or `langBadge` existed
2. Per-language currency code — `formatCurrency` always used `currency: 'USD'` regardless of locale; the plan specifies `BRL` for PT

## Changes Made (Task 1)

**`components/pdf/estimate-pdf.tsx`** — ba4567a

1. Added `LANG_INDICATOR: Record<EstimateLanguage, string>` constant (`en→'EN'`, `pt→'PT'`, `es→'ES'`). Plain text only — emoji flags are unreliable in react-pdf.
2. Added `CURRENCY_CODE: Record<EstimateLanguage, string>` map (`en→'USD'`, `pt→'BRL'`, `es→'USD'`).
3. Updated `formatCurrency(value, locale, currencyCode)` to accept currency code parameter.
4. Added `langBadge` style to the StyleSheet.
5. Added `const langLabel = LANG_INDICATOR[language] ?? 'EN'` and `const currencyCode = CURRENCY_CODE[language] ?? 'USD'` in component body.
6. Updated `fmt` call to pass `currencyCode`.
7. Rendered `<Text style={styles.langBadge}>{langLabel}</Text>` inside the fixed header `View`.

## Verification

```
grep PDF_LABELS components/pdf/estimate-pdf.tsx   → const PDF_LABELS: Record<EstimateLanguage, PdfLabels> = {  ✓
grep LANG_INDICATOR components/pdf/estimate-pdf.tsx → LANG_INDICATOR defined + consumed ✓
grep langBadge components/pdf/estimate-pdf.tsx     → style defined + applied ✓
grep CURRENCY_CODE components/pdf/estimate-pdf.tsx → map defined + consumed ✓
npx tsc --noEmit | grep estimate-pdf               → no TS errors ✓
```

## Deviations from Plan

**1. [Rule 2 - Missing Critical Functionality] Added CURRENCY_CODE for per-language currency symbol**
- **Found during:** Task 1 review
- **Issue:** Plan specifies `BRL` for PT-BR but 73-02 left `currency: 'USD'` hardcoded in `formatCurrency` despite passing the locale
- **Fix:** Added `CURRENCY_CODE` map and updated `formatCurrency` signature to accept `currencyCode` param
- **Files modified:** `components/pdf/estimate-pdf.tsx`
- **Commit:** ba4567a

**2. [Observation] LANG_INDICATOR uses text not emoji flags**
- Plan suggested `'🇺🇸 EN'` format but emoji rendering in react-pdf is platform-dependent (font fallback varies by OS). Used plain `'EN'`, `'PT'`, `'ES'` text chips instead for reliable cross-platform PDF output.

## Known Stubs

None — all labels are wired through PDF_LABELS, all currency/date formatting uses locale-aware Intl APIs, and the language badge renders from real estimate.language data.

## Self-Check: PASSED

- `components/pdf/estimate-pdf.tsx` — confirmed modified (27 insertions in commit ba4567a)
- Commit ba4567a — verified via `git rev-parse --short HEAD`
- TypeScript: `npx tsc --noEmit | grep estimate-pdf` returned no errors
