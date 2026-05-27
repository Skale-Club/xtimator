'use client'

import { Card, CardContent } from '@/components/ui/card'
import { FileText, Lock } from 'lucide-react'
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
  clientPhone: string | null
  clientName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  smsDeliveryEnabled: boolean
  whatsappSendEnabled?: boolean
}

export function SendTab({ estimate, projectName, companyName, clientEmail, clientPhone, clientName, ownerName, estimateTemplate, smsDeliveryEnabled, whatsappSendEnabled = false }: SendTabProps) {
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

  const isDraft = estimate.workflow_status !== 'consolidated'

  return (
    <div className="space-y-6">
      {isDraft && (
        <Card variant="glass">
          <CardContent className="flex items-center gap-3 py-4">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('This estimate is still a draft. Consolidate it from the Estimate tab to send, download, or share.')}
            </p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <EstimatePreview
          estimate={estimate}
          projectName={projectName}
          companyName={companyName}
        />
        <SendForm
          estimateId={estimate.id}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          companyName={companyName}
          projectName={projectName}
          shareToken={estimate.share_token}
          smsDeliveryEnabled={smsDeliveryEnabled}
          whatsappSendEnabled={whatsappSendEnabled}
          disabled={isDraft}
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
