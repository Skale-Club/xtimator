/**
 * Plan 185-03, Task 3b — the REAL positional-binding proof jsdom cannot
 * perform (jsdom does no real layout; offsetTop/scrollHeight are always 0
 * there). Mirrors scripts/pagination-drift-spike.ts's standalone-script
 * pattern (184-spike precedent): deliberately does NOT use
 * playwright.config.ts (no dev server, no auth storage state) — launches its
 * own `chromium` instance directly.
 *
 * What this proves: for a hardcoded, genuinely multi-page (>=3 sheets)
 * PageAssignment[]-shaped fixture rendered as real DOM content in normal
 * document flow (tagged with data-page-block-id anchors, exactly like
 * estimate-document.tsx), running the SAME reset-then-snapshot Phase A +
 * pure derivePageOffsets() Phase B algorithm
 * (components/workspace/estimate/paginated-document-overlay.tsx) against a
 * REAL Chromium layout produces decorative sheet rectangles that genuinely
 * contain their own page's first-block anchor — i.e. the visual break
 * points this overlay draws actually line up with the pagination engine's
 * PageAssignment[] for the same document, in a real browser.
 *
 * Usage:
 *   npx tsx scripts/pagination-binding-check.ts
 *
 * Not part of the phase's blocking CI gate (per this project's own
 * established stance that Playwright isn't required to ship — see
 * 185-RESEARCH.md) — a durable, repeatable artifact run manually/on-demand,
 * referenced from 185-VALIDATION.md's proof map.
 */
import { chromium } from '@playwright/test'

// ---------------------------------------------------------------------------
// Fixture — a hardcoded, deliberately multi-page (4-page) PageAssignment[]-
// shaped structure. Each "block" is a fixed-height div (no real text
// measurement needed here — this script proves the POSITIONAL BINDING
// mechanism, not the pagination engine's height math, which is already
// proven by tests/unit/pagination/*).
// ---------------------------------------------------------------------------

interface FixtureBlock {
  id: string
  heightPx: number
}

interface FixturePage {
  pageIndex: number
  blocks: FixtureBlock[]
  continuesTable: boolean
}

const BLOCK_HEIGHT_PX = 300 // deliberately large so a handful of blocks spans several pages
const BLOCKS_PER_PAGE = 4
const PAGE_COUNT = 4

const FIXTURE_PAGES: FixturePage[] = Array.from({ length: PAGE_COUNT }, (_, pageIndex) => ({
  pageIndex,
  blocks: Array.from({ length: BLOCKS_PER_PAGE }, (_, blockIndexOnPage) => ({
    id: `block-${pageIndex}-${blockIndexOnPage}`,
    heightPx: BLOCK_HEIGHT_PX,
  })),
  continuesTable: pageIndex > 0,
}))

const ALL_BLOCKS: FixtureBlock[] = FIXTURE_PAGES.flatMap((p) => p.blocks)

// Reservation constants (px) — arbitrary but realistic stand-ins for
// topReservationPx/bottomReservationPx/continuationHeaderPx (this script
// proves BINDING, not the exact reservation math already covered by
// tests/unit/estimate/derive-page-offsets.test.ts).
const TOP_RESERVATION_PX = 120
const BOTTOM_RESERVATION_PX = 60
const CONTINUATION_HEADER_PX = 30
const PAGE_GAP_PX = 32
const LETTER_HEIGHT_PX = 1056
const LETTER_WIDTH_PX = 816

function buildFixtureHtml(): string {
  const blockDivs = ALL_BLOCKS.map(
    (b) => `<div data-page-block-id="${b.id}" style="height:${b.heightPx}px;border-bottom:1px solid #ccc;">${b.id}</div>`
  ).join('\n')
  return `
    <!doctype html>
    <html>
      <head>
        <style>
          body { margin: 0; font-family: sans-serif; }
          #canvas { position: relative; width: ${LETTER_WIDTH_PX}px; }
          #content { position: relative; }
        </style>
      </head>
      <body>
        <div id="canvas">
          <div id="decoration" style="position:absolute; inset:0; z-index:0; pointer-events:none;"></div>
          <div id="content" style="position:relative; z-index:1;">
            ${blockDivs}
          </div>
        </div>
      </body>
    </html>
  `
}

