// lib/estimate/pagination/engine.ts
//
// Phase 184 Plan 02 (PGBRK-01/02) — the ONE deterministic function that
// decides which blocks land on which page. STUB — Task 2 of Plan 184-02
// replaces this body with the real maximal-keep-together-chain algorithm.
import type { PageBlock, PageConstraints, PageAssignment } from './types'
import type { MeasurementProvider } from './measure/types'

export function computePageBreaks(
  blocks: PageBlock[],
  constraints: PageConstraints,
  measurementProvider: MeasurementProvider
): PageAssignment[] {
  throw new Error('computePageBreaks: not yet implemented — see Plan 184-02 Task 2')
}
