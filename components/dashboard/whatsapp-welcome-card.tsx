'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'

/**
 * Shown once right after onboarding: opens the Xtimator WhatsApp assistant with a
 * prefilled first message. The server only renders it when a platform number is
 * configured. No QR code: the repo has no QR library and none is added for this.
 */
export function WhatsAppWelcomeCard({ href }: { href: string }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <Card variant="glass" className="mx-6 mt-6" data-testid="whatsapp-welcome-card">
      <CardContent className="flex items-center gap-4 py-4">
        <MessageCircle aria-hidden className="h-6 w-6 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('Create your first estimate on WhatsApp')}</p>
          <p className="text-sm text-muted-foreground">
            {t('Send a voice note or text describing the job and the assistant builds the estimate.')}
          </p>
        </div>
        <Button asChild variant="primary" className="min-h-11 shrink-0">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {t('Open in WhatsApp')}
          </a>
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('Dismiss')}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  )
}
