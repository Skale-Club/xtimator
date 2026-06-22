'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { projectSchema } from '@/lib/schemas/project'
import type { ProjectFormValues, InputMode } from '@/lib/schemas/project'
import { createProjectAction } from '@/lib/actions/project'

import { Form } from '@/components/ui/form'
import { StepModalitySelect } from '@/components/projects/step-modality-select'
import {
  captureHref,
  type CaptureMode,
} from '@/components/projects/estimate-creation-popup'
import { InlineAudioRecorder } from '@/components/projects/inline-audio-recorder'

const MODALITY_TO_CAPTURE: Record<InputMode, CaptureMode> = {
  audio: 'audio',
  text: 'text',
  photos: 'photos',
  mixed: 'audio',
}

interface NewProjectWizardProps {
  /** Called when switching into/out of the inline recording step so the parent dialog can resize. */
  onStepChange?: (step: 'modality' | 'recording') => void
}

export function NewProjectWizard({ onStepChange }: NewProjectWizardProps = {}) {
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<'modality' | 'recording'>('modality')
  const [recordingProject, setRecordingProject] = useState<{ id: string; company_id: string } | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      clientId: undefined,
      clientName: '',
      inputMode: undefined,
    },
  })

  const selectedMode = form.watch('inputMode')

  function handleSelect(mode: InputMode) {
    if (isPending) return
    form.setValue('inputMode', mode, { shouldValidate: true })

    startTransition(async () => {
      const clientId = searchParams.get('clientId') ?? form.getValues().clientId
      const values = { ...form.getValues(), inputMode: mode, clientId }
      const result = await createProjectAction(values)
      if ('error' in result) {
        toast.error(result.error)
        return
      }

      if (mode === 'audio') {
        // Audio: stay in this dialog and show the inline recording UI
        setRecordingProject({ id: result.data.id, company_id: result.data.company_id as string })
        setStep('recording')
        onStepChange?.('recording')
        return
      }

      // Text / Photos: hand off to EstimateCreationPopup via URL params (existing flow)
      const captureMode = MODALITY_TO_CAPTURE[mode]
      const next = captureHref({
        pathname,
        search: searchParams.toString(),
        mode: captureMode,
        projectId: result.data.id,
      })
      router.replace(next, { scroll: false })
    })
  }

  function handleBack() {
    setStep('modality')
    setRecordingProject(null)
    form.reset()
    onStepChange?.('modality')
  }

  if (step === 'recording' && recordingProject) {
    return (
      <InlineAudioRecorder
        projectId={recordingProject.id}
        companyId={recordingProject.company_id}
        onBack={handleBack}
      />
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()}>
        <StepModalitySelect
          form={form}
          onSelect={handleSelect}
          isPending={isPending}
          pendingMode={isPending ? selectedMode : undefined}
        />
      </form>
    </Form>
  )
}
