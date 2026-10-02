// lib/estimate/pagination/engine.ts
//
// Phase 184 Plan 02 (PGBRK-01/02) — the ONE deterministic function that
// decides which blocks land on which page, using MAXIMAL keep-together
// chains, a persistent per-page continuation-header reservation, and a
// per-page (not per-block) safety-margin reserve. Pure function of its 3
// arguments: no wall-clock reads, no randomness, no module-level mutable
// state.
import type { PageBlock, PageConstraints, PageAssignment, TextMeasurement } from './types'
import type { MeasurementProvider } from './measure/types'
import { isPage1Only } from './rules'

/** Phase A — build MAXIMAL keep-together chains via a single linear scan,
 *  exploiting the invariant that keepWith* links only ever connect
 *  ARRAY-ADJACENT blocks (guaranteed by Plan 184-03's blocksFromModel).
 *  This naturally produces a maximal chain for the 1-item-section case:
 *  the header--row link extends the chain to include the row; the SAME
 *  scan then checks row--subtotal (blocks[i+1].keepWithPreviousId ===
 *  blocks[i].id), which ALSO holds, extending the chain again — no
 *  separate union-find needed. */
function buildChains(blocks: PageBlock[]): PageBlock[][] {
  const chains: PageBlock[][] = []
  let i = 0
  while (i < blocks.length) {
    const chain = [blocks[i]]
    while (
      i + 1 < blocks.length &&
      (blocks[i].keepWithNextId === blocks[i + 1].id || blocks[i + 1].keepWithPreviousId === blocks[i].id)
    ) {
      i += 1
      chain.push(blocks[i])
    }
    chains.push(chain)
    i += 1
  }
  return chains
}

/** A single block's effective height contribution: baseHeightPt plus the
 *  wrapped-line contribution for measured (text-bearing) blocks. NO
 *  safety-margin term here — margin is a flat per-page reserve applied
 *  once in computePageBreaks, never added per-block. */
function textHeightPt(m: TextMeasurement, provider: MeasurementProvider): number {
  return provider.lineCount(m.text, m.styleKey, m.fontSizePt, m.maxWidthPt) * m.lineHeightMultiplier * m.fontSizePt
}

function blockHeightPt(block: PageBlock, provider: MeasurementProvider): number {
  let height = block.baseHeightPt
  if (block.measurement) height += textHeightPt(block.measurement, provider)
  // Side-by-side text boxes (photo-row captions): the row is as tall as the tallest.
  if (block.parallelMeasurements && block.parallelMeasurements.length > 0) {
    height += Math.max(...block.parallelMeasurements.map((m) => textHeightPt(m, provider)))
  }
  return height
}

function chainHeightPt(chain: PageBlock[], provider: MeasurementProvider): number {
  return chain.reduce((sum, block) => sum + blockHeightPt(block, provider), 0)
}

export function computePageBreaks(
  blocks: PageBlock[],
  constraints: PageConstraints,
  measurementProvider: MeasurementProvider
): PageAssignment[] {
  const chains = buildChains(blocks)

  // Flat per-page reserve, subtracted ONCE per page — never added per-block.
  // Page 1 carries the FULL header (contentHeightPt); every later page carries
  // the COMPACT header (continuationContentHeightPt), so the budget depends on
  // the page index.
  const effectiveContentHeightFor = (pageIndex: number) =>
    (pageIndex === 0 ? constraints.contentHeightPt : constraints.continuationContentHeightPt) -
    constraints.safetyMarginPt

  // Parallel arrays: pages[n] holds the blocks for page n, heightUsed[n]
  // holds that page's running consumed budget (page1Only charges included).
  const pages: PageBlock[][] = []
  const heightUsed: number[] = []

  const ensurePage0 = () => {
    if (pages.length === 0) {
      pages.push([])
      heightUsed.push(0)
    }
  }

  const startFreshPage = () => {
    pages.push([])
    heightUsed.push(0)
  }

  for (const chain of chains) {
    // page1Only chains (title-banner/info-grid/summary) are always
    // singleton chains by construction: forced onto page 0 unconditionally,
    // in input order, and their height IS charged against page 0's budget
    // (not "free" — see PageBlock.page1Only doc comment in types.ts).
    if (chain.some((member) => isPage1Only(member))) {
      ensurePage0()
      pages[0].push(...chain)
      heightUsed[0] += chainHeightPt(chain, measurementProvider)
      continue
    }

    ensurePage0()

    let currentPageIndex = pages.length - 1
    let isFirstOnPage = pages[currentPageIndex].length === 0
    let reservationPt =
      isFirstOnPage && chain[0].kind === 'item-row' ? constraints.continuationTableHeaderHeightPt : 0
    const availableHeightPt =
      effectiveContentHeightFor(currentPageIndex) - heightUsed[currentPageIndex] - reservationPt
    const thisChainHeightPt = chainHeightPt(chain, measurementProvider)

    if (!(thisChainHeightPt <= availableHeightPt || isFirstOnPage)) {
      // Doesn't fit on the current (non-empty) page — start a fresh page
      // and retry the fit-check there (an empty page always accepts via
      // the safety valve, guaranteeing no infinite loop even for a single
      // atomic block taller than a completely empty page).
      startFreshPage()
      currentPageIndex = pages.length - 1
      isFirstOnPage = true
      reservationPt = chain[0].kind === 'item-row' ? constraints.continuationTableHeaderHeightPt : 0
    }

    pages[currentPageIndex].push(...chain)
    heightUsed[currentPageIndex] += thisChainHeightPt
    // CRITICAL (persistent reservation, Plan-checker blocker 2 fix): once a
    // continuation page's first, reservation-triggering chain is accepted,
    // permanently add the reservation into heightUsed so it constrains
    // every LATER chain placed on this same page too — not just this
    // chain's own fit-check, which would otherwise "forget" it immediately
    // after.
    if (reservationPt > 0) {
      heightUsed[currentPageIndex] += reservationPt
    }
  }

  ensurePage0()

  return pages.map((pageBlocks, pageIndex) => ({
    pageIndex,
    blocks: pageBlocks,
    continuesTable: pageBlocks[0]?.kind === 'item-row',
  }))
}
