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
    <Card variant="glass" className="mx-4 mb-4 mt-4 gap-0 py-0 sm:mx-6 sm:mb-6 sm:mt-6" data-testid="whatsapp-welcome-card">
      {/* Phone: row 1 = icon + copy + dismiss, row 2 = full-width CTA (order-last).
          Without wrapping the nowrap row squeezed the copy into a sliver. */}
      <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-3 py-4 sm:flex-nowrap sm:gap-4">
        <MessageCircle aria-hidden className="h-6 w-6 shrink-0 self-start text-primary sm:self-center" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('Create your first estimate on WhatsApp')}</p>
          <p className="text-sm text-muted-foreground">
            {t('Send a voice note or text describing the job and the assistant builds the estimate.')}
          </p>
        </div>
        <Button asChild variant="primary" className="order-last min-h-11 w-full shrink-0 sm:order-none sm:w-auto">
          <a href={href} target="_blank" rel="noopener noreferrer">
            {t('Open in WhatsApp')}
          </a>
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('Dismiss')}
          className="-m-1.5 shrink-0 self-start rounded p-2.5 text-muted-foreground hover:text-foreground sm:self-center"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  )
}
