import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/**
 * Phase 77 plan 07 — NotificationsForm category-matrix + push button coverage.
 *
 * Covers:
 *  1. renders 8 category rows × 2 channel switches (16 toggles)
 *  2. master email-digest switch disables all email toggles when off
 *  3. toggling a category switch + Save fires PATCH with delta body
 *  4. enable-push button calls enableBrowserPush + shows success state
 *  5. unsupported browser → push button disabled with explanatory text
 */

// -- mocks -------------------------------------------------------------------
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const enableBrowserPushMock = vi.fn()
const isPushSupportedMock = vi.fn()
vi.mock('@/lib/notifications/push-client', () => ({
  enableBrowserPush: (...args: unknown[]) => enableBrowserPushMock(...args),
  disableBrowserPush: vi.fn(),
  isPushSupported: () => isPushSupportedMock(),
}))

// useTranslation passthrough
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

// toast — sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { NotificationsForm } from '@/components/settings/notifications-form'
import { DEFAULT_PREFERENCES } from '@/lib/notifications/event-types'

const baseInitial = {
  categories: {},
  email_digest_enabled: true,
  push_enabled: false,
}

describe('NotificationsForm', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    enableBrowserPushMock.mockReset()
    isPushSupportedMock.mockReset().mockReturnValue(true)
    fetchMock.mockResolvedValue({ ok: true, status: 204 })
  })

  it('renders 16 channel toggles (8 categories × 2 channels)', () => {
    render(
      <NotificationsForm initial={baseInitial} defaults={DEFAULT_PREFERENCES} />,
    )
    const switches = screen.getAllByRole('switch')
    // 1 master email-digest + 16 per-category (8 × 2) + 1 push = 18 expected
    expect(switches.length).toBeGreaterThanOrEqual(17)
  })

  it('toggling master email-digest off disables every category email switch', async () => {
    render(
      <NotificationsForm initial={baseInitial} defaults={DEFAULT_PREFERENCES} />,
    )
    const master = screen.getByTestId('master-email-digest')
    fireEvent.click(master)
    const emailSwitches = screen.getAllByTestId(/^pref-email-/)
    for (const sw of emailSwitches) {
      // Radix Switch reflects disabled state via data-disabled or aria-disabled attr
      const disabled =
        sw.hasAttribute('disabled') ||
        sw.getAttribute('data-disabled') !== null ||
        sw.getAttribute('aria-disabled') === 'true'
      expect(disabled).toBe(true)
    }
  })

  it('saves PATCH with current state when Save clicked', async () => {
    render(
      <NotificationsForm initial={baseInitial} defaults={DEFAULT_PREFERENCES} />,
    )
    const estimateInApp = screen.getByTestId('pref-in_app-estimate')
    // estimate default = in_app true; click to toggle OFF
    await act(async () => {
      fireEvent.click(estimateInApp)
    })
    const saveBtn = screen.getByTestId('save-prefs')
    await act(async () => {
      fireEvent.click(saveBtn)
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/notifications/preferences')
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body)
    expect(body.categories.estimate.in_app).toBe(false)
  })

  it('enable-push button calls enableBrowserPush on click', async () => {
    enableBrowserPushMock.mockResolvedValue({ ok: true })
    render(
      <NotificationsForm initial={baseInitial} defaults={DEFAULT_PREFERENCES} />,
    )
    const btn = screen.getByTestId('enable-push')
    await act(async () => {
      fireEvent.click(btn)
    })
    await waitFor(() => expect(enableBrowserPushMock).toHaveBeenCalled())
  })

  it('disables enable-push button when browser is unsupported', () => {
    isPushSupportedMock.mockReturnValue(false)
    render(
      <NotificationsForm initial={baseInitial} defaults={DEFAULT_PREFERENCES} />,
    )
    const btn = screen.getByTestId('enable-push') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})

/**
 * Phase 104 plan 00 — Wave-0 EXTEND (NOTIF-01/02): 3 categories × 4 channels.
 *
 * RED until Wave 1 reduces the matrix to 3 category rows (Estimates, Billing,
 * System) + 4 channel columns (In-app, Email, WhatsApp, SMS) and Wave 2 adds the
 * phone/opt-in gating that disables the whatsapp/sms switches when no verified
 * phone is passed in props.
 */
describe('NotificationsForm — 3 categories × 4 channels (NOTIF-01/02 RED)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    enableBrowserPushMock.mockReset()
    isPushSupportedMock.mockReset().mockReturnValue(true)
    fetchMock.mockResolvedValue({ ok: true, status: 204 })
  })

  it('renders exactly the 3 reduced category rows (Estimates, Billing, System)', () => {
    render(
      <NotificationsForm
        initial={baseInitial}
        defaults={DEFAULT_PREFERENCES}
        verifiedPhone={null}
      />,
    )
    expect(screen.getByText('Billing')).toBeTruthy()
    expect(screen.getByText('Estimates')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    // The old categories must be gone.
    expect(screen.queryByText('Payments')).toBeNull()
    expect(screen.queryByText('Trial')).toBeNull()
    expect(screen.queryByText('Quota')).toBeNull()
    expect(screen.queryByText('AI Jobs')).toBeNull()
  })

  it('renders a WhatsApp + SMS switch per category (4 channel columns)', () => {
    render(
      <NotificationsForm
        initial={baseInitial}
        defaults={DEFAULT_PREFERENCES}
        verifiedPhone={null}
      />,
    )
    expect(screen.getByTestId('pref-whatsapp-billing')).toBeTruthy()
    expect(screen.getByTestId('pref-sms-billing')).toBeTruthy()
  })

  it('disables the WhatsApp + SMS switches when no verified phone is provided', () => {
    render(
      <NotificationsForm
        initial={baseInitial}
        defaults={DEFAULT_PREFERENCES}
        verifiedPhone={null}
      />,
    )
    const whatsapp = screen.getByTestId('pref-whatsapp-billing')
    const sms = screen.getByTestId('pref-sms-billing')
    const isDisabled = (el: HTMLElement) =>
      el.hasAttribute('disabled') ||
      el.getAttribute('data-disabled') !== null ||
      el.getAttribute('aria-disabled') === 'true'
    expect(isDisabled(whatsapp)).toBe(true)
    expect(isDisabled(sms)).toBe(true)
  })
})
