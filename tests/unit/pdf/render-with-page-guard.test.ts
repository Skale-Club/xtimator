// tests/unit/pdf/render-with-page-guard.test.ts
//
// The runtime page-count guard: counter + retry policy + drift reporting (no PII).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }))

import { countPdfPages } from '@/lib/pdf/count-pdf-pages'
import {
  renderWithPageGuard,
  reportPageDrift,
  PAGE_GUARD_RETRY_EXTRA_MARGINS_PT,
} from '@/lib/pdf/render-with-page-guard'
import type { PageAssignment } from '@/lib/estimate/pagination/types'

const pagesOf = (n: number): PageAssignment[] =>
  Array.from({ length: n }, (_, i) => ({ pageIndex: i, blocks: [], continuesTable: false }))
/** A fake "PDF" with `n` /Type /Page objects and the page-tree node (/Type /Pages). */
const pdfWith = (n: number) =>
  Buffer.from('<< /Type /Pages /Count 9 >>' + Array.from({ length: n }, () => '<< /Type /Page /Parent 1 0 R >>').join('\n'))

beforeEach(() => captureMessage.mockClear())

describe('countPdfPages', () => {
  it('counts /Type /Page objects and ignores the /Type /Pages tree node', () => {
    expect(countPdfPages(pdfWith(3))).toBe(3)
    expect(countPdfPages(Buffer.from('/Type /Pages'))).toBe(0)
    expect(countPdfPages(Buffer.from('/Type/Page>> /Type /Page>>'))).toBe(2)
  })
})

describe('renderWithPageGuard', () => {
  it('no mismatch: one render, no drift report', async () => {
    const onDrift = vi.fn()
    const render = vi.fn(async (pages: PageAssignment[]) => pdfWith(pages.length))
    const r = await renderWithPageGuard({ computePages: () => pagesOf(3), render, onDrift })
    expect(r).toMatchObject({ attempts: 1, mismatched: false })
    expect(r.pages).toHaveLength(3)
    expect(render).toHaveBeenCalledTimes(1)
    expect(onDrift).not.toHaveBeenCalled()
  })

  it('under-predicting plan: retries with +48pt then succeeds, reporting the first attempt only', async () => {
    const margins: number[] = []
    const onDrift = vi.fn()
    // plan N pages at margin 0, N+1 at >= 48; the "renderer" always draws one page more than planned until +48 is applied.
    const computePages = (extra: number) => {
      margins.push(extra)
      return pagesOf(extra >= 48 ? 5 : 4)
    }
    const render = vi.fn(async () => pdfWith(5))
    const r = await renderWithPageGuard({ computePages, render, onDrift })
    expect(margins).toEqual([0, 48])
    expect(r).toMatchObject({ attempts: 2, mismatched: false })
    expect(r.pages).toHaveLength(5)
    expect(onDrift).toHaveBeenCalledTimes(1)
    expect(onDrift).toHaveBeenCalledWith({ attempt: 1, plannedPages: 4, realPages: 5, extraSafetyMarginPt: 0 })
  })

  it('still mismatching after +48: tries +96 once more, then returns the last render, reporting every failed attempt', async () => {
    const margins: number[] = []
    const onDrift = vi.fn()
    const computePages = (extra: number) => {
      margins.push(extra)
      return pagesOf(4)
    }
    const r = await renderWithPageGuard({ computePages, render: async () => pdfWith(6), onDrift })
    expect(margins).toEqual([0, ...PAGE_GUARD_RETRY_EXTRA_MARGINS_PT])
    expect(margins).toEqual([0, 48, 96])
    expect(r).toMatchObject({ attempts: 3, mismatched: true })
    expect(countPdfPages(r.buffer)).toBe(6)
    expect(onDrift.mock.calls.map((c) => c[0].attempt)).toEqual([1, 2, 3])
    expect(onDrift.mock.calls.map((c) => c[0].extraSafetyMarginPt)).toEqual([0, 48, 96])
  })

  it('a throwing onDrift never breaks rendering', async () => {
    const r = await renderWithPageGuard({
      computePages: () => pagesOf(2),
      render: async () => pdfWith(3),
      onDrift: () => {
        throw new Error('boom')
      },
    })
    expect(r.attempts).toBe(3)
  })
})

describe('reportPageDrift', () => {
  it('sends a warning-level Sentry message with ids/counts only (no PII)', () => {
    reportPageDrift(
      { estimateId: 'est-1', templateId: 'modern', language: 'es' },
      { attempt: 2, plannedPages: 4, realPages: 5, extraSafetyMarginPt: 48 }
    )
    expect(captureMessage).toHaveBeenCalledTimes(1)
    const [message, ctx] = captureMessage.mock.calls[0]
    expect(typeof message).toBe('string')
    expect(ctx.level).toBe('warning')
    expect(ctx.tags).toEqual({ estimate_id: 'est-1', template_id: 'modern', language: 'es', attempt: '2' })
    expect(ctx.extra).toEqual({ attempt: 2, plannedPages: 4, realPages: 5, extraSafetyMarginPt: 48 })
  })

  it('never throws even when Sentry does', () => {
    captureMessage.mockImplementationOnce(() => {
      throw new Error('sentry down')
    })
    expect(() =>
      reportPageDrift({ estimateId: 'e', templateId: 'classic', language: 'en' }, { attempt: 1, plannedPages: 1, realPages: 2, extraSafetyMarginPt: 0 })
    ).not.toThrow()
  })
})
