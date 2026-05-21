'use client'

/**
 * Phase 77 plan 07 (NOTIF-08 + NOTIF-09) — Per-category notification preferences
 * + Web Push enable scaffold.
 *
 * Renders a category × channel matrix (8 categories × {in_app, email}) plus
 * a master "email digest enabled" switch and a browser-push enable button.
 *
 * Save flow: PATCH /api/notifications/preferences with the full categories
 * object + email_digest_enabled. Push subscription is persisted by
 * `enableBrowserPush` directly (separate endpoint).
 */

import { useMemo, useState, useTransition } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { CategoryIcon } from '@/components/notifications/category-icon'
import {
  enableBrowserPush,
  disableBrowserPush,
  isPushSupported,
} from '@/lib/notifications/push-client'
import type { EventCategory } from '@/lib/notifications/event-types'

const CATEGORIES: ReadonlyArray<{
  key: EventCategory
  label: string
  description: string
}> = [
  { key: 'estimate', label: 'Estimates', description: 'Views, accepts, declines, expirations.' },
  { key: 'payment', label: 'Payments', description: 'Payments received and refunded.' },
  { key: 'trial', label: 'Trial', description: 'Trial expiring, expired, converted.' },
  { key: 'quota', label: 'Quota', description: 'Plan usage warnings.' },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Inbound voice and photo messages.' },
  { key: 'ai_job', label: 'AI Jobs', description: 'Background job completion and failures.' },
  { key: 'admin', label: 'Admin', description: 'Tier changes and bonus credits.' },
  { key: 'system', label: 'System', description: 'Maintenance and platform announcements.' },
]

export interface NotificationsFormInitial {
  categories: Record<string, { in_app?: boolean; email?: boolean }>
  email_digest_enabled: boolean
  push_enabled: boolean
}

export interface NotificationsFormProps {
  initial: NotificationsFormInitial
  defaults: Record<EventCategory, { in_app: boolean; email: boolean }>
}

type ChannelState = Record<EventCategory, { in_app: boolean; email: boolean }>

function buildState(
  initial: NotificationsFormInitial,
  defaults: Record<EventCategory, { in_app: boolean; email: boolean }>,
): ChannelState {
  const out = {} as ChannelState
  for (const c of CATEGORIES) {
    const fromInitial = initial.categories?.[c.key] ?? {}
    out[c.key] = {
      in_app: fromInitial.in_app ?? defaults[c.key].in_app,
      email: fromInitial.email ?? defaults[c.key].email,
    }
  }
  return out
}

export function NotificationsForm({ initial, defaults }: NotificationsFormProps) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(initial.push_enabled)
  const [emailDigest, setEmailDigest] = useState(initial.email_digest_enabled)
  const [matrix, setMatrix] = useState<ChannelState>(() =>
    buildState(initial, defaults),
  )

  const pushSupported = useMemo(() => {
    if (typeof window === 'undefined') return true
    return isPushSupported()
  }, [])

  function setChannel(cat: EventCategory, channel: 'in_app' | 'email', value: boolean) {
    setMatrix((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [channel]: value },
    }))
  }

  function onSave() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/notifications/preferences', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            categories: matrix,
            email_digest_enabled: emailDigest,
          }),
        })
        if (!res.ok && res.status !== 204) {
          toast.error(t('Could not save notification preferences.'))
          return
        }
        toast.success(t('Notification preferences saved.'))
      } catch {
        toast.error(t('Could not save notification preferences.'))
      }
    })
  }

  async function onTogglePush() {
    setPushBusy(true)
    try {
      if (pushEnabled) {
        await disableBrowserPush()
        setPushEnabled(false)
        toast.success(t('Browser notifications disabled.'))
        return
      }
      const result = await enableBrowserPush()
      if (result.ok) {
        setPushEnabled(true)
        toast.success(t('Browser notifications enabled.'))
      } else if (result.reason === 'denied') {
        toast.error(t('Permission denied | enable in browser settings.'))
      } else if (result.reason === 'unsupported') {
        toast.error(t('Browser notifications not supported in this browser.'))
      } else {
        toast.error(t('Could not enable browser notifications.'))
      }
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="w-full rounded-[var(--radius-md)]">
        <CardHeader className="border-b border-border">
          <CardTitle>{t('Notification preferences')}</CardTitle>
          <CardDescription>
            {t('Choose how you want to be notified for each event category.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
            <Label htmlFor="master-email-digest" className="grid flex-1 gap-1">
              <span className="font-medium">{t('Email digest enabled')}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t('Master switch | turn off to silence every email notification.')}
              </span>
            </Label>
            <Switch
              id="master-email-digest"
              data-testid="master-email-digest"
              checked={emailDigest}
              onCheckedChange={setEmailDigest}
            />
          </div>

          <div className="overflow-hidden rounded-[var(--radius-md)] border border-border">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>{t('Category')}</span>
              <span className="w-16 text-center">{t('In-app')}</span>
              <span className="w-16 text-center">{t('Email')}</span>
            </div>
            {CATEGORIES.map((c) => {
              const state = matrix[c.key]
              return (
                <div
                  key={c.key}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <CategoryIcon
                      category={c.key}
                      className="h-4 w-4 text-[hsl(var(--primary))]"
                    />
                    <div className="grid">
                      <span className="text-sm font-medium">{t(c.label)}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(c.description)}
                      </span>
                    </div>
                  </div>
                  <div className="flex w-16 justify-center">
                    <Switch
                      data-testid={`pref-in_app-${c.key}`}
                      checked={state.in_app}
                      onCheckedChange={(v) => setChannel(c.key, 'in_app', v)}
                      aria-label={`${t(c.label)} ${t('In-app')}`}
                    />
                  </div>
                  <div className="flex w-16 justify-center">
                    <Switch
                      data-testid={`pref-email-${c.key}`}
                      checked={state.email && emailDigest}
                      disabled={!emailDigest}
                      onCheckedChange={(v) => setChannel(c.key, 'email', v)}
                      aria-label={`${t(c.label)} ${t('Email')}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={onSave}
              disabled={isPending}
              data-testid="save-prefs"
              className="min-w-40"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('Save preferences')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full rounded-[var(--radius-md)]">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" aria-hidden />
            {t('Browser notifications')}
          </CardTitle>
          <CardDescription>
            {pushSupported
              ? t('Show desktop notifications even when Xtimator is in a background tab.')
              : t('Browser notifications not supported in this browser')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <div className="text-sm text-muted-foreground">
            {pushEnabled
              ? t('Enabled | browser may show desktop alerts for new notifications.')
              : t('Not enabled. Click the button to grant permission.')}
          </div>
          <Button
            type="button"
            variant={pushEnabled ? 'outline' : 'default'}
            disabled={!pushSupported || pushBusy}
            onClick={onTogglePush}
            data-testid="enable-push"
          >
            {pushBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pushEnabled ? t('Disable browser notifications') : t('Enable browser notifications')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
