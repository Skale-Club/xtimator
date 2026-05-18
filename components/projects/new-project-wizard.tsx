'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { projectSchema } from '@/lib/schemas/project'
import type { ProjectFormValues } from '@/lib/schemas/project'
import type { InputMode } from '@/lib/schemas/project'
import { createProjectAction } from '@/lib/actions/project'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StepModalitySelect } from '@/components/projects/step-modality-select'

/**
 * Single-step modality picker. Project is created on submit with no client
 * (clientId = null). Linking a client happens later from the project workspace
 * Overview tab (Link Client card from Phase 29). This keeps "from intent to
 * capture" to one decision.
 */
const MODALITY_ROUTES: Record<InputMode, string> = {
  audio: '/capture',
  text: '/describe',
  photos: '/photos-input',
  mixed: '/capture',
}

export function NewProjectWizard() {
  const router = useRouter()
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

  function handleSubmit() {
    if (!selectedMode) {
      form.setError('inputMode', { message: 'Please select a modality to continue.' })
      return
    }

    startTransition(async () => {
      const values = form.getValues()
      const result = await createProjectAction(values)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      const route = MODALITY_ROUTES[values.inputMode!] ?? '/capture'
      router.push(`/projects/${result.data.id}${route}`)
    })
  }

  const submitLabel = selectedMode
    ? `Start ${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)} capture`
    : 'Choose a modality'

  return (
    <Card variant="glass">
      <CardContent className="p-6 sm:p-8">
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <StepModalitySelect form={form} />

            <Separator className="my-6" />

            <div className="flex justify-between items-center">
              <Button asChild type="button" variant="ghost" className="min-h-[44px]">
                <Link href="/dashboard">Cancel</Link>
              </Button>

              <Button
                type="button"
                variant="primary"
                className="min-h-[44px]"
                onClick={handleSubmit}
                disabled={isPending || !selectedMode}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
