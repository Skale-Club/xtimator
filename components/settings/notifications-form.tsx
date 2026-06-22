'use client'

/**
 * Phase 77 / Phase 104 — Per-category notification preferences
 * + Web Push enable scaffold.
 *
 * Renders a 3-category × 4-channel matrix (Estimates, Billing, System ×
 * {in_app, email, whatsapp, sms}) plus a master "email digest enabled" switch
 * and a browser-push enable button.
 *
 * WhatsApp + SMS are paid/consent-gated channels: their switches render but are
 * DISABLED until a verified phone is on file (Wave 2 wires the real enable + the
 * per-channel opt-in). This wave only renders the disabled-by-default columns
 * driven by the `verifiedPhone` prop.
 *
 * Save flow: PATCH /api/notifications/preferences with the full categories
 * object (now 4-channel) + email_digest_enabled. Push subscription is persisted
 * by `enableBrowserPush` directly (separate endpoint).
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
import type { EventCategory, ChannelPrefs } from '@/lib/notifications/event-types'

// Only the 3 visible categories are configurable. `_dropped` is internal.
type VisibleCategory = Extract<EventCategory, 'estimate' | 'billing' | 'system'>

const CATEGORIES: ReadonlyArray<{
  key: VisibleCategory
  label: string
  description: string
}> = [
  { key: 'estimate', label: 'Estimates', description: 'Views, accepts, declines, expirations.' },
  { key: 'billing', label: 'Billing', description: 'Payments, trial, quota, plan changes.' },
  { key: 'system', label: 'System', description: 'Maintenance and platform announcements.' },
]

export interface NotificationsFormInitial {
  categories: Record<
    string,
    { in_app?: boolean; email?: boolean; whatsapp?: boolean; sms?: boolean }
  >
  email_digest_enabled: boolean
  push_enabled: boolean
}

/**
 * The exact paid-channel SMS consent copy shown at opt-in. Stored verbatim as
 * `sms_opt_in_consent_text` for TCPA audit when the owner first enables SMS.
 */
export const SMS_CONSENT_COPY =
  'SMS is a paid channel. By enabling it you agree to receive notification text messages — message and data rates may apply. You can turn this off at any time.'

export interface NotificationsFormProps {
  initial: NotificationsFormInitial
  defaults: Record<EventCategory, ChannelPrefs>
  /**
   * The owner's verified phone (E.164) on file, or null when none. WhatsApp + SMS
   * switches are disabled when null.
   */
  verifiedPhone?: string | null
  /** Whether the owner has already opted into WhatsApp notifications. */
  whatsappOptIn?: boolean
  /** Whether the owner has already recorded explicit paid-SMS consent (TCPA). */
  smsOptIn?: boolean
}

type ChannelState = Record<VisibleCategory, ChannelPrefs>

function buildState(
  initial: NotificationsFormInitial,
  defaults: Record<EventCategory, ChannelPrefs>,
): ChannelState {
  const out = {} as ChannelState
  for (const c of CATEGORIES) {
    const fromInitial = initial.categories?.[c.key] ?? {}
    out[c.key] = {
      in_app: fromInitial.in_app ?? defaults[c.key].in_app,
      email: fromInitial.email ?? defaults[c.key].email,
      whatsapp: fromInitial.whatsapp ?? defaults[c.key].whatsapp,
      sms: fromInitial.sms ?? defaults[c.key].sms,
    }
  }
  return out
}

