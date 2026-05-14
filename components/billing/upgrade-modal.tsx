'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function UpgradeModal() {
  const router = useRouter()

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
            .then((body: { error?: string; upgradeUrl?: string }) => {
              if (body.error === 'plan_limit_reached') {
                toast.error('Plan limit reached', {
                  description:
                    "You've used all your quota for this period. Upgrade to continue.",
                  duration: 8000,
                  action: {
                    label: 'Upgrade Plan',
                    onClick: () => router.push('/settings/billing'),
                  },
                })
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
  }, [router])

  return null
}
