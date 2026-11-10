'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
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
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveWhatsAppWelcomeConfig({ templateNames, videoUrls })
      if (!result.ok) toast.error(result.message)
      else toast.success('WhatsApp welcome settings saved.')
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">WhatsApp welcome</h3>
        <p className="text-sm text-muted-foreground mt-1">
          The template (approved in Meta, utility category, with a quick-reply button) is sent
          right after onboarding to owners who gave WhatsApp consent. When they reply, the bot
          sends a short welcome sequence that includes the video below. Empty = not set (the
          template is skipped; a text placeholder replaces the video).
        </p>
      </div>
      <div className="grid gap-4 max-w-2xl">
        {LANGS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`wa-welcome-template-${key}`}>Template name ({label})</Label>
            <Input
              id={`wa-welcome-template-${key}`}
              value={templateNames[key]}
              onChange={(e) => setTemplateNames({ ...templateNames, [key]: e.target.value })}
              disabled={isPending}
              placeholder="e.g. welcome_start_pt"
            />
          </div>
        ))}
        {LANGS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
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
      <Button onClick={handleSave} disabled={isPending} className="min-h-[44px]">
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
    </div>
  )
}
