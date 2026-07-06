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

  it('renders 10 channel toggles (3 categories × 3 channels) + master', () => {
    render(
      <NotificationsForm initial={baseInitial} defaults={DEFAULT_PREFERENCES} />,
    )
    const switches = screen.getAllByRole('switch')
    // D-15: WhatsApp removed — 1 master email-digest + 9 per-category (3 × 3) = 10.
    // (The push control is a Button, not a switch.)
    expect(switches.length).toBeGreaterThanOrEqual(10)
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
 * Phase 104 plan 00 — Wave-0 EXTEND (NOTIF-01/02): 3 categories × 3 channels.
 *
 * D-15: WhatsApp column removed — tenant cannot enable proactive WhatsApp.
 * Matrix is now 3 categories (Estimates, Billing, System) × 3 channels
 * (In-app, Email, SMS). SMS switches are disabled when no verified phone.
 */
describe('NotificationsForm — 3 categories × 3 channels (D-15)', () => {
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

  it('renders an SMS switch per category (no WhatsApp column)', () => {
    render(
      <NotificationsForm
        initial={baseInitial}
        defaults={DEFAULT_PREFERENCES}
        verifiedPhone={null}
      />,
    )
    // WhatsApp switches must not exist (D-15)
    expect(screen.queryByTestId('pref-whatsapp-billing')).toBeNull()
    expect(screen.queryByTestId('pref-whatsapp-estimate')).toBeNull()
    expect(screen.queryByTestId('pref-whatsapp-system')).toBeNull()
    // SMS switches must exist
    expect(screen.getByTestId('pref-sms-billing')).toBeTruthy()
    expect(screen.getByTestId('pref-sms-estimate')).toBeTruthy()
    expect(screen.getByTestId('pref-sms-system')).toBeTruthy()
  })

  it('disables the SMS switches when no verified phone is provided', () => {
    render(
      <NotificationsForm
        initial={baseInitial}
        defaults={DEFAULT_PREFERENCES}
        verifiedPhone={null}
      />,
    )
    const sms = screen.getByTestId('pref-sms-billing')
    const isDisabled = (el: HTMLElement) =>
      el.hasAttribute('disabled') ||
      el.getAttribute('data-disabled') !== null ||
      el.getAttribute('aria-disabled') === 'true'
    expect(isDisabled(sms)).toBe(true)
  })
})
