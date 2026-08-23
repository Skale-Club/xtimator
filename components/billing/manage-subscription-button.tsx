'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'

export function ManageSubscriptionButton({ isOwner = true }: { isOwner?: boolean }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  async function handleManage() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/create-portal-session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(data.error ? t(data.error) : t('Could not open subscription portal. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not open subscription portal. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button onClick={handleManage} disabled={loading || !isOwner} variant="outline">
        {loading ? t('Opening portal...') : t('Manage Subscription')}
      </Button>
      {!isOwner && (
        <p className="text-xs text-muted-foreground">{t('Only the company owner can manage billing.')}</p>
      )}
    </div>
  )
}
