import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SendHubDialog, type SendHubDialogProps } from '@/components/workspace/send/send-hub-dialog'
import type { EstimateWithSections } from '@/lib/queries/estimate'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/actions/estimate', () => ({
  logDeliveryAction: vi.fn(),
  setEstimateSharePassword: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const estimate = {
  id: 'est_1',
  currency_code: 'USD',
  estimate_seq: 7,
  estimate_number: 'NP-1045',
  share_token: 'tok-123',
  public_slug_token: null,
  language: 'en',
  total: 3486,
  sent_at: null,
  client_response: null,
  responded_at: null,
  share_password_hash: null,
  presentation_settings: null,
  sections: [],
} as unknown as EstimateWithSections

const template = { greeting: 'Hi {client_name},', opener: null, closer: null, signature: '{owner_name}' }

const clear = { unpriced: 0, priceChecks: 0, pendingQuestions: [], hadQuestions: false, hasClient: true }

function renderHub(overrides: Partial<SendHubDialogProps> = {}) {
  return render(
    <SendHubDialog
      open
      onOpenChange={() => {}}
      estimate={estimate}
      projectName="Two-Bedroom Refresh"
      companyName="Norte Pinturas"
      companySlug="norte-pinturas"
      clientName="Ava Thompson"
      ownerName="Daniel"
      estimateTemplate={template}
      {...overrides}
    />,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Ready to send? checklist', () => {
  it('is absent when no review is passed', () => {
    renderHub()
    expect(screen.queryByTestId('ready-to-send-check')).toBeNull()
  })

  it('collapses to one line when everything is ok', () => {
    renderHub({ review: clear })
    const card = screen.getByTestId('ready-to-send-check')
    expect(card.getAttribute('data-state')).toBe('ready')
    expect(within(card).getByText('Ready to send')).toBeTruthy()
    expect(within(card).queryByRole('list')).toBeNull()
    expect(screen.queryByTestId('ready-to-send-count')).toBeNull()
  })

  it('pending rows show counts and actions that close the sheet and call back', () => {
    const onOpenChange = vi.fn()
    const onFixPrices = vi.fn()
    const onAnswerQuestions = vi.fn()
    const onAddClient = vi.fn()
    renderHub({
      onOpenChange,
      onFixPrices,
      onAnswerQuestions,
      onAddClient,
      review: { unpriced: 2, priceChecks: 0, pendingQuestions: ['a', 'b', 'c'], hadQuestions: true, hasClient: false },
    })
    expect(screen.getByTestId('ready-to-send-count').textContent).toBe('0 of 3 ok')
    expect(screen.getByText('No client yet')).toBeTruthy()
    expect(screen.getByText('2 items without a price')).toBeTruthy()
    expect(screen.getByText('3 AI questions unanswered')).toBeTruthy()

    fireEvent.click(screen.getByTestId('ready-to-send-action-client'))
    fireEvent.click(screen.getByTestId('ready-to-send-action-prices'))
    fireEvent.click(screen.getByTestId('ready-to-send-action-questions'))
    expect(onAddClient).toHaveBeenCalledTimes(1)
    expect(onFixPrices).toHaveBeenCalledTimes(1)
    expect(onAnswerQuestions).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('singular wording and the AI price check variant', () => {
    renderHub({
      review: { unpriced: 1, priceChecks: 4, pendingQuestions: [], hadQuestions: false, hasClient: true },
    })
    expect(screen.getByText('1 item without a price')).toBeTruthy()
  })

  it('shows price checks when nothing is unpriced', () => {
    renderHub({
      review: { unpriced: 0, priceChecks: 1, pendingQuestions: [], hadQuestions: false, hasClient: true },
    })
    expect(screen.getByText('1 AI price to check')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check' })).toBeTruthy()
  })

  it('without questions it counts 2 items; with answered questions it counts 3', () => {
    const { unmount } = renderHub({
      review: { unpriced: 1, priceChecks: 0, pendingQuestions: [], hadQuestions: false, hasClient: true },
    })
    expect(screen.getByTestId('ready-to-send-count').textContent).toBe('1 of 2 ok')
    expect(screen.queryByTestId('ready-to-send-row-questions')).toBeNull()
    unmount()

    renderHub({
      review: { unpriced: 1, priceChecks: 0, pendingQuestions: [], hadQuestions: true, hasClient: true },
    })
    expect(screen.getByTestId('ready-to-send-count').textContent).toBe('2 of 3 ok')
    expect(screen.getByText('AI questions answered')).toBeTruthy()
  })

  it('is hidden once the estimate was sent or answered', () => {
    const pending = { unpriced: 1, priceChecks: 0, pendingQuestions: [], hadQuestions: false, hasClient: false }
    const { unmount } = renderHub({
      review: pending,
      estimate: { ...estimate, sent_at: '2026-11-18T10:00:00.000Z' } as EstimateWithSections,
    })
    expect(screen.queryByTestId('ready-to-send-check')).toBeNull()
    unmount()
    renderHub({
      review: pending,
      estimate: { ...estimate, client_response: 'accepted' } as EstimateWithSections,
    })
    expect(screen.queryByTestId('ready-to-send-check')).toBeNull()
  })

  it('never blocks: link, message and PDF actions stay rendered while items are pending', () => {
    renderHub({
      review: { unpriced: 3, priceChecks: 0, pendingQuestions: ['q'], hadQuestions: true, hasClient: false },
    })
    expect(screen.getByRole('button', { name: 'Copy link' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('send-hub-card-plain-text')).toBeTruthy()
    expect(screen.getByTestId('send-hub-card-pdf').hasAttribute('disabled')).toBe(false)
  })
})
