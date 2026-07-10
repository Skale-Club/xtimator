import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentParams,
  useRouter: () => ({ replace: replaceSpy }),
  usePathname: () => '/settings/billing',
}))

const toastSuccess = vi.fn()
const toastInfo = vi.fn()

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastInfo(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
  }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))

const { BillingStatusToast } = await import('@/components/billing/billing-status-toast')

beforeEach(() => {
  currentParams = new URLSearchParams('')
  replaceSpy.mockClear()
  toastSuccess.mockClear()
  toastInfo.mockClear()
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
})
