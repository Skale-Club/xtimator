'use client'

import { Card, CardContent } from '@/components/ui/card'
import { FileText } from 'lucide-react'
import { EstimatePreview } from './estimate-preview'
import { SendForm } from './send-form'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import { PlainTextCard } from './plain-text-card'
import { useTranslation } from '@/lib/i18n/use-translation'

interface SendTabProps {
  estimate: EstimateWithSections | null
  projectName: string
  companyName: string
  clientEmail: string | null
  clientName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
}

export function SendTab({ estimate, projectName, companyName, clientEmail, clientName, ownerName, estimateTemplate }: SendTabProps) {
  const { t } = useTranslation()
  if (!estimate) {
    return (
      <Card variant="glass">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('No estimate available')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Generate an estimate first from the AI Estimate tab, then come back here to preview and send it.')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <EstimatePreview
          estimate={estimate}
          projectName={projectName}
          companyName={companyName}
        />
        <SendForm
          estimateId={estimate.id}
          clientEmail={clientEmail}
          companyName={companyName}
          projectName={projectName}
          shareToken={estimate.share_token}
        />
      </div>
      <PlainTextCard
        key={estimate.id}
        estimate={estimate}
        clientName={clientName}
        companyName={companyName}
        ownerName={ownerName}
        estimateTemplate={estimateTemplate}
      />
    </div>
  )
}
