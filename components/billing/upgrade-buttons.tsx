'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'

export function UpgradeButtons() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<'pro' | 'business' | null>(null)

  async function handleUpgrade(plan: 'pro' | 'business') {
    setLoading(plan)
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(data.error ? t(data.error) : t('Could not start checkout. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not start checkout. Please try again.'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        onClick={() => handleUpgrade('pro')}
        disabled={loading !== null}
        className="flex-1"
      >
        {loading === 'pro' ? t('Redirecting...') : t('Upgrade to Pro')}
      </Button>
      <Button
        onClick={() => handleUpgrade('business')}
        disabled={loading !== null}
        variant="outline"
        className="flex-1"
      >
        {loading === 'business' ? t('Redirecting...') : t('Upgrade to Business')}
      </Button>
    </div>
  )
}
