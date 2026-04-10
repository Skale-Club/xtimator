'use client'

import type { UseFormReturn } from 'react-hook-form'
import type { ProjectFormValues } from '@/lib/schemas/project'

interface StepConfirmationProps {
  form: UseFormReturn<ProjectFormValues>
}

export function StepConfirmation({ form }: StepConfirmationProps) {
  const values = form.getValues()

  const displayType =
    values.projectType === 'Custom' && values.customProjectType
      ? values.customProjectType
      : values.projectType

  const displayBudget = values.targetBudget
    ? `$${parseFloat(values.targetBudget).toLocaleString()}`
    : 'Not set'

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Confirm Project Details</h2>

      <div className="rounded-lg border p-4 space-y-4">
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Client</dt>
            <dd className="text-base font-medium">{values.clientName || '-'}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">Project Name</dt>
            <dd className="text-base font-medium">{values.name || '-'}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">Type</dt>
            <dd className="text-base font-medium">{displayType || '-'}</dd>
          </div>

          <div>
            <dt className="text-sm text-muted-foreground">Target Budget</dt>
            <dd className="text-base font-medium">{displayBudget}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
