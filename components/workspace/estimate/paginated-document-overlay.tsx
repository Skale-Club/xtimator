// components/workspace/estimate/paginated-document-overlay.tsx
//
// Phase 185 Plan 03 (PGMODE-02) — a real, oscillation-free DOM-measurement
// pass that anchors decorative "page sheet" boundaries onto the SAME
// continuous, editable EstimateDocument tree (never a forked/read-only
// copy), matching the shared pagination engine's PageAssignment[] for the
// current document + template.
//
// Split per the plan-checker's Blocker-1 fix: derivePageOffsets() below is a
// genuinely PURE function (plain number arrays in, plain number arrays out —
// zero DOM reads, testable without any jsdom/DOM mocking). The thin
// useLayoutEffect + ResizeObserver shell around it (measureAndApply) is
// DELIBERATELY untested in jsdom (jsdom cannot perform real layout —
// offsetTop/scrollHeight are always 0 there); positional correctness beyond
// the pure-function level is proven by scripts/pagination-binding-check.ts
// (a standalone Playwright script), not by a jsdom component test.
'use client'

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DocumentCompany } from '@/lib/estimate/document/model'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { PageAssignment } from '@/lib/estimate/pagination/types'
import { LABELS as DOC_LABELS } from '@/lib/estimate/document/labels'
import { LETTER_WIDTH_PX, LETTER_HEIGHT_PX, PX_PER_PT, ESTIMATE_PAGE_GEOMETRY } from '@/lib/estimate/document/tokens'
import { measureHeaderHeightPt, CONTINUATION_TABLE_HEADER_HEIGHT_PT } from '@/lib/pdf/measure-header-height'

/** 185-UI-SPEC.md §2's page-gap between sheets — a design constant, already px. */
const PAGE_GAP_PX = 32

// ---------------------------------------------------------------------------
// derivePageOffsets() — PURE function (plan-checker Blocker 3)
// ---------------------------------------------------------------------------

export interface DerivePageOffsetsMeasurements {
  /** offsetTop (px, relative to the content container) of each page's FIRST
   *  block anchor, in the NATURAL (pre-spacer) layout — captured by Phase A
   *  of the effect shell AFTER resetting every anchor's marginTop to '' and
   *  forcing exactly one reflow. One entry per page, same order as `pages`. */
  naturalOffsetsPx: number[]
  /** The content container's natural scrollHeight (px), same reset baseline
   *  — bounds the LAST page's span (no "next page" anchor to measure against). */
  naturalScrollHeightPx: number
  /** Per-page PageAssignment.continuesTable, same order as naturalOffsetsPx. */
  continuesTableByPage: boolean[]
}

export interface DerivePageOffsetsOptions {
  /** (topPaddingPt + measureHeaderHeightPt(company, templateId)) * PX_PER_PT
   *  — PRECOMPUTED IN PX by the caller. This function performs NO unit
   *  conversion internally (plan-checker warning 4 killed a prior draft's
   *  double pt->px conversion of an already-px value). */
  topReservationPx: number
  /** bottomPaddingPt * PX_PER_PT — precomputed in px by the caller. */
  bottomReservationPx: number
  /** CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId] * PX_PER_PT — precomputed
   *  in px by the caller; applied only where continuesTableByPage[i] is true.
   *  NOTE (plan-checker warning 5): safetyMarginPt is DELIBERATELY excluded
   *  from this list — see the function's own doc comment below. */
  continuationHeaderPx: number
  /** 32 (185-UI-SPEC.md §2's page-gap) — a design constant, already px. */
  pageGapPx: number
}

export interface DerivedPageOffset {
  pageIndex: number
  /** Where this page's real content should start (px, relative to the
   *  container). Page 0 always equals its own natural offset — no spacer. */
  contentTopPx: number
  /** max(LETTER_HEIGHT_PX, measured content span + reservations) — the
   *  overflow rule (an accepted web-side deviation: same content per page,
   *  never pixel-identical page heights). */
  sheetHeightPx: number
  /** style.marginTop to write to this page's first-block anchor (0 for page
   *  0; clamped to >= 0 for every other page). Cascade-corrected: already
   *  accounts for every EARLIER page's own marginTop pushing this anchor
   *  down via normal CSS block flow before this page's own margin is
   *  applied — writing all returned values simultaneously (as the shell
   *  does) reproduces contentTopPx[i] exactly, not `contentTopPx[i] +
   *  (sum of every earlier page's spacer)`. */
  spacerMarginTopPx: number
}

