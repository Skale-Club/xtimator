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
  isOwner = true,
}: {
  packIndex: number
  label?: string
  variant?: 'primary' | 'outline'
  // False when the signed-in user is a company member, not the owner — the
  // checkout endpoint is owner-only server-side, so left enabled a member
  // would be told "Please try again" forever. Defaults to true.
  isOwner?: boolean
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
        toast.error(data.error ? t(data.error) : t('Could not start top-up. Please try again.'))
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
    <div className="flex flex-col gap-1">
      <Button onClick={handleTopUp} disabled={loading || !isOwner} size="sm" variant={variant}>
        {loading ? t('Redirecting...') : t(label)}
      </Button>
      {!isOwner && (
        <p className="text-xs text-muted-foreground">{t('Only the company owner can manage billing.')}</p>
      )}
    </div>
  )
}
