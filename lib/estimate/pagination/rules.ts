// lib/estimate/pagination/rules.ts
//
// Phase 184 Plan 02 (PGBRK-01/02) — pure predicates over PageBlock. No
// measurement, no fontkit, no react-pdf. Both predicates are trivial
// one-line passthroughs over the type contract in ./types.ts.
import type { PageBlock } from './types'

export function isAtomic(block: PageBlock): boolean {
  return block.atomic
}

export function isPage1Only(block: PageBlock): boolean {
  return !!block.page1Only
}
