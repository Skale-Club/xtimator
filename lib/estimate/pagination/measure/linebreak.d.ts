// lib/estimate/pagination/measure/linebreak.d.ts
//
// Phase 184 Plan 03 — 'linebreak' ships no bundled types and no @types/linebreak
// package exists on npm (unlike 'fontkit', which has @types/fontkit as a dev
// dependency). Minimal ambient module declaration, scoped to the ONE shape
// estimator.ts actually uses (`new LineBreaker(text).nextBreak()`), co-located
// here (inside lib/**) so it's picked up by tsconfig.ci.json's scoped include
// list — a types/*.d.ts file would NOT be, since that config's own `include`
// array doesn't list the top-level types/ directory.
declare module 'linebreak' {
  interface LineBreak {
    position: number
    required: boolean
  }

  export default class LineBreaker {
    constructor(text: string)
    nextBreak(): LineBreak | null
  }
}
