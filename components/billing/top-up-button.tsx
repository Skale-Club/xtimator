'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { toast } from 'sonner'

/**
 * Phase 115 (CREDITUI-02) — top-up button.
 *
 * Mirrors components/billing/upgrade-buttons.tsx: POSTs the chosen pack index to
 * /api/billing/create-topup-session and redirects to the returned Stripe URL.
 * The pack (credits/price) is looked up SERVER-SIDE by index — the client only
 * sends `packIndex`, never credits or price (Phase-113 Pitfall 4).
 */
export function TopUpButton({ packIndex }: { packIndex: number }) {
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
    <Button onClick={handleTopUp} disabled={loading} size="sm">
      {loading ? t('Redirecting...') : t('Top up credits')}
    </Button>
  )
}
