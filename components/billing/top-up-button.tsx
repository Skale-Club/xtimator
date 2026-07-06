'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { toast } from 'sonner'

/**
 * Phase 115 (CREDITUI-02) — top-up button.
 * Phase 153-01 (CREDITUI-06) — parameterized `label` + `variant` so the new
 * TopUpPackCard can render a per-pack CTA ("Top up $20") with a variant that
 * matches the recommended-pack visual treatment.
 *
 * Mirrors components/billing/upgrade-buttons.tsx: POSTs the chosen pack index to
 * /api/billing/create-topup-session and redirects to the returned Stripe URL.
 * The pack (credits/price) is looked up SERVER-SIDE by index — the client only
 * sends `packIndex`, never credits or price (Phase-113 Pitfall 4).
 */
export function TopUpButton({
  packIndex,
  label = 'Top up credits',
  variant = 'primary',
}: {
  packIndex: number
  label?: string
  variant?: 'primary' | 'outline'
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  async function handleTopUp() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/create-topup-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packIndex }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(t('Could not start top-up. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not start top-up. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleTopUp} disabled={loading} size="sm" variant={variant}>
      {loading ? t('Redirecting...') : t(label)}
    </Button>
  )
}
