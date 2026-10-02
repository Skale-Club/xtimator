// lib/pdf/language-badge.ts
//
// The PDF header's right column shows a language chip ("ES", "PT") so the
// recipient knows which language the document is written in. For English —
// the default and by far the common case — it is noise, so it is drawn only
// for non-English documents.
//
// ONE predicate shared by the renderer (components/pdf/shared/pdf-header.tsx
// gates the chip on it) and the measurer (lib/pdf/measure-header-height.ts
// charges the chip's height + the gap above the logo only when it is true),
// the same measure/render pairing as willPdfRenderLogo in pdf-image-support.ts.
// PURE and browser-safe: it is reached from the web preview via
// computeEstimatePageConstraints.
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

export function showsLanguageBadge(language: EstimateLanguage): boolean {
  return language !== 'en'
}
