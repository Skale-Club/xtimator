'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/use-translation'

export function UpgradeModal() {
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async (...args) => {
      const response = await originalFetch(...args)

      // Only intercept 402 from our AI routes
      if (response.status === 402) {
        const url =
          typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
        const isAiRoute =
          url.includes('/api/generate-estimate') ||
          url.includes('/api/analyze-photos')
        if (isAiRoute) {
          // Clone response so caller can still read it
          const clone = response.clone()
          clone
            .json()
            .then((body: { error?: string; reason?: string; upgradeUrl?: string }) => {
              if (body.error === 'plan_limit_reached') {
                // Billing v2: only the AI shortcut is blocked — the owner can
                // still build the estimate BY HAND (no credits needed). Say so,
                // so a zero-credit user discovers the manual path instead of
                // thinking everything is locked.
                const isCredits = body.reason === 'credits'
                toast.error(
                  t(isCredits ? "You're out of AI credits" : 'Plan limit reached'),
                  {
                    description: t(
                      isCredits
                        ? 'You can still build this estimate manually — just add sections and items by hand. To keep using AI, upgrade or top up your credits.'
                        : "You've hit your plan limit. You can still build estimates manually, or upgrade to keep using AI."
                    ),
                    duration: 9000,
                    action: {
                      label: t('Upgrade or top up'),
                      onClick: () => router.push('/settings/billing'),
                    },
                  }
                )
              }
            })
            .catch(() => {
              /* ignore parse errors */
            })
        }
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [router, t])

  return null
}
