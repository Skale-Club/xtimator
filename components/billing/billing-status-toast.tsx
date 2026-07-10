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

const INFO_PARAMS: Array<[key: string, value: string, message: string]> = [
  ['cancelled', '1', 'Checkout cancelled — no changes were made.'],
  ['topup', 'cancelled', 'Top-up cancelled — no charge was made.'],
  ['autotopup_setup', 'cancelled', 'Auto top-up setup cancelled.'],
]

export function BillingStatusToast() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return

    const success = SUCCESS_PARAMS.find(([k, v]) => searchParams.get(k) === v)
    const info = success ? null : INFO_PARAMS.find(([k, v]) => searchParams.get(k) === v)
    const match = success ?? info
    if (!match) return

    fired.current = true
    if (success) {
      toast.success(t(match[2]))
    } else {
      toast(t(match![2]))
    }
    router.replace(pathname, { scroll: false })
  }, [searchParams, router, pathname, t])

  return null
}
