// lib/estimate/pagination/measure/safety-margin.ts
//
// Plan 184-01, Task 2 (PGBRK-05) — measurement-drift safety margin, DERIVED
// from a real Chromium-vs-fontkit spike (scripts/pagination-drift-spike.ts),
// NOT guessed. Full console.table output + go/no-go decision + application
// semantics are recorded verbatim in
// .planning/phases/184-consolidated-pagination-engine/184-DRIFT-REPORT.md
// (spike run: 2026-07-28, max observed |domLines - fontkitLines| drift = 1,
// on the 'single-long-token' sample).
//
// APPLICATION SEMANTICS (see 184-DRIFT-REPORT.md's "Margin Application
// Semantics" section for the full rationale): this constant is consumed as a
// single FLAT PER-PAGE pt height reserve by the caller — Plan 184-02's
// PageConstraints.safetyMarginPt, subtracted ONCE from each page's usable
// content height. It is NEVER added per-block or per-measured-text-field.
//
// This file has ZERO imports by design (tests/unit/pagination/measure/
// safety-margin.test.ts asserts this) — a plain numeric constant only.
export const SAFETY_MARGIN_LINES = 1
