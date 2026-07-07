'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { FileText } from 'lucide-react'
import { EstimatePreview, LanguageFlagChip } from './estimate-preview'
import { SendForm } from './send-form'
import { SendActionsMenu } from './send-actions-menu'
import { PlainTextSheet } from './plain-text-sheet'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import { useTranslation } from '@/lib/i18n/use-translation'

interface SendTabProps {
  estimate: EstimateWithSections | null
  projectName: string
  companyName: string
  clientEmail: string | null
  clientPhone: string | null
  clientName: string
  ownerName: string
  companyWebsite?: string | null
  estimateTemplate: EstimateTemplate
  smsDeliveryEnabled: boolean
}

function StepHeading({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </span>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  )
}

export function SendTab({ estimate, projectName, companyName, clientEmail, clientPhone, clientName, ownerName, estimateTemplate, smsDeliveryEnabled }: SendTabProps) {
  const { t } = useTranslation()
  const [plainTextOpen, setPlainTextOpen] = useState(false)

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
    <div className="mx-auto w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{t('Send Estimate')}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {companyName} &mdash; {projectName}
            </span>
            <LanguageFlagChip lang={estimate.language} />
          </div>
        </div>
        <SendActionsMenu
          estimateId={estimate.id}
          projectName={projectName}
          shareToken={estimate.share_token}
          estimate={estimate}
          clientName={clientName}
          companyName={companyName}
          ownerName={ownerName}
          estimateTemplate={estimateTemplate}
          onOpenEditor={() => setPlainTextOpen(true)}
        />
      </div>

      {/* Step 1 — Review */}
      <div className="space-y-3">
        <StepHeading index={1} title={t('Review your estimate')} />
        <EstimatePreview estimate={estimate} />
      </div>

      {/* Step 2 — Send */}
      <div className="space-y-3">
        <StepHeading index={2} title={t('Choose how to send')} />
        <SendForm
          estimateId={estimate.id}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          clientName={clientName}
          companyName={companyName}
          projectName={projectName}
          shareToken={estimate.share_token}
          smsDeliveryEnabled={smsDeliveryEnabled}
        />
      </div>

      <PlainTextSheet
        key={estimate.id}
        open={plainTextOpen}
        onOpenChange={setPlainTextOpen}
        estimate={estimate}
        clientName={clientName}
        companyName={companyName}
        ownerName={ownerName}
        estimateTemplate={estimateTemplate}
      />
    </div>
  )
}
