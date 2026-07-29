import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import {
  EstimateDocument,
  type EstimateDocumentData,
} from '@/components/workspace/estimate/estimate-document'

// Quick-260718-p3v — 'Full page' view mode must render the document as a
// print-preview sheet (square corners, letter min-height, paper shadow)
// while the default keeps the rounded app-card chrome untouched.

// ---------------------------------------------------------------------------
// Mocks (mirrors document-bill-to.test.tsx setup)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn(),
  unlinkProjectFromClient: vi.fn(),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyData: EstimateDocumentData = {
  summary: null,
  notes: null,
  timeline: null,
  payment_terms: null,
  warranty_terms: null,
  discount_type: null,
  discount_value: 0,
  discount_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  subtotal: 0,
  total: 0,
  deposit_type: 'none',
  deposit_value: null,
  deposit: 0,
  balance_due: 0,
  currency_code: 'USD',
  sections: [],
  estimate_date: '2026-07-18',
  estimate_number: null,
  presentation_settings: null,
}

function renderDocument(pageView?: boolean): HTMLElement {
  const { container } = render(
    <EstimateDocument
      mode="view"
      data={emptyData}
      client={null}
      projectName="Test Project"
      projectType={null}
      estimateVersion={1}
      estimateCreatedAt="2026-07-18T00:00:00Z"
      {...(pageView === undefined ? {} : { pageView })}
    />
  )
  return container.firstChild as HTMLElement
}

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EstimateDocument page view (print-preview sheet)', () => {
  it('default render keeps the rounded app-card chrome', () => {
    const root = renderDocument()
    expect(root.className).toContain('rounded-3xl')
    expect(root.className).toContain('border-4')
    expect(root.className).toContain('shadow-lg')
    expect(root.style.minHeight).toBe('')
    expect(root.style.borderColor).toBe('rgb(63, 63, 70)') // #3f3f46
  })

  it('pageView={false} is identical to the default', () => {
    const root = renderDocument(false)
    expect(root.className).toContain('rounded-3xl')
    expect(root.className).toContain('border-4')
    expect(root.style.borderColor).toBe('rgb(63, 63, 70)') // #3f3f46
  })

  it('pageView renders chrome-free and transparent — the overlay sheets are the paper (260728 rework)', () => {
    const root = renderDocument(true)
    // No card chrome of its own: the PaginatedDocumentOverlay's decorative
    // sheets carry the white fill, hairline edge, and paper shadow; the
    // content layer stays transparent so inter-page gaps show the canvas.
    expect(root.className).not.toContain('rounded-3xl')
    expect(root.className).not.toContain('border-4')
    expect(root.className).not.toContain('shadow')
    expect(root.className).not.toContain('overflow-hidden')
    expect(root.style.minHeight).toBe('')
    expect(root.style.backgroundColor).toBe('')
    expect(root.style.borderColor).toBe('')
  })
})
