/**
 * Plan 184-01, Task 2 — PGBRK-05 measurement-drift spike.
 *
 * Quantifies the drift between:
 *   (a) fontkit + linebreak's server-side line-count estimate (the exact
 *       formula Plan 184-03's estimator will use), and
 *   (b) a REAL Chromium DOM's wrapped-line count for the SAME vendored TTF,
 *       via @font-face + Range.getClientRects().
 *
 * Standalone script — deliberately does NOT use playwright.config.ts (no dev
 * server, no auth storage state; see playwright.config.ts's webServer/auth
 * coupling). Launches its own `chromium` instance directly.
 *
 * Usage:
 *   npx tsx scripts/pagination-drift-spike.ts
 *
 * Output: a console.table of { label, fontkitLines, domLines, drift } for
 * each representative sample, plus the derived safetyMarginLines. The
 * verbatim output is committed to
 * .planning/phases/184-consolidated-pagination-engine/184-DRIFT-REPORT.md.
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// fontkit ships ONLY named ESM exports (no default) — a namespace import
// mirrors what `require('fontkit')` returns (confirmed empirically against
// the installed fontkit@2.0.4 while writing Task 1's arithmetic test).
import * as fontkit from 'fontkit'
import LineBreaker from 'linebreak'
import { PX_PER_PT } from '../lib/estimate/document/tokens'

const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'inter', 'Inter-Regular.ttf')
const FONT_BASE64 = readFileSync(FONT_PATH).toString('base64')

// openSync returns Font | FontCollection; our vendored TTFs are single fonts.
// Mirrors lib/estimate/pagination/measure/estimator.ts's narrowing.
function assertSingleFont(f: ReturnType<typeof fontkit.openSync>): fontkit.Font {
  if (!('layout' in f)) throw new Error(`${FONT_PATH} resolved to a font collection, not a single font`)
  return f
}
const font = assertSingleFont(fontkit.openSync(FONT_PATH))

// Representative estimate text samples — short/long/accented/numeric-heavy/
// single-long-token, per 184-RESEARCH.md's "Spike Design (PGBRK-05)" SAMPLES
// array, each at Classic's colDescription width (213pt) and fontSize 9pt
// (matching tableCellText's live fontSize).
const SAMPLES: { label: string; text: string; fontSizePt: number; widthPt: number }[] = [
  { label: 'short-description', text: 'Replace kitchen faucet', fontSizePt: 9, widthPt: 213 },
  {
    label: 'long-description',
    text: 'Full demolition and reframing of the north wall including electrical rough-in and drywall patching',
    fontSizePt: 9,
    widthPt: 213,
  },
  {
    label: 'accented',
    text: 'Instalação de piso vinílico com acabamento acústico e rodapé embutido',
    fontSizePt: 9,
    widthPt: 213,
  },
  {
    label: 'numeric-heavy',
    text: '2x 4x8 sheets @ $48.99/ea, 12x #10-24 x 1.5" screws, tax 8.25%',
    fontSizePt: 9,
    widthPt: 213,
  },
  {
    label: 'single-long-token',
    text: 'https://example.com/very/long/unbroken/url/segment/that/might/not/wrap/cleanly',
    fontSizePt: 9,
    widthPt: 213,
  },
]

/** Greedy UAX#14 line-packer — the exact reference algorithm hand-verified
 * against public/fonts/inter/Inter-Regular.ttf in Task 1's arithmetic test
 * (tests/unit/pagination/measure/fontkit-arithmetic.test.ts). */
function estimateLineCount(
  text: string,
  fontArg: fontkit.Font,
  fontSizePt: number,
  maxWidthPt: number
): number {
  if (text.length === 0) return 0
  const scale = fontSizePt / fontArg.unitsPerEm
  const breaker = new LineBreaker(text)
  let lineWidthPt = 0
  let lines = 1
  let last = 0
  let bk: { position: number } | null
  while ((bk = breaker.nextBreak())) {
    const chunk = text.slice(last, bk.position)
    const { advanceWidth } = fontArg.layout(chunk)
    const chunkWidthPt = advanceWidth * scale
    if (lineWidthPt + chunkWidthPt > maxWidthPt && lineWidthPt > 0) {
      lines += 1
      lineWidthPt = chunkWidthPt
    } else {
      lineWidthPt += chunkWidthPt
    }
    last = bk.position
  }
  return lines
}

async function measureDomLineCount(
  page: import('@playwright/test').Page,
  text: string,
  fontSizePt: number,
  widthPt: number
): Promise<number> {
  // pt -> px through tokens.ts's OWN PX_PER_PT conversion — no second
  // hand-derived ratio (184-RESEARCH.md Pitfall 2 / PITFALLS.md).
  const widthPx = widthPt * PX_PER_PT
  const fontSizePx = fontSizePt * PX_PER_PT
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          @font-face { font-family: 'Inter'; src: url(data:font/ttf;base64,${FONT_BASE64}); }
          #probe { font-family: 'Inter'; font-size: ${fontSizePx}px; width: ${widthPx}px; line-height: 1; }
        </style>
      </head>
      <body>
        <div id="probe">${text}</div>
      </body>
    </html>
  `)
  // Wait for the @font-face to actually load before measuring — otherwise
  // the browser measures with its fallback font, not the real vendored TTF.
  await page.evaluate(() => (document as Document).fonts.ready)
  return await page.evaluate(() => {
    const el = document.getElementById('probe')!
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = range.getClientRects() // one rect per wrapped visual line
    return rects.length
  })
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const results: { label: string; fontkitLines: number; domLines: number; drift: number }[] = []
  for (const s of SAMPLES) {
    const fontkitLines = estimateLineCount(s.text, font, s.fontSizePt, s.widthPt)
    const domLines = await measureDomLineCount(page, s.text, s.fontSizePt, s.widthPt)
    results.push({ label: s.label, fontkitLines, domLines, drift: domLines - fontkitLines })
  }
  await browser.close()
  console.table(results)
  const safetyMarginLines = Math.max(...results.map((r) => Math.abs(r.drift)))
  console.log(
    `Recommended safety margin: ${safetyMarginLines} extra line(s) of buffer per estimated block (max observed |drift| across ${results.length} samples).`
  )
}

main().catch((err) => {
  console.error('pagination-drift-spike FAILED:', err)
  process.exit(1)
})
