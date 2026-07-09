'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Copy, Check, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { resolveTemplate, buildItemsBreakdown } from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import { logDeliveryAction } from '@/lib/actions/estimate'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import { useTranslation } from '@/lib/i18n/use-translation'

interface PlainTextSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimate: EstimateWithSections
  clientName: string
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
}

export function PlainTextSheet({
  open,
  onOpenChange,
  estimate,
  clientName,
  companyName,
  ownerName,
  estimateTemplate,
}: PlainTextSheetProps) {
  const { t } = useTranslation()

  function generateText(): string {
    // SENDHUB-04 (Phase 163): pass resolved settings so buildItemsBreakdown
    // respects the estimate's 'sections' toggle. Cast-with-fallback mirrors
    // components/share/estimate-view.tsx:157-161 — dormant-first-safe.
    const resolvedSettings = resolvePresentationSettings(
      (estimate as { presentation_settings?: unknown }).presentation_settings
    )
    return resolveTemplate(estimateTemplate, {
      client_name: clientName,
      company_name: companyName,
      owner_name: ownerName,
      total: formatCurrency(estimate.total, estimate.currency_code),
      items_breakdown: buildItemsBreakdown(estimate, resolvedSettings),
    })
  }

  const [text, setText] = useState<string>(generateText)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(t('Copied to clipboard!'))
      setTimeout(() => setCopied(false), 2000)
      // Phase 163 (SENDHUB-03): fire-and-forget delivery log for the copy.
      // Failure here must never surface a toast -- the copy already succeeded.
      void logDeliveryAction({
        estimateId: estimate.id,
        format: 'plain_text',
        channel: 'copy',
      })
    } catch {
      toast.error(t('Failed to copy'))
    }
  }

  function handleReset() {
    setText(generateText())
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t('Plain Text Message')}</SheetTitle>
          <SheetDescription>{t('Paste into WhatsApp, SMS, or email')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 resize-none font-mono text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('Reset')}
            </Button>
            <Button variant="primary" onClick={handleCopy}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? t('Copied!') : t('Copy')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
