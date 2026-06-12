'use client'

import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveWhatsAppSystemPrompt } from './actions'

interface WhatsAppSystemPromptFormProps {
  currentPrompt: string
}

const MAX = 4000

export function WhatsAppSystemPromptForm({
  currentPrompt,
}: WhatsAppSystemPromptFormProps) {
  const [prompt, setPrompt] = useState(currentPrompt)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await saveWhatsAppSystemPrompt(prompt)
      if (!result.ok) {
        toast.error(result.message)
      } else {
        toast.success('WhatsApp system prompt saved.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">WhatsApp System Prompt</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This text is appended to the estimate generation prompt ONLY for
          estimates generated via WhatsApp. The base currency, language,
          price-book, and security rules still apply.
        </p>
      </div>
      <div className="space-y-1 max-w-2xl">
        <Label htmlFor="wa-system-prompt">Additional instructions</Label>
        <Textarea
          id="wa-system-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX}
          rows={8}
          disabled={isPending}
          placeholder="e.g. Always include a 1-year workmanship warranty line and keep section titles short."
        />
        <p className="text-xs text-muted-foreground">
          {prompt.length} / {MAX}
        </p>
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
