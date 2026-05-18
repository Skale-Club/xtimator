'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { projectSchema, STEP_FIELDS } from '@/lib/schemas/project'
import type { ProjectFormValues } from '@/lib/schemas/project'
import type { InputMode } from '@/lib/schemas/project'
import type { ClientWithCount } from '@/lib/queries/clients'
import { createProjectAction } from '@/lib/actions/project'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StepClientSelect } from '@/components/projects/step-client-select'
import { StepModalitySelect } from '@/components/projects/step-modality-select'

interface NewProjectWizardProps {
  clients: ClientWithCount[]
}

// 2-step wizard: step 1 = client, step 2 = modality
type WizardStep = 1 | 2

const MODALITY_ROUTES: Record<InputMode, string> = {
  audio: '/capture',
  text: '/describe',
  photos: '/photos-input',
  mixed: '/capture',
}

export function NewProjectWizard({ clients }: NewProjectWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)

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

  function validateStep(step: WizardStep): boolean {
    const values = form.getValues()
    const requiredFields = STEP_FIELDS[step] as (keyof ProjectFormValues)[]

    for (const field of requiredFields) {
      const value = values[field]
      // inputMode at step 2 is required
      if (field === 'inputMode' && !value) {
        form.setError('inputMode', { message: 'Please select a modality to continue.' })
        return false
      }
    }
    return true
  }

  function handleContinue() {
    if (!validateStep(currentStep)) return
    if (currentStep === 1) {
      setCurrentStep(2)
    }
  }

  function handleBack() {
    setCurrentStep(1)
  }

  function handleSubmit() {
    if (!validateStep(2)) return

    startTransition(async () => {
      const values = form.getValues()
      const result = await createProjectAction(values)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      // Route based on input_mode
      const route = MODALITY_ROUTES[values.inputMode!] ?? '/capture'
      router.push(`/projects/${result.data.id}${route}`)
    })
  }

  const selectedMode = form.watch('inputMode')
  const submitLabel =
    selectedMode
      ? `Start ${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)} capture`
      : 'Continue'

  return (
    <Card variant="glass">
      <CardContent className="p-6 sm:p-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-colors ${
              currentStep >= 1
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            1
          </div>
          <div className="flex-1 h-0.5 bg-muted rounded">
            <div
              className={`h-full bg-primary rounded transition-all ${
                currentStep === 2 ? 'w-full' : 'w-0'
              }`}
            />
          </div>
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-colors ${
              currentStep >= 2
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            2
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="min-h-[280px]">
              {currentStep === 1 && <StepClientSelect form={form} clients={clients} />}
              {currentStep === 2 && <StepModalitySelect form={form} />}
            </div>

            <Separator className="my-6" />

            {/* Action footer with Back/Next navigation */}
            <div className="flex justify-between items-center">
              <Button
                asChild
                type="button"
                variant="ghost"
                className="min-h-[44px]"
              >
                <Link href="/dashboard">Cancel</Link>
              </Button>

              <div className="flex gap-2">
                {currentStep === 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={handleBack}
                  >
                    Back
                  </Button>
                )}

                {currentStep === 1 ? (
                  <Button
                    type="button"
                    className="min-h-[44px]"
                    onClick={handleContinue}
                    disabled={isPending}
                  >
                    Continue to modality
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="min-h-[44px]"
                    onClick={handleSubmit}
                    disabled={isPending || !selectedMode}
                  >
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {submitLabel}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
