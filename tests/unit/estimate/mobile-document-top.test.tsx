import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  EstimateDocument,
  type EstimateDocumentData,
} from '@/components/workspace/estimate/estimate-document'

// Phase 2 of the line-item redesign: on a phone, while editing, the document
// top (company, title band, project/client, summary) folds into one compact
// card so the line items start near the top. View mode (share page) is
// untouched: no compact card and no wrapper.

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn(),
  unlinkProjectFromClient: vi.fn(),
  renameProjectAction: vi.fn(),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const data: EstimateDocumentData = {
  summary: 'Weekly cleaning', notes: null, timeline: null, payment_terms: null, warranty_terms: null,
  discount_type: null, discount_value: 0, discount_amount: 0, tax_rate: 0, tax_amount: 0,
  subtotal: 100, total: 100, deposit_type: 'none', deposit_value: null, deposit: 0, balance_due: 100,
  currency_code: 'USD',
  sections: [{ id: 's1', title: 'Main', subtotal: 100, items: [
    { id: 'i1', description: 'Visit', quantity: 1, unit: 'visit', unit_price: 100, total: 100 },
  ] }],
  estimate_date: '2026-11-06', estimate_number: 'SK-1049', presentation_settings: null,
}

const props = {
  data,
  company: {
    name: 'Skale Club', owner_name: null, phone: null, email: null, website: null, address: null,
    city: null, state: null, zip: null, logo_url: null, brand_primary_color: '#3D6FEA',
  },
  client: { id: 'c1', name: 'Sophia Chen', email: null, phone: null, address: null, city: null, state: null, zip: null },
  projectName: 'Biweekly Home Cleaning',
  projectType: null,
  estimateVersion: 1,
  estimateSeq: 1049,
  estimateCreatedAt: '2026-11-06T00:00:00Z',
  projectId: 'p1',
} as const

describe('mobile document top while editing', () => {
  it('shows a compact card with project, client, date and number, and folds the full top below sm', () => {
    render(<EstimateDocument mode="edit" {...props} dispatch={vi.fn()} />)
    const card = screen.getByTestId('mobile-doc-top-compact')
    expect(card.className.split(/\s+/)).toContain('sm:hidden')
    expect(card.textContent).toContain('Biweekly Home Cleaning')
    expect(card.textContent).toContain('Sophia Chen')
    expect(card.textContent).toContain('#SK-1049')
    const header = document.querySelector('[data-track-section="header"]')!
    expect(header.parentElement!.className).toBe('hidden sm:block')
  })

  it('expands the full top on tap and folds it back', () => {
    render(<EstimateDocument mode="edit" {...props} dispatch={vi.fn()} />)
    fireEvent.click(screen.getByTestId('mobile-doc-top-compact'))
    expect(screen.queryByTestId('mobile-doc-top-compact')).toBeNull()
    expect(document.querySelector('[data-track-section="header"]')!.parentElement!.className).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /Hide estimate details/ }))
    expect(screen.getByTestId('mobile-doc-top-compact')).toBeTruthy()
  })

  it('leaves view mode (share page) untouched: no card, no wrapper', () => {
    const { container } = render(<EstimateDocument mode="view" {...props} />)
    expect(screen.queryByTestId('mobile-doc-top-compact')).toBeNull()
    const header = container.querySelector('[data-track-section="header"]')!
    // The header sits directly in the paper root, as before.
    expect(header.parentElement).toBe(container.firstElementChild)
  })
})
