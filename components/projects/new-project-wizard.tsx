'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { projectSchema, STEP_FIELDS } from '@/lib/schemas/project'
import type { ProjectFormValues } from '@/lib/schemas/project'
import type { ClientWithCount } from '@/lib/queries/clients'
import { createProjectAction } from '@/lib/actions/project'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ProjectStepIndicator } from '@/components/projects/project-step-indicator'
import { StepClientSelect } from '@/components/projects/step-client-select'
import { StepProjectDetails } from '@/components/projects/step-project-details'
import { StepConfirmation } from '@/components/projects/step-confirmation'

interface NewProjectWizardProps {
  clients: ClientWithCount[]
  projectTypes: string[]
}

export function NewProjectWizard({ clients, projectTypes }: NewProjectWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isPending, startTransition] = useTransition()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      clientId: '',
      clientName: '',
      name: '',
      projectType: '',
      customProjectType: '',
      targetBudget: '',
    },
  })

  async function handleNext() {
    const fields = STEP_FIELDS[currentStep]
    const valid = await form.trigger(fields as (keyof ProjectFormValues)[])
    if (valid && currentStep < 3) {
      setCurrentStep((prev) => prev + 1)
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  function handleStepClick(step: number) {
    setCurrentStep(step)
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createProjectAction(form.getValues())
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Project created!')
      router.push(`/projects/${result.data.id}`)
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        {/* Step indicator */}
        <ProjectStepIndicator
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />

        <Separator className="my-6" />

        {/* Step content */}
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="min-h-[280px]">
              {currentStep === 1 && (
                <StepClientSelect form={form} clients={clients} />
              )}
              {currentStep === 2 && (
                <StepProjectDetails form={form} projectTypes={projectTypes} />
              )}
              {currentStep === 3 && (
                <StepConfirmation form={form} />
              )}
            </div>

            <Separator className="my-6" />

            {/* Navigation footer */}
            <div className="flex justify-between">
              {currentStep > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-[44px]"
                  onClick={handleBack}
                  disabled={isPending}
                >
                  Back
                </Button>
              ) : (
                <div />
              )}

              {currentStep < 3 ? (
                <Button
                  type="button"
                  className="min-h-[44px]"
                  onClick={handleNext}
                  disabled={isPending}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-[44px]"
                  onClick={handleSubmit}
                  disabled={isPending}
                >
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Project
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
