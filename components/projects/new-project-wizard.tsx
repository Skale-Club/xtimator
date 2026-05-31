'use client'

import { useTransition } from 'react'
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

/**
 * Single-step modality picker. Clicking a card creates the project (with no
 * client; clientId = null) and hands off to the EstimateCreationPopup by
 * swapping URL params — `?modal=new-project` is removed and
 * `?capture=<mode>&projectId=<id>` is added, so the NewProjectDialog closes
 * and the EstimateCreationPopup opens without unmounting the app shell.
 * Linking a client happens later from the project workspace Overview.
 */
const MODALITY_TO_CAPTURE: Record<InputMode, CaptureMode> = {
  audio: 'audio',
  text: 'text',
  photos: 'photos',
  mixed: 'audio',
}

interface NewProjectWizardProps {
  /** Called when the user cancels or the dialog should close (modal mode). */
  onClose?: () => void
}

export function NewProjectWizard(_props: NewProjectWizardProps = {}) {
  const [isPending, startTransition] = useTransition()
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
      // Pre-link to a client when the modal was opened from a client page
      // (?clientId=<id>). Falls back to the form value (currently always unset).
      const clientId = searchParams.get('clientId') ?? form.getValues().clientId
      const values = { ...form.getValues(), inputMode: mode, clientId }
      const result = await createProjectAction(values)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      // Swap URL params: drop ?modal=new-project (closes NewProjectDialog),
      // add ?capture=<mode>&projectId=<id> (opens EstimateCreationPopup).
      // Both dialogs are mounted in the app shell layout, so the user stays
      // inside the same React tree — no hard navigation, no shell teardown.
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

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()}>
        <StepModalitySelect
          form={form}
          onSelect={handleSelect}
          isPending={isPending}
          pendingMode={isPending ? selectedMode : undefined}
        />

        {/* Dialog close is handled by the DialogContent X button */}
      </form>
    </Form>
  )
}
