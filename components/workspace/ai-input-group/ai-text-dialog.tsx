'use client'

/**
 * Quick task 260522-kf2 (QUICK-KF2-UI-04) — Text instruction dialog.
 *
 * Typed-instruction counterpart to AIVoiceDialog. Adds the text as a
 * recording row (storage_path: NULL, transcript: text) so the AI
 * estimate generator sees it as part of the project corpus, then
 * triggers /api/generate-estimate via useAIInputSubmit.
 */

import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useAIInputSubmit, type SubmitStage } from './use-ai-input-submit'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { EstimateWithSections } from '@/lib/queries/estimate'

interface AITextDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  companyId: string
  currentEstimate: EstimateWithSections | null
  estimateLanguage?: EstimateLanguage
}

export function AITextDialog({
  open,
  onOpenChange,
  projectId,
  companyId,
  currentEstimate,
  estimateLanguage,
}: AITextDialogProps) {
  const { t } = useTranslation()
  const { submitText, isSubmitting, stage } = useAIInputSubmit({
    projectId,
    companyId,
    currentEstimate,
    estimateLanguage,
  })
  const [text, setText] = useState('')

  // Reset textarea when dialog closes.
  useEffect(() => {
    if (!open) setText('')
  }, [open])

  async function handleSubmit() {
    const ok = await submitText(text)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('Type instruction')}
          </DialogTitle>
          <DialogDescription>
            {t('Describe the job in writing. The AI will generate or refine your estimate from your instruction.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('e.g. Replace 80 linear feet of gutters on a 2-story Victorian; haul away debris.')}
            rows={6}
            disabled={isSubmitting}
            className="resize-y"
          />

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="min-h-[44px]"
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !text.trim()}
              className="gap-1.5 min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {stageLabel(stage, t)}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t('Generate Estimate')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function stageLabel(stage: SubmitStage, t: (s: string) => string): string {
  switch (stage) {
    case 'uploading':    return t('Saving...')
    case 'transcribing': return t('Transcribing with AI...')
    case 'generating':   return t('Generating estimate...')
    case 'done':         return t('Done')
    default:             return t('Working...')
  }
}
