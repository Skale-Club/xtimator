import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ChangeOrderShareSheet } from '@/components/workspace/change-orders/change-order-share-sheet'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => {
  cleanup()
  writeText.mockClear()
  vi.restoreAllMocks()
})

function renderSheet(over: Partial<React.ComponentProps<typeof ChangeOrderShareSheet>> = {}) {
  const markShared = vi.fn().mockResolvedValue({ data: { sent_at: '2026-11-16T09:00:00.000Z' } })
  const onShared = vi.fn()
  render(
    <ChangeOrderShareSheet
      open
      onOpenChange={() => {}}
      changeOrderId="co-1"
      number={2}
      title="Extra coat"
      total={800}
      currencyCode="USD"
      projectName="Two-bedroom repaint"
      clientName="Ava Thompson"
      shareToken="tok-123"
      alreadyShared={false}
      markShared={markShared}
      onShared={onShared}
      {...over}
    />,
  )
  return { markShared, onShared }
}

const LINK = `${window.location.origin}/change-order/tok-123`

describe('ChangeOrderShareSheet', () => {
  it('shows the readable link and the default message for an addition', () => {
    renderSheet()
    expect(screen.getByTestId('change-order-share-url').textContent).toBe(LINK)
    const message = screen.getByRole('textbox', { name: 'Ready message' }) as HTMLTextAreaElement
    expect(message.value).toBe(
      'Hi Ava, here is change order #2 for Two-bedroom repaint: Extra coat. It adds $800.00 to the contract. Please review and approve it here:',
    )
  })

  it('words a credit as removing from the contract', () => {
    renderSheet({ total: -150 })
    const message = screen.getByRole('textbox', { name: 'Ready message' }) as HTMLTextAreaElement
    expect(message.value).toContain('It removes $150.00 from the contract.')
  })

  it('Copy link copies the link and marks the change order as shared once', async () => {
    const { markShared, onShared } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK))
    await waitFor(() => expect(markShared).toHaveBeenCalledTimes(1))
    expect(markShared).toHaveBeenCalledWith('co-1')
    await waitFor(() => expect(onShared).toHaveBeenCalledTimes(1))

    // A second copy (message this time) does not mark it again.
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(markShared).toHaveBeenCalledTimes(1)
  })

  it('Copy message appends the link to the (edited) message', async () => {
    renderSheet()
    const message = screen.getByRole('textbox', { name: 'Ready message' })
    fireEvent.change(message, { target: { value: 'Please look at this.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`Please look at this.\n\n${LINK}`))
  })

  it('Open marks it as shared and opens the link in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { markShared } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(open).toHaveBeenCalledWith(LINK, '_blank', 'noopener,noreferrer')
    await waitFor(() => expect(markShared).toHaveBeenCalledTimes(1))
  })

  it('does not mark again when it was already shared', async () => {
    const { markShared } = renderSheet({ alreadyShared: true })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(markShared).not.toHaveBeenCalled()
  })
})
