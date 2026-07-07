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
  estimateTemplate: EstimateTemplate
  smsDeliveryEnabled: boolean
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
  estimateTemplate,
  smsDeliveryEnabled,
}: SendDialogProps) {
  const [plainTextOpen, setPlainTextOpen] = useState(false)

  if (!estimate) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* max-h in dvh + overflow-x-hidden: on phones the dialog fills most of
            the visual viewport; nothing inside may create sideways scroll. */}
        <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            {/* pr-8 clears the dialog's absolute close (X) button; the row wraps
                on narrow screens instead of forcing horizontal overflow. */}
            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <div className="flex min-w-0 items-center gap-2">
                <DialogTitle className="truncate">Send Estimate</DialogTitle>
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
