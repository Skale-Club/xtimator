import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { SendHubDialog, type SendHubDialogProps } from '@/components/workspace/send/send-hub-dialog'
import type { EstimateWithSections } from '@/lib/queries/estimate'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const mockSetPassword = vi.fn()
const mockLog = vi.fn()
vi.mock('@/lib/actions/estimate', () => ({
  logDeliveryAction: (...args: unknown[]) => mockLog(...args),
  setEstimateSharePassword: (...args: unknown[]) => mockSetPassword(...args),
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
  client_response: null,
  responded_at: null,
  share_password_hash: null,
  presentation_settings: null,
  sections: [],
} as unknown as EstimateWithSections

const template = { greeting: 'Hi {client_name},', opener: null, closer: null, signature: '{owner_name}' }

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

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
})

function publicUrl(): string {
  const text = screen.getByTestId('send-hub-url').textContent ?? ''
  return `${window.location.origin}${text.slice(text.indexOf('/'))}`
}

describe('SendHubDialog render', () => {
  it('shows the client, total and number under the title', () => {
    renderHub()
    expect(screen.getByText('Share estimate')).toBeTruthy()
    expect(screen.getAllByText('Ava Thompson').length).toBeGreaterThan(0)
    expect(screen.getByText(/\$3,486\.00 · NP-1045/)).toBeTruthy()
  })

  it('has no share-intent buttons', () => {
    renderHub()
    for (const name of ['WhatsApp', 'Email', 'SMS', 'Share']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })

  it('Copy link writes the URL, shows the copied state and logs the delivery', async () => {
    renderHub()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Link copied' })).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith(publicUrl())
    expect(screen.getByText('Paste it where you already talk to the client.')).toBeTruthy()
    expect(mockLog).toHaveBeenCalledWith({ estimateId: 'est_1', format: 'online_link', channel: 'copy' })
  })

  it('the copied state clears after 2 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    renderHub()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(2100)
    })
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })

  it('Copy copies the message, a blank line and the absolute link', async () => {
    renderHub()
    const card = screen.getByTestId('send-hub-card-plain-text')
    const message = (within(card).getByRole('textbox') as HTMLTextAreaElement).value
    fireEvent.click(within(card).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText).toHaveBeenCalledWith(`${message}\n\n${publicUrl()}`)
    expect(mockLog).toHaveBeenCalledWith({ estimateId: 'est_1', format: 'plain_text', channel: 'copy' })
  })

  it('Download PDF is a plain button that logs and opens the PDF route', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderHub()
    fireEvent.click(screen.getByTestId('send-hub-card-pdf'))
    expect(mockLog).toHaveBeenCalledWith({ estimateId: 'est_1', format: 'pdf', channel: 'download' })
    expect(open).toHaveBeenCalledWith('/api/estimates/est_1/pdf', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })
})

describe('status line', () => {
  it('no views: "Not opened yet"', () => {
    renderHub()
    expect(screen.getByTestId('send-hub-status').textContent).toBe('Not opened yet')
  })

  it('views: count with plural and the last open', () => {
    const last = new Date(Date.now() - 40 * 60_000).toISOString()
    renderHub({ viewCount: 3, lastViewedAt: last })
    expect(screen.getByTestId('send-hub-status').textContent).toBe('Opened 3 times · 40 minutes ago')
  })

  it('a single view uses the singular', () => {
    renderHub({ viewCount: 1, lastViewedAt: new Date().toISOString() })
    expect(screen.getByTestId('send-hub-status').textContent).toMatch(/^Opened 1 time · /)
  })

  it('accepted: "Accepted on" with the response date, ahead of the view count', () => {
    renderHub({
      viewCount: 3,
      lastViewedAt: new Date().toISOString(),
      estimate: { ...estimate, client_response: 'accepted', responded_at: '2026-11-16T15:00:00.000Z' } as EstimateWithSections,
    })
    expect(screen.getByTestId('send-hub-status').textContent).toMatch(/^Accepted on .*16/)
  })

  it('declined: "Declined on"', () => {
    renderHub({
      estimate: { ...estimate, client_response: 'declined', responded_at: '2026-11-16T15:00:00.000Z' } as EstimateWithSections,
    })
    expect(screen.getByTestId('send-hub-status').textContent).toMatch(/^Declined on /)
  })
})

describe('ready message editing', () => {
  it('shows no Edited tag and no Restore until the text changes, then both, and Restore undoes it', () => {
    renderHub()
    expect(screen.queryByText('Edited')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore the original text' })).toBeNull()

    const box = within(screen.getByTestId('send-hub-card-plain-text')).getByRole('textbox') as HTMLTextAreaElement
    const original = box.value
    fireEvent.change(box, { target: { value: 'Hi Ava, quick note.' } })
    expect(screen.getByText('Edited')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Restore the original text' }))
    expect(screen.queryByText('Edited')).toBeNull()
    expect((within(screen.getByTestId('send-hub-card-plain-text')).getByRole('textbox') as HTMLTextAreaElement).value).toBe(original)
  })
})

describe('password inside the link card', () => {
  it('sets a password from the sheet', async () => {
    mockSetPassword.mockResolvedValue({ success: true })
    renderHub()
    const card = screen.getByTestId('send-hub-card-online-link')
    fireEvent.click(within(card).getByRole('button', { name: 'Add password' }))
    fireEvent.change(within(card).getByPlaceholderText('Set a password'), { target: { value: 'secret123' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(within(card).getByText('Password protected')).toBeTruthy())
    expect(mockSetPassword).toHaveBeenCalledWith('est_1', 'secret123')
  })
})
