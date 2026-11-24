'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { SettingsSaveBar } from '@/components/settings/settings-ui'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { saveWhatsAppWelcomeConfig } from './actions'

type PerLanguage = { pt: string; en: string; es: string }

interface WhatsAppWelcomeFormProps {
  currentTemplateNames: PerLanguage
  currentVideoUrls: PerLanguage
}

const LANGS: Array<{ key: keyof PerLanguage; label: string }> = [
  { key: 'pt', label: 'Portuguese' },
  { key: 'en', label: 'English' },
  { key: 'es', label: 'Spanish' },
]

export function WhatsAppWelcomeForm({
  currentTemplateNames,
  currentVideoUrls,
}: WhatsAppWelcomeFormProps) {
  const [templateNames, setTemplateNames] = useState(currentTemplateNames)
  const [videoUrls, setVideoUrls] = useState(currentVideoUrls)
  const [saved, setSaved] = useState({ templateNames: currentTemplateNames, videoUrls: currentVideoUrls })
  const [isPending, startTransition] = useTransition()
  const dirty = JSON.stringify({ templateNames, videoUrls }) !== JSON.stringify(saved)

  function handleSave() {
    startTransition(async () => {
      const result = await saveWhatsAppWelcomeConfig({ templateNames, videoUrls })
      if (!result.ok) toast.error(result.message)
      else {
        setSaved({ templateNames, videoUrls })
        toast.success('WhatsApp welcome settings saved.')
      }
    })
  }

  return (
    <div id="whatsapp-welcome" className="scroll-mt-8 rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">WhatsApp welcome</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The Meta-approved template must have one quick-reply button and no body variables. It is sent
          right after onboarding to owners who gave WhatsApp consent. When they reply, the bot
          sends a short welcome sequence that includes the video below. Empty = not set (the
          template is skipped; a short usage guide replaces the video). Import the matching
          locale in Inbox Settings before activation.
        </p>
      </div>
      <div className="grid gap-6 max-w-2xl">
        {LANGS.map(({ key, label }) => (
          <div key={key} className="grid gap-2">
            <Label htmlFor={`wa-welcome-template-${key}`}>Template name ({label})</Label>
            <Input
              id={`wa-welcome-template-${key}`}
              value={templateNames[key]}
              onChange={(e) => setTemplateNames({ ...templateNames, [key]: e.target.value })}
              disabled={isPending}
              placeholder="e.g. owner_welcome_start"
            />
          </div>
        ))}
        {LANGS.map(({ key, label }) => (
          <div key={key} className="grid gap-2">
            <Label htmlFor={`wa-welcome-video-${key}`}>How-it-works video URL ({label})</Label>
            <Input
              id={`wa-welcome-video-${key}`}
              value={videoUrls[key]}
              onChange={(e) => setVideoUrls({ ...videoUrls, [key]: e.target.value })}
              disabled={isPending}
              placeholder="https://"
            />
          </div>
        ))}
      </div>
      <SettingsSaveBar
        dirty={dirty}
        pending={isPending}
        onDiscard={() => {
          setTemplateNames(saved.templateNames)
          setVideoUrls(saved.videoUrls)
        }}
        onSave={handleSave}
      />
    </div>
  )
}
