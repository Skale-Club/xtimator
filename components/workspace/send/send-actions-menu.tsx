'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Download, Link2, Copy, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { buildShareLink } from '@/lib/utils/share-link'
import { resolveTemplate, buildItemsBreakdown } from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'

interface SendActionsMenuProps {
  estimateId: string
  projectName: string
  shareToken: string
  estimate: EstimateWithSections
  clientName: string
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  disabled?: boolean
  onOpenEditor: () => void
}

export function SendActionsMenu({
  estimateId,
  projectName,
  shareToken,
  estimate,
  clientName,
  companyName,
  ownerName,
  estimateTemplate,
  disabled,
  onOpenEditor,
}: SendActionsMenuProps) {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const response = await fetch(`/api/estimates/${estimateId}/pdf`)
      if (!response.ok) {
        throw new Error(t('Failed to generate PDF'))
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Estimate-${projectName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(t('PDF downloaded'))
    } catch {
      toast.error(t('Failed to download PDF. Please try again.'))
    } finally {
      setDownloading(false)
    }
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(buildShareLink(shareToken))
      toast.success(t('Link copied!'))
    } catch {
      toast.error(t('Failed to copy link'))
    }
  }

  async function handleCopyPlainText() {
    try {
      // SENDHUB-04 (Phase 163): pass resolved settings so buildItemsBreakdown
      // respects the estimate's 'sections' toggle. Cast-with-fallback mirrors
      // components/share/estimate-view.tsx:157-161 — dormant-first-safe.
      const resolvedSettings = resolvePresentationSettings(
        (estimate as { presentation_settings?: unknown }).presentation_settings
      )
      const text = resolveTemplate(estimateTemplate, {
        client_name: clientName,
        company_name: companyName,
        owner_name: ownerName,
        total: formatCurrency(estimate.total, estimate.currency_code),
        items_breakdown: buildItemsBreakdown(estimate, resolvedSettings),
      })
      await navigator.clipboard.writeText(text)
      toast.success(t('Copied to clipboard!'))
    } catch {
      toast.error(t('Failed to copy'))
    }
  }

  return (
    <DropdownMenu>
      <ContextualTooltip
        tooltipKey={TOOLTIP_KEYS.whatsapp}
        text="Clients receive a professional message with the estimate link"
        side="bottom"
      >
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t('Share & Export')}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </ContextualTooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('Share & Export')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCopyShareLink} disabled={disabled}>
          <Link2 className="h-4 w-4" />
          {t('Copy Share Link')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            handleDownloadPdf()
          }}
          disabled={disabled || downloading}
        >
          <Download className="h-4 w-4" />
          {downloading ? t('Generating...') : t('Download PDF')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCopyPlainText} disabled={disabled}>
          <Copy className="h-4 w-4" />
          {t('Copy Plain Text')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenEditor} disabled={disabled}>
          <FileText className="h-4 w-4" />
          {t('Edit message…')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