/**
 * PURE — zero DOM reads, zero side effects, testable with plain number
 * arrays (no jsdom/DOM mocking required). Two ACYCLIC passes:
 *
 * Pass 1 (sheet heights) depends ONLY on the fixed natural offsets/
 * scrollHeight — there is no interdependency with contentTopPx here, which
 * is what makes this pure and non-recursive (the prior, broken draft tried
 * to compute both in one interleaved pass and oscillated).
 * Pass 2 (content tops + spacers) depends on the now-fully-known sheetHeightPx
 * array from Pass 1, plus the same fixed natural offsets.
 *
 * safetyMarginPt (~90pt PDF_RENDER_SAFETY_MARGIN_PT + ~11-13pt of
 * SAFETY_MARGIN_LINES-derived line height, ~1.4in total) is a Yoga-layout-
 * drift allowance the ENGINE already reserves when DECIDING block placement
 * (engine.ts's effectiveContentHeightPt = contentHeightPt - safetyMarginPt)
 * — it is deliberately NOT a third reservation term here. Because
 * sheetHeightPx floors at LETTER_HEIGHT_PX (never shrinks tighter than a
 * full page to fit content), that ~1.4in of headroom the engine already
 * declined to fill naturally shows up as blank trailing space at the bottom
 * of each fixed-height sheet — an EXPECTED, documented visual result, not a
 * bug. Do not "fix" this by shrinking sheets to tightly wrap content, and do
 * not add a third safetyMarginPx term — either would silently remove the
 * Yoga-drift buffer the PDF pipeline depends on.
 */
