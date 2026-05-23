'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { projectSchema } from '@/lib/schemas/project'
import type { ProjectFormValues, InputMode } from '@/lib/schemas/project'
import { createProjectAction } from '@/lib/actions/project'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { StepModalitySelect } from '@/components/projects/step-modality-select'

/**
 * Single-step modality picker. Clicking a card immediately creates the project
 * (with no client; clientId = null) and routes to the matching capture screen.
 * Linking a client happens later from the project workspace Overview tab.
 */
const MODALITY_ROUTES: Record<InputMode, string> = {
  audio: '/capture',
  text: '/describe',
  photos: '/photos-input',
  mixed: '/capture',
}

interface NewProjectWizardProps {
  /** Called when the user cancels or the dialog should close (modal mode). */
  onClose?: () => void
}

export function NewProjectWizard({ onClose }: NewProjectWizardProps = {}) {
  const [isPending, startTransition] = useTransition()

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
      const values = { ...form.getValues(), inputMode: mode }
      const result = await createProjectAction(values)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const route = MODALITY_ROUTES[mode] ?? '/capture'
      // Hard navigation: a soft router.push keeps the dialog rendered on top
      // of the (capture) layout while the new route hydrates (React transition
      // holds the old UI). window.location.href tears the whole page down
      // first, so the modal disappears together with the previous route.
      window.location.href = `/projects/${result.data.id}${route}`
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

        <Separator className="my-6" />

        <div className="flex justify-end items-center">
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px]"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
          ) : (
            <Button asChild type="button" variant="ghost" className="min-h-[44px]">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}
