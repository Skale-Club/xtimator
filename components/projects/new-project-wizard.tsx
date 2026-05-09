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
import type { ClientWithCount } from '@/lib/queries/clients'
import { createProjectAction } from '@/lib/actions/project'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StepClientSelect } from '@/components/projects/step-client-select'

interface NewProjectWizardProps {
  clients: ClientWithCount[]
}

export function NewProjectWizard({ clients }: NewProjectWizardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      clientId: undefined,
      clientName: '',
    },
  })

  function handleSubmit() {
    startTransition(async () => {
      const values = form.getValues()
      // Client is optional - no validation trigger needed
      const result = await createProjectAction(values)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      // Eager project creation (D-01): redirect to capture screen (D-02)
      router.push(`/projects/${result.data.id}/capture`)
    })
  }

  return (
    <Card>
      <CardContent className="p-6">
        {/* Single step — client select only (D-04) */}
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="min-h-[280px]">
              <StepClientSelect form={form} clients={clients} />
            </div>

            <Separator className="my-6" />

            {/* Single action footer — no Back/Next (D-04: 1-step wizard) */}
            <div className="flex justify-between items-center">
              <Button
                asChild
                type="button"
                variant="ghost"
                className="min-h-[44px]"
              >
                <Link href="/dashboard">Cancel</Link>
              </Button>

              <Button
                type="button"
                className="min-h-[44px]"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue to recorder
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
