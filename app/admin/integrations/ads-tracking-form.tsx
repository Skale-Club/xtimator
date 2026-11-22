'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { saveAdsTrackingSettings } from './actions'

export interface AdsTrackingFormValues {
  ga4Enabled: boolean
  metaEnabled: boolean
  consentPolicy: 'require_accept' | 'unless_rejected'
  metaTestEventCode: string
}

interface AdsTrackingFormProps {
  current: AdsTrackingFormValues
  ga4KeySaved: boolean
  metaKeySaved: boolean
}

function same(a: AdsTrackingFormValues, b: AdsTrackingFormValues): boolean {
  return (
    a.ga4Enabled === b.ga4Enabled &&
    a.metaEnabled === b.metaEnabled &&
    a.consentPolicy === b.consentPolicy &&
    a.metaTestEventCode === b.metaTestEventCode
  )
}

export function AdsTrackingForm({ current, ga4KeySaved, metaKeySaved }: AdsTrackingFormProps) {
  const [value, setValue] = useState(current)
  const [saved, setSaved] = useState(current)
  const [isPending, startTransition] = useTransition()
  const dirty = !same(value, saved)

  function handleSave() {
    startTransition(async () => {
      const result = await saveAdsTrackingSettings(value)
      if (!result.ok) {
        toast.error(result.message)
      } else {
        setSaved(value)
        toast.success('Ads tracking settings saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Send conversions</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Sign up, first estimate and purchase are reported from the server. Each destination sends only when its key
          above is saved and its switch is on. Every conversion is logged either way, so nothing is counted twice when
          you turn it on.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="ads-ga4-enabled">Google Analytics 4 (and Google Ads, by import)</Label>
            {!ga4KeySaved && <p className="text-xs text-muted-foreground mt-1">Save the GA4 key above first.</p>}
          </div>
          <Switch
            id="ads-ga4-enabled"
            checked={value.ga4Enabled}
            onCheckedChange={(checked) => setValue({ ...value, ga4Enabled: checked })}
            disabled={isPending}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="ads-meta-enabled">Meta Conversions API</Label>
            {!metaKeySaved && <p className="text-xs text-muted-foreground mt-1">Save the Meta key above first.</p>}
          </div>
          <Switch
            id="ads-meta-enabled"
            checked={value.metaEnabled}
            onCheckedChange={(checked) => setValue({ ...value, metaEnabled: checked })}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ads-consent-policy">Cookie consent</Label>
        <select
          id="ads-consent-policy"
          className="flex h-9 w-full max-w-lg rounded-md border border-input bg-transparent px-3 text-sm"
          value={value.consentPolicy}
          onChange={(e) =>
            setValue({ ...value, consentPolicy: e.target.value === 'require_accept' ? 'require_accept' : 'unless_rejected' })
          }
          disabled={isPending}
        >
          <option value="unless_rejected">Send unless the visitor rejected cookies</option>
          <option value="require_accept">Send only after the visitor accepted cookies</option>
        </select>
        <p className="text-xs text-muted-foreground max-w-lg">
          A visitor who clicked Reject, or whose browser sends Global Privacy Control, is never sent to Meta or Google
          Ads in either mode (California law requires honoring GPC).
        </p>
      </div>

      <div className="grid gap-2 max-w-lg">
        <Label htmlFor="ads-meta-test-code">Meta test event code (optional)</Label>
        <Input
          id="ads-meta-test-code"
          value={value.metaTestEventCode}
          onChange={(e) => setValue({ ...value, metaTestEventCode: e.target.value })}
          placeholder="TEST12345"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          From Events Manager → Test events. While set, Meta shows the events there instead of counting them. Clear it
          once the test passes.
        </p>
      </div>

      <SettingsSaveBar dirty={dirty} pending={isPending} onDiscard={() => setValue(saved)} onSave={handleSave} />
    </div>
  )
}