export function derivePageOffsets(
  measurements: DerivePageOffsetsMeasurements,
  opts: DerivePageOffsetsOptions
): DerivedPageOffset[] {
  const { naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage } = measurements
  const { topReservationPx, bottomReservationPx, continuationHeaderPx, pageGapPx } = opts
  const n = naturalOffsetsPx.length

  // Pass 1 — sheet heights (fixed inputs only, no interdependency)
  const sheetHeightPx: number[] = []
  for (let i = 0; i < n; i++) {
    const measuredSpanPx =
      i < n - 1 ? naturalOffsetsPx[i + 1] - naturalOffsetsPx[i] : naturalScrollHeightPx - naturalOffsetsPx[i]
    const reservedPx = topReservationPx + bottomReservationPx + (continuesTableByPage[i] ? continuationHeaderPx : 0)
    sheetHeightPx.push(Math.max(LETTER_HEIGHT_PX, measuredSpanPx + reservedPx))
  }

  // Pass 2 — content tops + spacers (depends on sheetHeightPx from Pass 1)
  //
  // CASCADE CORRECTION (found during this plan's execution, Task 3b — the
  // reset-then-snapshot shell writes marginTop to EVERY page's anchor in the
  // SAME batched pass, all measured against the SAME fully-reset
  // naturalOffsetsPx baseline. In real CSS block flow, marginTop on an
  // EARLIER anchor also pushes every LATER anchor down (normal flow
  // cascading) — so by the time page i's own margin is applied, it lands on
  // top of an anchor that ALREADY shifted down by every earlier page's
  // margin. Computing spacerMarginTopPx[i] as a flat
  // `contentTopPx[i] - naturalOffsetsPx[i]` (against the UNSHIFTED baseline)
  // therefore double-counts every earlier page's shift once real cascading
  // is applied — verified analytically and confirmed via
  // scripts/pagination-binding-check.ts (a 4-page fixture showed 3+
  // rendered anchors landing well past their intended contentTopPx once
  // real browser layout cascaded the margins). `appliedShiftPx` tracks the
  // running sum of margins already written to EARLIER anchors and is
  // subtracted out here so each page's OWN margin only contributes the
  // REMAINING delta needed to reach contentTopPx[i] — after real cascading,
  // the anchor's rendered position exactly equals contentTopPx[i] (when not
  // clamped by the `Math.max(0, ...)` floor).
  const result: DerivedPageOffset[] = []
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

// ---------------------------------------------------------------------------
// PaginatedDocumentOverlay — the thin, untested-in-jsdom measurement shell
// ---------------------------------------------------------------------------

interface PaginatedDocumentOverlayProps {
  pages: PageAssignment[] | null
  /** Feeds topReservationPx/bottomReservationPx/continuationHeaderPx below —
   *  the SAME company + templateId usePaginatedPreview() already computes
   *  constraints from, so the visual reservation matches the engine's own
   *  page-budget accounting exactly. */
  company: DocumentCompany
  templateId: EstimateTemplateId
  language: EstimateLanguage
  children: ReactNode
}

export function PaginatedDocumentOverlay({
  pages,
  company,
  templateId,
  language,
  children,
}: PaginatedDocumentOverlayProps) {
  const L = DOC_LABELS[language] ?? DOC_LABELS.en
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isApplyingRef = useRef(false)
  const [pageOffsets, setPageOffsets] = useState<DerivedPageOffset[] | null>(null)

  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  // Precomputed IN PX here (the shell's own caller of derivePageOffsets) —
  // mirrors the exact reservation the engine already charged every page for
  // the (page-1-only, never-repeated-in-the-DOM) company header.
  const topReservationPx = useMemo(
    () => (geometry.topPaddingPt + measureHeaderHeightPt(company, templateId)) * PX_PER_PT,
    [geometry.topPaddingPt, company, templateId]
  )
  const bottomReservationPx = useMemo(() => geometry.bottomPaddingPt * PX_PER_PT, [geometry.bottomPaddingPt])
  const continuationHeaderPx = useMemo(
    () => CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId] * PX_PER_PT,
    [templateId]
  )

  useLayoutEffect(() => {
    const container = containerRef.current

    function measureAndApply() {
      if (!container || !pages || pages.length === 0) return
      isApplyingRef.current = true

      // Phase A — reset every anchor, force ONE reflow, snapshot the fixed baseline
      const anchors = pages.map((p) =>
        container!.querySelector<HTMLElement>(`[data-page-block-id="${p.blocks[0]?.id}"]`)
      )
      anchors.forEach((el) => {
        if (el) el.style.marginTop = ''
      })
      void container!.offsetHeight // force exactly one reflow before reading
      const naturalOffsetsPx = anchors.map((el) => el?.offsetTop ?? 0)
      const naturalScrollHeightPx = container!.scrollHeight
      const continuesTableByPage = pages.map((p) => p.continuesTable)

      // Phase B — pure arithmetic (zero DOM reads), then ONE batched write
      const offsets = derivePageOffsets(
        { naturalOffsetsPx, naturalScrollHeightPx, continuesTableByPage },
        { topReservationPx, bottomReservationPx, continuationHeaderPx, pageGapPx: PAGE_GAP_PX }
      )
      setPageOffsets(offsets) // drives the decorative sheet render (React state — fine, no read follows)
      offsets.forEach((o, i) => {
        const el = anchors[i]
        if (el) el.style.marginTop = `${o.spacerMarginTopPx}px`
      })

      requestAnimationFrame(() => {
        isApplyingRef.current = false
      })
    }

    if (!container || !pages) {
      setPageOffsets(null)
      return
    }

    measureAndApply()
    const ro = new ResizeObserver(() => {
      if (isApplyingRef.current) return // ignore callbacks triggered by OUR OWN writes above
      measureAndApply()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [pages, topReservationPx, bottomReservationPx, continuationHeaderPx])

  // 185-UI-SPEC.md §3's fail-soft rule — first paint before the first
  // computePageBreaks() result resolves (pages === null): render children
  // UNWRAPPED, zero decoration.
  if (!pages) {
    return <div ref={containerRef}>{children}</div>
  }

  return (
    <div className="relative mx-auto rounded-xl bg-muted px-4 py-8" style={{ width: LETTER_WIDTH_PX + 32 }}>
      {/* Decoration layer — MUST use overflow: visible (never hidden, so live
          hover/focus/drag states near a page boundary are never clipped),
          pointer-events-none + stacked BEHIND the content layer (z-index 0)
          so clicks/hovers/drags always reach the real interactive row. */}
      {pageOffsets && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-4 top-8 z-0 transition-opacity duration-200 ease-out motion-reduce:transition-none"
          style={{ overflow: 'visible' }}
        >
          {pageOffsets.map((offset) => {
            const sheetTopPx = offset.contentTopPx - topReservationPx
            const continuesTable = pages[offset.pageIndex]?.continuesTable ?? false
            return (
              <div
                key={offset.pageIndex}
                data-page-sheet={offset.pageIndex}
                style={{ position: 'absolute', top: sheetTopPx, left: 0, right: 0 }}
              >
                <div
                  className="bg-white"
                  style={{
                    width: LETTER_WIDTH_PX,
                    height: offset.sheetHeightPx,
                    border: '1px solid rgba(255,255,255,0.14)',
                    boxShadow: '0 20px 40px -12px rgba(0,0,0,0.55)',
                    overflow: 'visible',
                  }}
                >
                  {continuesTable && (
                    <div
                      data-testid="continuation-header"
                      className="bg-muted/50 text-sm text-muted-foreground border-b border-border/50 select-none"
                      style={{ height: continuationHeaderPx }}
                    />
                  )}
                </div>
                <p
                  className="select-none pt-2 text-center text-xs text-white/70"
                  style={{ width: LETTER_WIDTH_PX }}
                >
                  {L.page} {offset.pageIndex + 1} {L.of} {pages.length}
                </p>
              </div>
            )
          })}
        </div>
      )}
      <div ref={containerRef} className="relative z-10">
        {children}
      </div>
    </div>
  )
}
