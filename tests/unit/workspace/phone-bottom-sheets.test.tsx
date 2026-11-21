import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { GenerateInvoiceDialog } from '@/components/workspace/estimate/generate-invoice-dialog'
import { DatePopover } from '@/components/workspace/estimate/estimate-document'
import { EstimateCreationPopup } from '@/components/projects/estimate-creation-popup'

// Stage 3: on phones these overlays open as the app's bottom sheet
// (data-bottom-sheet), from sm up they keep their desktop shape.

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/projects',
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
vi.mock('@/lib/actions/invoice', () => ({
  generateInvoice: vi.fn(),
  getInvoicingPreview: vi.fn().mockResolvedValue({ error: 'none' }),
}))
vi.mock('@/lib/actions/project', () => ({
  getProjectMinimalAction: vi.fn().mockResolvedValue({
    data: { id: 'p1', name: 'Roof job', company_id: 'c1' },
  }),
  renameProjectAction: vi.fn(),
}))
vi.mock('@/components/projects/new-project-dialog', () => ({
  NEW_PROJECT_MODAL_PARAM: 'modal',
  NEW_PROJECT_MODAL_VALUE: 'new-project',
}))

function mockMatchMedia(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: phone && query === '(max-width: 639px)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  search = ''
  mockMatchMedia(true)
})
afterEach(() => cleanup())

describe('phone bottom sheets (editor and capture)', () => {
  it('Generate invoice opens as a bottom sheet with a close button', () => {
    render(<GenerateInvoiceDialog estimateId="e1" currencyCode="USD" estimateTotalCents={10000} />)
    fireEvent.click(screen.getByRole('button', { name: /Generate invoice/ }))
    expect(screen.getByTestId('generate-invoice-sheet').hasAttribute('data-bottom-sheet')).toBe(true)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('the estimate date opens its calendar in a bottom sheet on phones', () => {
    render(<DatePopover value="2026-11-20" onChange={() => {}} lang="en" />)
    fireEvent.click(screen.getByRole('button', { name: /2026|Nov|20/ }))
    const sheet = screen.getByTestId('estimate-date-sheet')
    expect(sheet.hasAttribute('data-bottom-sheet')).toBe(true)
    expect(screen.getByText('Estimate date')).toBeTruthy()
  })

  it('the estimate date keeps its popover on desktop', () => {
    mockMatchMedia(false)
    render(<DatePopover value="2026-11-20" onChange={() => {}} lang="en" />)
    fireEvent.click(screen.getByRole('button', { name: /2026|Nov|20/ }))
    expect(screen.queryByTestId('estimate-date-sheet')).toBeNull()
    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull()
  })

  it('the capture popup opens as a bottom sheet', async () => {
    search = 'capture=audio&projectId=p1'
    render(<EstimateCreationPopup />)
    const sheet = await screen.findByTestId('estimate-creation-sheet')
    expect(sheet.hasAttribute('data-bottom-sheet')).toBe(true)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })
})
