'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * Post-checkout feedback toast. The Stripe flows redirect back to the billing
 * page with a status query param (?success=1, ?topup=1, ?cancelled=1, …) that
 * the page otherwise never surfaces. This client component reads that param,
 * fires exactly ONE toast for the first recognized status per mount, then
 * strips the query string via router.replace so a refresh does not re-toast.
 *
 * Must be rendered inside a <Suspense> boundary — useSearchParams() requires it.
 */

// Ordered so the first recognized param wins when several are present.
const SUCCESS_PARAMS: Array<[key: string, value: string, message: string]> = [
  ['success', '1', 'Subscription active — welcome aboard!'],
  ['upgraded', '1', 'Your plan has been updated.'],
  ['topup', '1', 'Payment received — your credits may take a few seconds to appear.'],
  ['autotopup_setup', '1', 'Auto top-up is set up.'],
]

// `?error=` is attacker-suppliable: anyone can hand a signed-in user a link to
// this authenticated page with arbitrary text. Render only KNOWN codes, mapped
// to our own copy, so the page can never be used to put a stranger's words in
// a trusted UI (a phishing surface, even though sonner escapes the value).
const ERROR_PARAMS: Record<string, string> = {
  owner_required: 'Only the company owner can manage billing.',
  platform_not_configured: 'Payments are not configured yet. Contact support.',
  portal_unavailable: 'Could not open the billing portal. Please try again or contact support.',
}

const INFO_PARAMS: Array<[key: string, value: string, message: string]> = [
  ['cancelled', '1', 'Checkout cancelled — no changes were made.'],
  ['topup', 'cancelled', 'Top-up cancelled — no charge was made.'],
  ['autotopup_setup', 'cancelled', 'Auto top-up setup cancelled.'],
]

// Bounded post-success refresh delays (ms). The page behind this toast was
// server-rendered BEFORE the Stripe webhook landed, so router.replace() alone
// (which only strips the query string) leaves stale data on screen — e.g.
// "Subscription active" painted over a still-Free-plan render. A couple of
// short, bounded refreshes give the webhook a chance to catch up without
// polling forever.
const SUCCESS_REFRESH_DELAYS_MS = [1500, 4000]

export function BillingStatusToast() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const fired = useRef(false)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    if (!fired.current) {
      const success = SUCCESS_PARAMS.find(([k, v]) => searchParams.get(k) === v)
      const errorCode = success ? null : searchParams.get('error')
      const errorMessage = errorCode ? ERROR_PARAMS[errorCode] ?? null : null
      const info =
        success || errorMessage ? null : INFO_PARAMS.find(([k, v]) => searchParams.get(k) === v)

      if (success || errorMessage || info) {
        fired.current = true

        if (success) {
          toast.success(t(success[2]))
        } else if (errorMessage) {
          toast.error(t(errorMessage))
        } else if (info) {
          toast(t(info[2]))
        }

        router.replace(pathname, { scroll: false })

        if (success) {
          // Refresh immediately, then again a couple of times shortly after —
          // bounded, not an indefinite poll — so the server render catches up
          // to the webhook-updated billing state.
          router.refresh()
          for (const delay of SUCCESS_REFRESH_DELAYS_MS) {
            timers.push(setTimeout(() => router.refresh(), delay))
          }
        }
      }
    }

    return () => {
      timers.forEach(clearTimeout)
    }
  }, [searchParams, router, pathname, t])

  return null
}