export function NotificationsForm({
  initial,
  defaults,
  verifiedPhone = null,
  whatsappOptIn = false,
  smsOptIn = false,
}: NotificationsFormProps) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(initial.push_enabled)
  const [emailDigest, setEmailDigest] = useState(initial.email_digest_enabled)
  const [matrix, setMatrix] = useState<ChannelState>(() =>
    buildState(initial, defaults),
  )
  // Per-channel opt-in state. SMS requires explicit paid-channel consent (TCPA)
  // before any send; flipping any SMS toggle ON without prior consent surfaces the
  // inline consent confirmation rather than silently enabling.
  const [smsConsent, setSmsConsent] = useState(smsOptIn)
  const [whatsappConsent, setWhatsappConsent] = useState(whatsappOptIn)
  const [smsConsentPending, setSmsConsentPending] = useState(false)

  const pushSupported = useMemo(() => {
    if (typeof window === 'undefined') return true
    return isPushSupported()
  }, [])

  const phoneOnFile = !!verifiedPhone

  function setChannel(
    cat: VisibleCategory,
    channel: 'in_app' | 'email' | 'whatsapp' | 'sms',
    value: boolean,
  ) {
    // First time SMS is turned ON without recorded consent → open the paid-channel
    // consent confirmation instead of enabling. The toggle reflects the request but
    // no SMS sends until consent is confirmed + saved.
    if (channel === 'sms' && value && !smsConsent) {
      setSmsConsentPending(true)
    }
    if (channel === 'whatsapp' && value && !whatsappConsent) {
      // WhatsApp is consent-gated too, but is not a billed channel, so enabling it
      // records opt-in directly (no paid-channel confirmation needed).
      setWhatsappConsent(true)
    }
    setMatrix((prev) => ({
      ...prev,
      [cat]: { ...prev[cat], [channel]: value },
    }))
  }

  function confirmSmsConsent() {
    setSmsConsent(true)
    setSmsConsentPending(false)
  }

  function declineSmsConsent() {
    // Roll the SMS toggles back off — consent was not given.
    setSmsConsentPending(false)
    setMatrix((prev) => {
      const next = { ...prev }
      for (const c of CATEGORIES) {
        next[c.key] = { ...next[c.key], sms: false }
      }
      return next
    })
  }

  function onSave() {
    startTransition(async () => {
      try {
        const nowIso = new Date().toISOString()
        const res = await fetch('/api/notifications/preferences', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            categories: matrix,
            email_digest_enabled: emailDigest,
            // Record the consent timestamps + the exact paid-SMS copy (TCPA audit).
            sms_opt_in_at: smsConsent ? nowIso : null,
            sms_opt_in_consent_text: smsConsent ? SMS_CONSENT_COPY : null,
            whatsapp_opt_in_at: whatsappConsent ? nowIso : null,
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
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>{t('Category')}</span>
              <span className="w-16 text-center">{t('In-app')}</span>
              <span className="w-16 text-center">{t('Email')}</span>
              <span className="w-16 text-center">{t('WhatsApp')}</span>
              <span className="w-16 text-center">{t('SMS')}</span>
            </div>
            {CATEGORIES.map((c) => {
              const state = matrix[c.key]
              return (
                <div
                  key={c.key}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
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
                  <div className="flex w-16 justify-center">
                    <Switch
                      data-testid={`pref-whatsapp-${c.key}`}
                      checked={state.whatsapp && phoneOnFile}
                      disabled={!phoneOnFile}
                      onCheckedChange={(v) => setChannel(c.key, 'whatsapp', v)}
                      aria-label={`${t(c.label)} ${t('WhatsApp')}`}
                    />
                  </div>
                  <div className="flex w-16 justify-center">
                    <Switch
                      data-testid={`pref-sms-${c.key}`}
                      checked={state.sms && phoneOnFile}
                      disabled={!phoneOnFile}
                      onCheckedChange={(v) => setChannel(c.key, 'sms', v)}
                      aria-label={`${t(c.label)} ${t('SMS')}`}
                    />
                  </div>
                </div>
              )
            })}
            {!phoneOnFile && (
              <div className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                {t(
                  'Add a verified phone in your profile to enable WhatsApp and SMS notifications.',
                )}
              </div>
            )}
          </div>

          {smsConsentPending && (
            <div
              data-testid="sms-consent"
              className="rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
            >
              <p className="font-medium">{t('Enable paid SMS notifications?')}</p>
              <p className="mt-1 text-muted-foreground">{t(SMS_CONSENT_COPY)}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  data-testid="sms-consent-confirm"
                  onClick={confirmSmsConsent}
                >
                  {t('I agree — enable SMS')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="sms-consent-decline"
                  onClick={declineSmsConsent}
                >
                  {t('Cancel')}
                </Button>
              </div>
            </div>
          )}

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
