'use client'

import { Bell, BellRing, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useAppTranslation } from '@/lib/i18n/use-translation'
import { usePushOptIn } from '@/hooks/use-push-opt-in'

/**
 * "Notify me on this device" for the generation checklist. Once enabled, the
 * server pushes the result to this device when the estimate is done, even
 * with the app closed or the phone locked (lib/notifications/estimate-push.ts).
 */
export function PushOptIn() {
  const { t, language } = useAppTranslation()
  const { status, busy, enable } = usePushOptIn(language)

  if (status === 'loading' || status === 'hidden') return null

  if (status === 'enabled') {
    return (
      <p
        className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
        data-testid="push-opt-in-enabled"
      >
        <BellRing className="h-3.5 w-3.5 text-primary" aria-hidden />
        {t('We will notify this device, even with the app closed.')}
      </p>
    )
  }

  if (status === 'ios_install') {
    return (
      <p
        className="flex items-start justify-center gap-1.5 text-xs text-muted-foreground"
        data-testid="push-opt-in-ios"
      >
        <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t('On iPhone, add Xtimator to your Home Screen to get notified with the app closed.')}</span>
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        void enable().then((result) => {
          if (!result.ok && result.reason === 'error') {
            toast.error(t("Couldn't turn on notifications on this device."))
          }
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
      data-testid="push-opt-in-button"
    >
      <Bell className="h-3.5 w-3.5" aria-hidden />
      {t('Notify me on this device when it is ready')}
    </button>
  )
}
