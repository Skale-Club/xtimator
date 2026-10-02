// lib/pdf/render-with-page-guard.ts
//
// Runtime guard for the deterministic pagination engine. The templates render EXACTLY
// the `PageAssignment[]` the engine computed, but react-pdf still lays each page out
// with Yoga: a page whose real content is taller than the engine predicted makes
// react-pdf add a silent extra page (a page holding only a footer/overflow). Calibration
// and fuzzing keep that rare; this guard catches the remainder in production.
//
// After rendering, the real page count (countPdfPages) is compared with the planned
// one. On a mismatch the pages are recomputed with the per-page safety margin raised
// (+48pt, then +96pt) and the document re-rendered; whatever rendered last is returned.
// Every failed attempt is reported (warning-level Sentry message, NO PII — ids, template,
// language and page counts only) so drift stays visible and the margin can be re-tuned.
import * as Sentry from '@sentry/nextjs'
import type { PageAssignment } from '@/lib/estimate/pagination/types'
import { countPdfPages } from './count-pdf-pages'

/** Extra per-page safety margin (pt) added on each successive retry. */
export const PAGE_GUARD_RETRY_EXTRA_MARGINS_PT = [48, 96] as const

export interface PageDriftReport {
  /** 1-based attempt that mismatched (1 = the original render). */
  attempt: number
  plannedPages: number
  realPages: number
  /** Extra safety margin (pt) that attempt was planned with (0 for attempt 1). */
  extraSafetyMarginPt: number
}

export interface PageGuardInput {
  /** Pages for a given EXTRA safety margin (0 = the production margin). Pure + deterministic. */
  computePages: (extraSafetyMarginPt: number) => PageAssignment[]
  /** Renders the document for the given pages. */
  render: (pages: PageAssignment[]) => Promise<Buffer>
  /** Called once per mismatching attempt. Must not throw (wrapped defensively anyway). */
  onDrift?: (report: PageDriftReport) => void
}

export interface PageGuardResult {
  buffer: Buffer
  pages: PageAssignment[]
  /** Renders performed (1..3). */
  attempts: number
  /** True when the LAST render still disagrees with its plan. */
  mismatched: boolean
}

export async function renderWithPageGuard(input: PageGuardInput): Promise<PageGuardResult> {
  const margins = [0, ...PAGE_GUARD_RETRY_EXTRA_MARGINS_PT]
  let last: PageGuardResult | null = null
  for (let i = 0; i < margins.length; i++) {
    const pages = input.computePages(margins[i])
    const buffer = await input.render(pages)
    const realPages = countPdfPages(buffer)
    const mismatched = realPages !== pages.length
    last = { buffer, pages, attempts: i + 1, mismatched }
    if (!mismatched) return last
    try {
      input.onDrift?.({ attempt: i + 1, plannedPages: pages.length, realPages, extraSafetyMarginPt: margins[i] })
    } catch {
      // Reporting must never break rendering.
    }
  }
  return last as PageGuardResult
}

/** Sentry warning for one drifting attempt. IDs and counts only — never names, addresses or amounts. */
export function reportPageDrift(ctx: { estimateId: string; templateId: string; language: string }, report: PageDriftReport): void {
  try {
    console.warn('[pdf_page_drift]', { ...ctx, ...report })
    Sentry.captureMessage('[pdf] rendered page count differs from the pagination plan', {
      level: 'warning',
      tags: {
        estimate_id: ctx.estimateId,
        template_id: ctx.templateId,
        language: ctx.language,
        attempt: String(report.attempt),
      },
      extra: { ...report },
    })
  } catch {
    // Observability must never break rendering.
  }
}
