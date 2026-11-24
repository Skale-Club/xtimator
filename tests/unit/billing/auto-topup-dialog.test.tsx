import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Credits plan 2026-11-20 (delivery 3) - the auto top-up sheet.
 *
 * Supersedes the CREDITFIX-01 source scan (a dollar-only pack select): the
 * threshold is now in CREDITS (the old dollars x 100 assumed 1 credit = 1
 * cent), packs show credits + price (never estimates), the card is named, and
 * the whole rule is spelled out before saving.
 */

const T = (s: string) => s
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: T }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
type SaveInput = Parameters<typeof import('@/lib/actions/auto-topup').saveAutoTopupSettings>[0]
const saveAutoTopupSettings = vi.fn(async (_input: SaveInput) => ({ success: true }))
const disableAutoTopup = vi.fn(async () => ({ success: true }))
vi.mock('@/lib/actions/auto-topup', () => ({
  saveAutoTopupSettings: (input: SaveInput) => saveAutoTopupSettings(input),
  disableAutoTopup: () => disableAutoTopup(),
}))

const { AutoTopupDialogLauncher } = await import('@/components/billing/auto-topup-dialog')

const PACKS = [
  { credits: 900, priceCents: 1000 },
  { credits: 1900, priceCents: 2000 },
  { credits: 5000, priceCents: 5000 },
]

function open(props: Partial<Parameters<typeof AutoTopupDialogLauncher>[0]> = {}) {
  render(
    <AutoTopupDialogLauncher
      enabled={false}
      packs={PACKS}
      currentThresholdCredits={null}
      currentPackIndex={null}
      hasPaymentMethod
      cardLabel="Visa •••• 4242"
      {...props}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: props.enabled ? 'Change' : 'Turn on' }))
}

beforeEach(() => vi.clearAllMocks())

describe('AutoTopupDialogLauncher', () => {
  it('packs show credits and the price, never estimates; Best value on the most credits per dollar', () => {
    open()
    const packs = screen.getAllByTestId('autotopup-pack')
    expect(packs).toHaveLength(3)
    expect(packs[0].textContent).toContain('900 credits')
    expect(packs[0].textContent).not.toMatch(/estimate/i)
    expect(packs[0].textContent).toContain('$10')
    expect(packs[2].textContent).toContain('Best value')
    expect(packs[1].getAttribute('aria-checked')).toBe('true')
  })

  it('spells out the whole rule with the threshold in credits and the card', () => {
    open()
    expect(screen.getByTestId('autotopup-summary').textContent).toBe(
      'When your balance drops below 300 credits, we buy 1,900 credits ($20) on Visa •••• 4242.'
    )
  })

  it('saves the threshold in CREDITS (no dollars x 100) and the chosen pack', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '600' }))
    fireEvent.click(screen.getAllByTestId('autotopup-pack')[2])
    fireEvent.click(screen.getByTestId('autotopup-save'))
    await waitFor(() => expect(saveAutoTopupSettings).toHaveBeenCalledWith({ thresholdCredits: 600, packIndex: 2 }))
  })

  it('a custom threshold beyond 5x the pack is refused before saving', () => {
    open()
    fireEvent.click(screen.getAllByTestId('autotopup-pack')[0]) // 900 credits -> max 4,500
    fireEvent.change(screen.getByLabelText('Credits'), { target: { value: '5000' } })
    expect((screen.getByTestId('autotopup-save') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Enter between 1 and 4,500 credits for this pack.')).toBeTruthy()
  })

  it('without a card it cannot be turned on and offers to add one', () => {
    open({ hasPaymentMethod: false, cardLabel: null })
    expect((screen.getByTestId('autotopup-save') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Add payment method' })).toBeTruthy()
  })

  it('when on, it opens with the saved rule and can be turned off', async () => {
    open({ enabled: true, currentThresholdCredits: 150, currentPackIndex: 0 })
    expect(screen.getByTestId('autotopup-summary').textContent).toContain('below 150 credits, we buy 900 credits ($10)')
    fireEvent.click(screen.getByRole('button', { name: 'Turn off auto top-up' }))
    await waitFor(() => expect(disableAutoTopup).toHaveBeenCalled())
  })

  it('a member (not the owner) cannot open it', () => {
    render(
      <AutoTopupDialogLauncher enabled={false} packs={PACKS} currentThresholdCredits={null} currentPackIndex={null} hasPaymentMethod isOwner={false} />
    )
    expect((screen.getByRole('button', { name: 'Turn on' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
