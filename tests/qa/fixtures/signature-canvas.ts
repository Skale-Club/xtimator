import type { Locator, Page } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }

const SETTLE_MS = 100
const TIMEOUT_MS = 10_000

const rounded = (box: Box) => [box.x, box.y, box.width, box.height].map(Math.round).join(',')

function insideViewport(box: Box, viewport: { width: number; height: number } | null) {
  if (!viewport) return true
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height
}

/**
 * Draw one stroke on a signature canvas once its layout is stable.
 *
 * On phones the sign dialog is a bottom sheet that slides in for ~280 ms. A box measured
 * mid-animation sits below the viewport, the pointerdown lands outside the sheet and
 * Radix closes the dialog. Wait for two reads >= 100 ms apart to agree (to 1 px) and for
 * the box to be fully inside the viewport before drawing.
 */
export async function drawSignatureStroke(page: Page, canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded()
  const deadline = Date.now() + TIMEOUT_MS
  let previous: string | null = null
  let box: Box | null = null
  for (;;) {
    const current = await canvas.boundingBox()
    const key = current ? rounded(current) : null
    if (current && key === previous && insideViewport(current, page.viewportSize())) {
      box = current
      break
    }
    if (Date.now() >= deadline) {
      throw new Error(`Signature canvas never settled inside the viewport (last box ${key ?? 'none'}, viewport ${JSON.stringify(page.viewportSize())})`)
    }
    previous = key
    await page.waitForTimeout(SETTLE_MS)
  }
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.6)
  await page.mouse.down()
  for (const [x, y] of [[0.25, 0.3], [0.4, 0.7], [0.6, 0.25], [0.8, 0.6]]) {
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 3 })
  }
  await page.mouse.up()
}
