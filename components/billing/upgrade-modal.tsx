'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/use-translation'
import { billingBlockCopy } from '@/lib/billing/block-toast'
import {
  BILLING_SETTINGS_PATH,
  isBillingBlockCode,
} from '@/lib/billing/block-codes'

/**
 * Every AI route that can answer 402 `plan_limit_reached`. Matches relative and
 * absolute URLs, with or without a query string.
 */
const AI_ROUTE_PATTERN =
  /\/api\/(?:generate-estimate|analyze-photos|transcribe|chat)(?:[/?#]|$)|\/api\/estimates\/[^/?#]+\/refine(?:[/?#]|$)/

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return (input as Request).url
}

type PlanLimitBody = {
  error?: string
  reason?: string
  state?: string
  upgradeUrl?: string
}

export function UpgradeModal() {
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async (...args) => {
      const response = await originalFetch(...args)

      // Only intercept 402 from our AI routes
      if (response.status === 402 && AI_ROUTE_PATTERN.test(requestUrl(args[0]))) {
        // Clone response so caller can still read it
        const clone = response.clone()
        clone
          .json()
          .then((body: PlanLimitBody) => {
            if (body.error !== 'plan_limit_reached') return
            // SEED-055 Phase D: credits are the only wall and nothing new can be
            // built without them, so there is no "do it by hand" copy. The 402
            // body carries `state`; a credits block with no state (an older
            // server) is treated as the paywall.
            const isCredits = body.reason === 'credits' || isBillingBlockCode(body.state)
            const target = body.upgradeUrl ?? BILLING_SETTINGS_PATH
            if (isCredits) {
              const copy = billingBlockCopy(
                body.state === 'out_of_credits' ? 'out_of_credits' : 'paywalled',
                t
              )
              toast.error(copy.title, {
                id: 'billing-block',
                description: copy.description,
                duration: 9000,
                action: { label: copy.cta, onClick: () => router.push(target) },
              })
              return
            }
            // A non-credit plan cap (e.g. the daily abuse ceiling).
            toast.error(t('Plan limit reached'), {
              id: 'billing-block',
              description: t("You've hit your plan limit. Upgrade to keep going."),
              duration: 9000,
              action: { label: t('Upgrade'), onClick: () => router.push(target) },
            })
          })
          .catch(() => {
            /* ignore parse errors */
          })
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [router, t])

  return null
}
