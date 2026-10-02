// Pure geometry helpers for components/share/signature-pad.tsx, extracted so
// the coordinate mapping (the part that used to stretch strokes) is unit
// testable without a canvas. No DOM access in here.

export interface Point {
  x: number
  y: number
}
export type Stroke = Point[]

/** Fixed export bitmap — the PNG that is stored and drawn into the PDF.
 *  3.75:1 matches the PDF signature box (150x40pt, pdf-signature-block.tsx),
 *  so react-pdf's `objectFit: 'contain'` fills it instead of letterboxing. */
export const SIGNATURE_EXPORT_WIDTH = 600
export const SIGNATURE_EXPORT_HEIGHT = 160
const EXPORT_MARGIN_PX = 12
const MIN_DPR = 1
const MAX_DPR = 3

/** Pen width in the on-screen (CSS pixel) coordinate space. */
export const PEN_WIDTH_CSS = 2.5

/**
 * Backing-store size for a canvas displayed at cssWidth x cssHeight. The
 * bitmap is the displayed size times devicePixelRatio (clamped so a 4x
 * display can't allocate a huge buffer), which keeps one bitmap pixel per
 * device pixel and, crucially, the SAME aspect ratio as the displayed box —
 * so nothing is stretched.
 */
export function computeBitmapSize(cssWidth: number, cssHeight: number, dpr: number) {
  const d = Number.isFinite(dpr) ? Math.min(MAX_DPR, Math.max(MIN_DPR, dpr)) : 1
  return {
    width: Math.max(1, Math.round(cssWidth * d)),
    height: Math.max(1, Math.round(cssHeight * d)),
    dpr: d,
  }
}

/**
 * Pointer position in the canvas' logical CSS-pixel space (the space the
 * context is drawn in after ctx.scale(dpr, dpr)). `rect` is the element's
 * getBoundingClientRect(); the ratio term only matters if the rect differs
 * from the logical size (e.g. a CSS transform) and is 1 otherwise.
 */
export function clientToCanvasPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  cssWidth: number,
  cssHeight: number
): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: (clientX - rect.left) * (cssWidth / rect.width),
    y: (clientY - rect.top) * (cssHeight / rect.height),
  }
}

/**
 * Uniform "contain" transform mapping an old drawing box onto a new one:
 * one scale factor for BOTH axes (never stretches), centered. Used to keep an
 * existing signature intact when the canvas is resized (rotation, window
 * resize).
 */
export function fitTransform(
  from: { width: number; height: number },
  to: { width: number; height: number }
) {
  if (from.width <= 0 || from.height <= 0) return { scale: 1, offsetX: 0, offsetY: 0 }
  const scale = Math.min(to.width / from.width, to.height / from.height)
  return {
    scale,
    offsetX: (to.width - from.width * scale) / 2,
    offsetY: (to.height - from.height * scale) / 2,
  }
}

export function transformStrokes(
  strokes: Stroke[],
  t: { scale: number; offsetX: number; offsetY: number }
): Stroke[] {
  return strokes.map((s) => s.map((p) => ({ x: p.x * t.scale + t.offsetX, y: p.y * t.scale + t.offsetY })))
}

export function strokesBounds(strokes: Stroke[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    for (const p of s) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

/**
 * Where to draw the strokes inside the fixed-size export bitmap: the
 * signature's bounding box is scaled uniformly (never stretched) to fit the
 * 3.75:1 export frame with a margin, and centered. The result is independent
 * of the on-screen canvas size, so every device produces an identically
 * proportioned image for the PDF.
 */
export function computeExportLayout(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  exportWidth = SIGNATURE_EXPORT_WIDTH,
  exportHeight = SIGNATURE_EXPORT_HEIGHT
) {
  const boxW = Math.max(bounds.maxX - bounds.minX, 1)
  const boxH = Math.max(bounds.maxY - bounds.minY, 1)
  const availW = exportWidth - EXPORT_MARGIN_PX * 2
  const availH = exportHeight - EXPORT_MARGIN_PX * 2
  // Cap upscaling so a tiny scribble doesn't become a fat blob.
  const scale = Math.min(availW / boxW, availH / boxH, 4)
  return {
    scale,
    offsetX: (exportWidth - boxW * scale) / 2 - bounds.minX * scale,
    offsetY: (exportHeight - boxH * scale) / 2 - bounds.minY * scale,
    lineWidth: Math.min(5, Math.max(2, PEN_WIDTH_CSS * scale)),
  }
}
