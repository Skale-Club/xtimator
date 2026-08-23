import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Post-checkout feedback toast. Reads the Stripe redirect status param, fires
 * exactly one sonner toast per mount, and strips the query string via
 * router.replace so a refresh never re-toasts.
 *
 * next/navigation's useSearchParams is driven by a module-level URLSearchParams
 * that each test swaps before rendering.
 */

let currentParams = new URLSearchParams('')
const replaceSpy = vi.fn()
const refreshSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentParams,
  useRouter: () => ({ replace: replaceSpy, refresh: refreshSpy }),
  usePathname: () => '/settings/billing',
}))

const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastInfo(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { BillingStatusToast } = await import('@/components/billing/billing-status-toast')

beforeEach(() => {
  currentParams = new URLSearchParams('')
  replaceSpy.mockClear()
  refreshSpy.mockClear()
  toastSuccess.mockClear()
  toastInfo.mockClear()
  toastError.mockClear()
})

describe('BillingStatusToast', () => {
  it('fires a success toast for ?success=1 and cleans the URL', () => {
    currentParams = new URLSearchParams('success=1')
    render(<BillingStatusToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(toastInfo).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalledWith('/settings/billing', { scroll: false })
  })

  it('fires a success toast for ?topup=1 mentioning credits may take a few seconds', () => {
    currentParams = new URLSearchParams('topup=1')
    render(<BillingStatusToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(String(toastSuccess.mock.calls[0][0])).toMatch(/credits.*few seconds/i)
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })

  it('fires a success toast for ?autotopup_setup=1', () => {
    currentParams = new URLSearchParams('autotopup_setup=1')
    render(<BillingStatusToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('fires a success toast for ?upgraded=1', () => {
    currentParams = new URLSearchParams('upgraded=1')
    render(<BillingStatusToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('fires a neutral toast for ?cancelled=1', () => {
    currentParams = new URLSearchParams('cancelled=1')
    render(<BillingStatusToast />)
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalledTimes(1)
  })

  it('fires a neutral toast for ?topup=cancelled', () => {
    currentParams = new URLSearchParams('topup=cancelled')
    render(<BillingStatusToast />)
    expect(toastInfo).toHaveBeenCalledTimes(1)
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('fires a neutral toast for ?autotopup_setup=cancelled', () => {
    currentParams = new URLSearchParams('autotopup_setup=cancelled')
    render(<BillingStatusToast />)
    expect(toastInfo).toHaveBeenCalledTimes(1)
  })

  it('does nothing for an unrecognized param and does not clean the URL', () => {
    currentParams = new URLSearchParams('foo=bar')
    render(<BillingStatusToast />)
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('fires exactly one toast (success wins) when a success and cancel param coexist', () => {
    currentParams = new URLSearchParams('success=1&cancelled=1')
    render(<BillingStatusToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('fires a destructive toast for a KNOWN ?error= code and cleans the URL', () => {
    currentParams = new URLSearchParams('error=owner_required')
    render(<BillingStatusToast />)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('Only the company owner can manage billing.')
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalledWith('/settings/billing', { scroll: false })
  })

  it('ignores an UNKNOWN ?error= value (attacker-suppliable text is never rendered)', () => {
    currentParams = new URLSearchParams('error=Your+account+is+suspended,+call+555-0100')
    render(<BillingStatusToast />)
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastInfo).not.toHaveBeenCalled()
  })

  it('success wins over a coexisting error param', () => {
    currentParams = new URLSearchParams('success=1&error=owner_required')
    render(<BillingStatusToast />)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  describe('post-success refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('calls router.refresh() immediately on a success param', () => {
      currentParams = new URLSearchParams('success=1')
      render(<BillingStatusToast />)
      expect(refreshSpy).toHaveBeenCalledTimes(1)
    })

    it('refreshes again at 1.5s and 4s, then stops (bounded poll)', () => {
      currentParams = new URLSearchParams('success=1')
      render(<BillingStatusToast />)
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1500)
      expect(refreshSpy).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(2500) // 4000 total
      expect(refreshSpy).toHaveBeenCalledTimes(3)

      // Bounded — no further refreshes after the last scheduled one.
      vi.advanceTimersByTime(60_000)
      expect(refreshSpy).toHaveBeenCalledTimes(3)
    })

    it('does not call router.refresh() for a neutral/info param', () => {
      currentParams = new URLSearchParams('cancelled=1')
      render(<BillingStatusToast />)
      vi.advanceTimersByTime(10_000)
      expect(refreshSpy).not.toHaveBeenCalled()
    })

    it('does not call router.refresh() for an error param', () => {
      currentParams = new URLSearchParams('error=Nope')
      render(<BillingStatusToast />)
      vi.advanceTimersByTime(10_000)
      expect(refreshSpy).not.toHaveBeenCalled()
    })
  })
})
