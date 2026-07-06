'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { SendForm } from './send-form'
import { SendActionsMenu } from './send-actions-menu'
import { PlainTextSheet } from './plain-text-sheet'
import { LanguageFlagChip } from './estimate-preview'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

interface SendDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
  whatsappSendEnabled?: boolean
}

export function SendDialog({
  open,
  onOpenChange,
  estimate,
  projectName,
  companyName,
  clientEmail,
  clientPhone,
  clientName,
  ownerName,
  companyWebsite,
  estimateTemplate,
  smsDeliveryEnabled,
  whatsappSendEnabled = false,
}: SendDialogProps) {
  const [plainTextOpen, setPlainTextOpen] = useState(false)

  if (!estimate) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <DialogTitle>Send Estimate</DialogTitle>
                <LanguageFlagChip lang={estimate.language} />
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
            <DialogDescription className="sr-only">
              Choose how to send the estimate to your client.
            </DialogDescription>
          </DialogHeader>
          <SendForm
            estimateId={estimate.id}
            clientEmail={clientEmail}
            clientPhone={clientPhone}
            clientName={clientName}
            companyName={companyName}
            projectName={projectName}
            shareToken={estimate.share_token}
            smsDeliveryEnabled={smsDeliveryEnabled}
            whatsappSendEnabled={whatsappSendEnabled}
            estimate={estimate}
            ownerName={ownerName}
            companyWebsite={companyWebsite}
          />
        </DialogContent>
      </Dialog>
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
    </>
  )
}
