'use client'

// NOTE: This component is no longer used in the new 1-step wizard (Phase 18).
// The confirmation step was removed as part of wizard reduction to 1 step (D-04).
// Retained for reference; not imported by new-project-wizard.tsx.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = any

interface StepConfirmationProps {
  form: AnyForm
}

export function StepConfirmation({ form }: StepConfirmationProps) {
  const values = form.getValues()

  const displayType =
    values.projectType === 'Custom' && values.customProjectType
      ? values.customProjectType
      : (values.projectType ?? '')

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
