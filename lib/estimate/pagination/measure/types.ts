// lib/estimate/pagination/measure/types.ts
//
// Phase 184 Plan 02 (PGBRK-05) — framework-agnostic measurement contract,
// shared by this phase's fontkit estimator (Plan 184-03's
// measure/estimator.ts) AND Phase 185's future DOM measurement provider.
// Zero imports — no fontkit, no linebreak, no DOM.
export interface MeasurementProvider {
  /** Returns the number of wrapped visual lines `text` occupies at
   *  `fontSizePt` within `maxWidthPt`, resolving `styleKey` to a concrete
   *  font. Deterministic: identical args -> identical return, every call. */
  lineCount(text: string, styleKey: string, fontSizePt: number, maxWidthPt: number): number
}
