// components/workspace/estimate/preview-template/units.ts
//
// pt -> px helpers both templates use to restate the PDF StyleSheets' numbers.
// The preview is a PRINT preview: every size, spacing and letter-spacing is the
// PDF's pt value times PX_PER_PT, and weights are only 400 / 700 (the PDF
// registers just Inter/Inter-Bold and Lora/Lora-Bold — lib/pdf/register-fonts.ts).
import type { CSSProperties } from 'react'
import { LINE_HEIGHT, PX_PER_PT } from '@/lib/estimate/document/tokens'

export const pt = (v: number) => v * PX_PER_PT

/** font-size (+ optional line-height multiplier) in the PDF's pt, as px. */
export const font = (sizePt: number, lineHeight?: number): CSSProperties => ({
  fontSize: pt(sizePt),
  ...(lineHeight ? { lineHeight } : {}),
})

/** letterSpacing in the PDF's pt, as px. */
export const tracking = (spacingPt: number): CSSProperties => ({ letterSpacing: pt(spacingPt) })

/** react-pdf's default line-height multiplier per registered family (font
 *  metrics — tokens.ts LINE_HEIGHT). */
export const INTER_LH = LINE_HEIGHT.Inter
export const LORA_LH = LINE_HEIGHT.Lora
