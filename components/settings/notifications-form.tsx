'use client'

/**
 * Phase 77 / Phase 104 — Per-category notification preferences
 * + Web Push enable scaffold.
 *
 * Renders a 3-category × 3-channel matrix (Estimates, Billing, System ×
 * {in_app, email, sms}) plus a master "email digest enabled" switch
 * and a browser-push enable button.
 *
 * SMS is a paid/consent-gated channel: its switch renders but is
 * DISABLED until a verified phone is on file (Wave 2 wires the real enable + the
 * per-channel opt-in). This wave only renders the disabled-by-default column
 * driven by the `verifiedPhone` prop.
 *
 * WhatsApp is platform-managed and cannot be enabled by tenants (D-15).
 *
 * Save flow: PATCH /api/notifications/preferences with the full categories
 * object (now 3-channel) + email_digest_enabled. Push subscription is persisted
 * by `enableBrowserPush` directly (separate endpoint).
 */

import { useMemo, useState, useTransition } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { SettingsCard, SettingsRow, SettingsRows, SettingsStack } from '@/components/settings/settings-ui'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useAppLanguage } from '@/lib/i18n/language-context'
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
   * The owner's verified phone (E.164) on file, or null when none. SMS
   * switch is disabled when null.
   */
  verifiedPhone?: string | null
  /** Whether the owner has already recorded explicit paid-SMS consent (TCPA). */
  smsOptIn?: boolean
  /** Render every Switch/Button disabled and show the read-only footer note (public demo). */
  readOnly?: boolean
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
  smsOptIn = false,
  readOnly = false,
}: NotificationsFormProps) {
  const { t } = useTranslation()
  const appLanguage = useAppLanguage()
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
  const [smsConsentPending, setSmsConsentPending] = useState(false)

  const pushSupported = useMemo(() => {
    if (typeof window === 'undefined') return true
    return isPushSupported()
  }, [])

  const phoneOnFile = !!verifiedPhone

  function setChannel(
    cat: VisibleCategory,
    channel: 'in_app' | 'email' | 'sms',
    value: boolean,
  ) {
    // First time SMS is turned ON without recorded consent → open the paid-channel
    // consent confirmation instead of enabling. The toggle reflects the request but
    // no SMS sends until consent is confirmed + saved.
    if (channel === 'sms' && value && !smsConsent) {
      setSmsConsentPending(true)
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
      const result = await enableBrowserPush(appLanguage)
      if (result.ok) {
        setPushEnabled(true)
        toast.success(t('Browser notifications enabled.'))
      } else if (result.reason === 'denied') {
        toast.error(t('Permission denied | enable in browser settings.'))
      } else if (result.reason === 'not_configured') {
        toast.error(t('Push notifications are not available yet.'))
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
    <>
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
      <SettingsStack>
      <SettingsCard
        title={t('What to notify you about')}
        description={t('Pick a channel for each kind of event.')}
        bodyClassName="p-0 sm:p-0"
        footer={
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={isPending}
            data-testid="save-prefs"
            className="min-w-28"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('Save preferences')}
          </Button>
        }
      >
        <div className="border-b border-[var(--glass-border)] px-5 py-4 sm:px-6">
          <SettingsRows>
            <SettingsRow
              htmlFor="master-email-digest"
              label={t('Email notifications')}
              description={t('Turn off to stop every notification email at once.')}
            >
              <Switch
                id="master-email-digest"
                data-testid="master-email-digest"
                checked={emailDigest}
                onCheckedChange={setEmailDigest}
              />
            </SettingsRow>
          </SettingsRows>
        </div>

        <div className="grid grid-cols-[1fr_repeat(3,2.75rem)] items-center gap-x-2 border-b border-[var(--glass-border)] px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[1fr_repeat(3,4rem)] sm:gap-x-4 sm:px-6">
          <span>{t('Event')}</span>
          <span className="text-center">{t('In-app')}</span>
          <span className="text-center">{t('Email')}</span>
          <span className="text-center">{t('SMS')}</span>
        </div>
        <div className="divide-y divide-[var(--glass-border)]">
          {CATEGORIES.map((c) => {
            const state = matrix[c.key]
            return (
              <div
                key={c.key}
                className="grid grid-cols-[1fr_repeat(3,2.75rem)] items-center gap-x-2 px-5 py-3 sm:grid-cols-[1fr_repeat(3,4rem)] sm:gap-x-4 sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CategoryIcon
                    category={c.key}
                    className="hidden h-4 w-4 shrink-0 text-[hsl(var(--primary))] sm:block"
                  />
                  <div className="grid min-w-0">
                    <span className="text-sm font-medium">{t(c.label)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(c.description)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-center">
                  <Switch
                    data-testid={`pref-in_app-${c.key}`}
                    checked={state.in_app}
                    onCheckedChange={(v) => setChannel(c.key, 'in_app', v)}
                    aria-label={`${t(c.label)} ${t('In-app')}`}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    data-testid={`pref-email-${c.key}`}
                    checked={state.email && emailDigest}
                    disabled={!emailDigest}
                    onCheckedChange={(v) => setChannel(c.key, 'email', v)}
                    aria-label={`${t(c.label)} ${t('Email')}`}
                  />
                </div>
                <div className="flex justify-center">
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
        </div>
        {!phoneOnFile && (
          <p className="border-t border-[var(--glass-border)] px-5 py-3 text-xs text-muted-foreground sm:px-6">
            {t('Add a verified phone in your profile to enable SMS notifications.')}
          </p>
        )}

        {smsConsentPending && (
          <div
            data-testid="sms-consent"
            className="m-5 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:mx-6"
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
                {t('I agree, enable SMS')}
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
      </SettingsCard>

      <SettingsCard
        title={t('Browser notifications')}
        description={
          pushSupported
            ? t('Desktop alerts, even when Xtimator is in a background tab.')
            : t('Browser notifications not supported in this browser')
        }
        action={
          <Button
            type="button"
            size="sm"
            variant={pushEnabled ? 'outline' : 'default'}
            disabled={!pushSupported || pushBusy}
            onClick={onTogglePush}
            data-testid="enable-push"
          >
            {pushBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            {pushEnabled ? t('Turn off') : t('Turn on')}
          </Button>
        }
      />
      </SettingsStack>
      </fieldset>
      {readOnly && (
        <p className="mt-6 text-sm text-muted-foreground">
          {t('This is a read-only demo. Create a free account to manage your notification settings.')}
        </p>
      )}
    </>
  )
}
