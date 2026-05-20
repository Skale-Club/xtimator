'use client'

import { useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { CompanySettings } from '@/lib/queries/company'
import { updateEstimateTerms } from '@/lib/actions/settings'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface EstimateTermsFormProps {
  company: CompanySettings
}

interface FormValues {
  estimateTermsEnabled: boolean
  estimateTermsText: string
}

export function EstimateTermsForm({ company }: EstimateTermsFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    defaultValues: {
      estimateTermsEnabled: company.estimate_terms_enabled,
      estimateTermsText: company.estimate_terms_text ?? '',
    },
  })

  const enabled = useWatch({ control: form.control, name: 'estimateTermsEnabled' })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updateEstimateTerms(values)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Estimate terms saved.')
      }
    })
  }

  return (
    <Card className="w-full rounded-[var(--radius-md)]">
      <CardHeader className="border-b border-border">
        <CardTitle>Estimate Terms</CardTitle>
        <CardDescription>
          Optional terms text shown at the bottom of every shared estimate and included in the PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="py-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-background p-4">
            <Label htmlFor="terms-enabled" className="grid flex-1 gap-1">
              <span>Enable estimate terms</span>
              <span className="text-sm font-normal text-muted-foreground">
                When on, your terms text appears on all shared estimates and PDFs.
              </span>
            </Label>
            <Switch
              id="terms-enabled"
              checked={enabled}
              onCheckedChange={(checked) => form.setValue('estimateTermsEnabled', checked)}
            />
          </div>

          {enabled && (
            <div className="space-y-2">
              <Label htmlFor="terms-text">Terms text</Label>
              <Textarea
                id="terms-text"
                rows={6}
                placeholder="e.g. All work is performed in accordance with local building codes. A 50% deposit is required before work begins…"
                {...form.register('estimateTermsText')}
              />
            </div>
          )}

          <Button type="submit" disabled={isPending} className="min-w-40">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Terms
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
