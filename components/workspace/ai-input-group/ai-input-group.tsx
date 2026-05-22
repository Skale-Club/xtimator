'use client'

/**
 * Quick task 260522-kf2 (QUICK-KF2-UI-01, UI-02) — Header AI Input Group.
 *
 * Replaces the Audio tab with a single discoverable surface in the
 * project header: a decorative Sparkles AI indicator + two circular
 * icon buttons (mic + text) that open the voice/text dialogs.
 *
 * Visual style mirrors the brand gradient pill used in
 * estimate-tab.tsx's empty-state CTA, scaled to header size.
 */

import { useState } from 'react'
import { Mic, Sparkles, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { AIVoiceDialog } from './ai-voice-dialog'
import { AITextDialog } from './ai-text-dialog'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { EstimateWithSections } from '@/lib/queries/estimate'

interface AIInputGroupProps {
  projectId: string
  companyId: string
  currentEstimate: EstimateWithSections | null
  estimateLanguage?: EstimateLanguage
}

export function AIInputGroup({
  projectId,
  companyId,
  currentEstimate,
  estimateLanguage,
}: AIInputGroupProps) {
  const { t } = useTranslation()
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [textOpen, setTextOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2" data-testid="ai-input-group">
        {/* Sparkles indicator — decorative, NOT a button (aria-hidden). */}
        <div
          aria-hidden="true"
          className="h-11 w-11 rounded-full gradient-brand shadow-glow-brand flex items-center justify-center shrink-0"
        >
          <Sparkles className="h-5 w-5 text-white" />
        </div>

        {/* Mic button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setVoiceOpen(true)}
          aria-label={t('Record voice instruction')}
          title={t('Record voice instruction')}
          className="h-11 w-11 rounded-full"
        >
          <Mic className="h-5 w-5" />
        </Button>

        {/* Text button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setTextOpen(true)}
          aria-label={t('Type instruction')}
          title={t('Type instruction')}
          className="h-11 w-11 rounded-full"
        >
          <Type className="h-5 w-5" />
        </Button>
      </div>

      <AIVoiceDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        projectId={projectId}
        companyId={companyId}
        currentEstimate={currentEstimate}
        estimateLanguage={estimateLanguage}
      />
      <AITextDialog
        open={textOpen}
        onOpenChange={setTextOpen}
        projectId={projectId}
        companyId={companyId}
        currentEstimate={currentEstimate}
        estimateLanguage={estimateLanguage}
      />
    </>
  )
}
