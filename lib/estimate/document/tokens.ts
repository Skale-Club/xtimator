// lib/estimate/document/tokens.ts
//
// ENGINE-02 — LETTER page geometry defined ONCE. react-pdf's <Page
// size="LETTER"> resolves 612x792pt (72dpi) internally; the webview's
// print-preview (estimate-document.tsx pageView, estimate-editor.tsx page
// mode) approximates the same page at 96dpi CSS px. This is the ONE place
// both numbers are derived from — no second hand-copied literal is allowed
// anywhere else (tests/unit/estimate/pt-px-conversion-source.test.ts
// enforces this via static grep).
export const PT_PER_PX = 72 / 96
export const PX_PER_PT = 96 / 72
export const LETTER_WIDTH_PT = 612
export const LETTER_HEIGHT_PT = 792
export const LETTER_WIDTH_PX = LETTER_WIDTH_PT * PX_PER_PT // 816
export const LETTER_HEIGHT_PX = LETTER_HEIGHT_PT * PX_PER_PT // 1056

// ENGINE-03 — per-template design tokens. Plain string/numeric values ONLY —
// never a StyleSheet or Tailwind-class object (Pattern 1: DOM and react-pdf
// are not interchangeable interpreters of a shared style object). Scoped
// this phase to the font-family pair, the one StyleSheet value cleanly
// shared-by-template-identity across both PDF renderers today.
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'

export interface EstimateDesignTokens {
  fontFamily: string
  fontFamilyBold: string
  /** Correction 1 (183-RESEARCH.md) — Classic gives its title banner and
   *  section headers a solid backgroundColor: brandColor fill; Modern uses
   *  a hairline/accent-only treatment with NO fill, by design. Static per
   *  template — consumed by components/pdf/shared/pdf-section-block.tsx
   *  and the title-banner component (Plan 183-04) instead of each call
   *  site re-deciding which template it is. */
  solidHeaderFill: boolean
}

export const ESTIMATE_DESIGN_TOKENS: Record<EstimateTemplateId, EstimateDesignTokens> = {
  classic: { fontFamily: 'Inter', fontFamilyBold: 'Inter-Bold', solidHeaderFill: true },
  modern: { fontFamily: 'Lora', fontFamilyBold: 'Lora-Bold', solidHeaderFill: false },
}