// ---------------------------------------------------------------------------
// The SAME Phase A/B algorithm as paginated-document-overlay.tsx, hand-
// transcribed for execution inside page.evaluate() (browser context — no
// module imports available there). Kept in exact algorithmic lockstep with
// derivePageOffsets()'s two-pass pure arithmetic; if that function's
// arithmetic ever changes, this transcription must be updated too.
// ---------------------------------------------------------------------------

function derivePageOffsetsBrowserSide(
  measurements: { naturalOffsetsPx: number[]; naturalScrollHeightPx: number; continuesTableByPage: boolean[] },
  opts: { topReservationPx: number; bottomReservationPx: number; continuationHeaderPx: number; pageGapPx: number }
) {
  const { naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage } = measurements
  const { topReservationPx, bottomReservationPx, continuationHeaderPx, pageGapPx } = opts
  const n = naturalOffsetsPx.length

  const sheetHeightPx: number[] = []
  for (let i = 0; i < n; i++) {
    const measuredSpanPx =
      i < n - 1 ? naturalOffsetsPx[i + 1] - naturalOffsetsPx[i] : naturalScrollHeightPx - naturalOffsetsPx[i]
    const reservedPx = topReservationPx + bottomReservationPx + (continuesTableByPage[i] ? continuationHeaderPx : 0)
    sheetHeightPx.push(Math.max(1056, measuredSpanPx + reservedPx)) // 1056 = LETTER_HEIGHT_PX
  }

  // Cascade correction (matches paginated-document-overlay.tsx's
  // derivePageOffsets() exactly) — appliedShiftPx tracks the running sum of
  // margins already written to EARLIER anchors, so each page's OWN margin
  // only contributes the REMAINING delta once real CSS block-flow cascading
  // is accounted for.
  const result: { pageIndex: number; contentTopPx: number; sheetHeightPx: number; spacerMarginTopPx: number }[] = []
  let cumulative = 0
  let appliedShiftPx = 0
  for (let i = 0; i < n; i++) {
    let contentTopPx: number
    let spacerMarginTopPx: number
    if (i === 0) {
      contentTopPx = naturalOffsetsPx[0]
      spacerMarginTopPx = 0
    } else {
      contentTopPx = cumulative + topReservationPx + (continuesTableByPage[i] ? continuationHeaderPx : 0)
      spacerMarginTopPx = Math.max(0, contentTopPx - naturalOffsetsPx[i] - appliedShiftPx)
    }
    appliedShiftPx += spacerMarginTopPx
    result.push({ pageIndex: i, contentTopPx, sheetHeightPx: sheetHeightPx[i], spacerMarginTopPx })
    cumulative += sheetHeightPx[i] + pageGapPx
  }
  return result
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(buildFixtureHtml())

  const firstBlockIdPerPage = FIXTURE_PAGES.map((p) => p.blocks[0].id)
  const continuesTableByPage = FIXTURE_PAGES.map((p) => p.continuesTable)

  const applied = await page.evaluate(
    ({ firstBlockIdPerPage, continuesTableByPage, opts, deriveFnSource }) => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const derivePageOffsetsBrowserSideFn = new Function(`return (${deriveFnSource})`)() as (
        measurements: unknown,
        opts: unknown
      ) => { pageIndex: number; contentTopPx: number; sheetHeightPx: number; spacerMarginTopPx: number }[]

      const content = document.getElementById('content')!

      // Phase A — reset every anchor, force ONE reflow, snapshot the fixed baseline.
      const anchors = firstBlockIdPerPage.map((id) =>
        content.querySelector<HTMLElement>(`[data-page-block-id="${id}"]`)
      )
      anchors.forEach((el) => {
        if (el) el.style.marginTop = ''
      })
      void content.offsetHeight
      const naturalOffsetsPx = anchors.map((el) => el?.offsetTop ?? 0)
      const naturalScrollHeightPx = content.scrollHeight

      // Phase B — pure arithmetic, then ONE batched write.
      const offsets = derivePageOffsetsBrowserSideFn(
        { naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage },
        opts
      )
      offsets.forEach((o, i) => {
        const el = anchors[i]
        if (el) el.style.marginTop = `${o.spacerMarginTopPx}px`
      })

      // Render the decorative sheets as real, absolutely-positioned divs.
      const decoration = document.getElementById('decoration')!
      const LETTER_WIDTH = 816
      offsets.forEach((o) => {
        const sheetTop = o.contentTopPx - opts.topReservationPx
        const div = document.createElement('div')
        div.setAttribute('data-sheet-index', String(o.pageIndex))
        div.style.position = 'absolute'
        div.style.top = `${sheetTop}px`
        div.style.left = '0'
        div.style.width = `${LETTER_WIDTH}px`
        div.style.height = `${o.sheetHeightPx}px`
        div.style.background = 'rgba(0,128,255,0.08)'
        div.style.border = '1px solid rgba(0,128,255,0.4)'
        decoration.appendChild(div)
      })

      return offsets
    },
    {
      firstBlockIdPerPage,
      continuesTableByPage,
      opts: {
        topReservationPx: TOP_RESERVATION_PX,
        bottomReservationPx: BOTTOM_RESERVATION_PX,
        continuationHeaderPx: CONTINUATION_HEADER_PX,
        pageGapPx: PAGE_GAP_PX,
      },
      deriveFnSource: derivePageOffsetsBrowserSide.toString(),
    }
  )

  // Read REAL getBoundingClientRect() for every page's first-block anchor
  // AND its own decorative sheet div.
  const results: { pageIndex: number; anchorTop: number; sheetTop: number; sheetBottom: number; withinRange: boolean }[] =
    []
  for (const p of FIXTURE_PAGES) {
    const anchorRect = await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`[data-page-block-id="${id}"]`)!
      const r = el.getBoundingClientRect()
      return { top: r.top }
    }, p.blocks[0].id)
    const sheetRect = await page.evaluate((idx) => {
      const el = document.querySelector<HTMLElement>(`[data-sheet-index="${idx}"]`)!
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }, p.pageIndex)

    results.push({
      pageIndex: p.pageIndex,
      anchorTop: anchorRect.top,
      sheetTop: sheetRect.top,
      sheetBottom: sheetRect.bottom,
      withinRange: anchorRect.top >= sheetRect.top && anchorRect.top < sheetRect.bottom,
    })
  }

  // Assert no single block's rect straddles two different sheets' rects —
  // for every block, find which sheet (if any) its own top falls within,
  // and confirm its bottom also falls within THAT SAME sheet (or the block
  // is the very last one before the sheet's bottom edge — a block must not
  // visually cross a sheet boundary).
  const straddleChecks: { blockId: string; ok: boolean }[] = []
  for (const block of ALL_BLOCKS) {
    const rect = await page.evaluate((id) => {
      const el = document.querySelector<HTMLElement>(`[data-page-block-id="${id}"]`)!
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }, block.id)

    const containingSheet = results.find((r) => rect.top >= r.sheetTop && rect.top < r.sheetBottom)
    const ok = !!containingSheet && rect.bottom <= containingSheet.sheetBottom + 0.5 // sub-pixel tolerance
    straddleChecks.push({ blockId: block.id, ok })
  }

  await browser.close()

  console.table(results)
  console.table(straddleChecks)

  const bindingFailures = results.filter((r) => !r.withinRange)
  const straddleFailures = straddleChecks.filter((s) => !s.ok)

  if (bindingFailures.length > 0 || straddleFailures.length > 0) {
    console.error(
      `pagination-binding-check FAILED: ${bindingFailures.length} anchor(s) outside their sheet's range, ${straddleFailures.length} block(s) straddling a sheet boundary.`
    )
    process.exit(1)
  }

  console.log(
    `pagination-binding-check PASSED: all ${results.length} page anchors bind correctly within their own decorative sheet, and no block straddles a sheet boundary.`
  )
}

main().catch((err) => {
  console.error('pagination-binding-check FAILED:', err)
  process.exit(1)
})
