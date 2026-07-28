// lib/estimate/document/visible-items.ts
//
// Phase 184 Plan 01 (Plan-checker warning 11) — the ONE canonical
// empty-description-filter implementation. Mirrors
// components/pdf/estimate-pdf.tsx:409-414's exact filter
// (`section.items.filter((i) => i.description.trim() !== '')`), which both
// current PDF templates apply inline today.
//
// Plan 184-03's blocksFromModel AND the Plan 184-05 dispatcher both import
// and call this — no third inline re-implementation of the same filter.
import type { DocumentItem, DocumentSection } from '@/lib/estimate/document/model'

export function visibleSectionItems(section: DocumentSection): DocumentItem[] {
  return section.items.filter((i) => i.description.trim() !== '')
}
