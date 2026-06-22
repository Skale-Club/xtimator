'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StepModalitySelect } from '@/components/projects/step-modality-select'
import { InlineAudioRecorder } from '@/components/projects/inline-audio-recorder'
import type { InputMode } from '@/lib/schemas/project'
import type { CaptureMode } from '@/components/projects/estimate-creation-popup'
import { useTranslation } from '@/lib/i18n/use-translation'

interface CaptureModePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (mode: CaptureMode) => void
  projectId?: string
  companyId?: string
}

export function CaptureModePicker({
  open,
  onOpenChange,
  onSelect,
  projectId,
  companyId,
}: CaptureModePickerProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [step, setStep] = useState<'modality' | 'recording'>('modality')

  function handleSelect(mode: InputMode) {
    if (mode === 'mixed') return
    if (mode === 'audio' && projectId && companyId) {
      setStep('recording')
      return
    }
    onOpenChange(false)
    onSelect(mode as CaptureMode)
  }

  function handleBack() {
    setStep('modality')
  }

  function handleComplete() {
    onOpenChange(false)
    setStep('modality')
    router.refresh()
  }

  function handleOpenChange(next: boolean) {
    if (!next) setStep('modality')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'recording' ? t('Record voice note') : t('Add input to estimate')}
          </DialogTitle>
        </DialogHeader>
        {step === 'modality' ? (
          <div className="pt-2 pb-1">
            <StepModalitySelect onSelect={handleSelect} />
          </div>
        ) : (
          projectId && companyId && (
            <InlineAudioRecorder
              projectId={projectId}
              companyId={companyId}
              onBack={handleBack}
              onComplete={handleComplete}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
