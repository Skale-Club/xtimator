'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false)

  async function handleManage() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/create-portal-session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error('Could not open subscription portal. Please try again.')
        return
      }
      window.location.href = data.url
    } catch {
      toast.error('Could not open subscription portal. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleManage} disabled={loading} variant="outline">
      {loading ? 'Opening portal...' : 'Manage Subscription'}
    </Button>
  )
}
