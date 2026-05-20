'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Download, Link2, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { ComponentType } from 'react'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { useTranslation } from '@/lib/i18n/use-translation'
import { FlagUS, FlagBR, FlagES } from '@/components/app-shell/flags'
import { LANGUAGE_LABELS, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

const FLAG_MAP_LANG: Record<string, ComponentType<{ className?: string }>> = {
  en: FlagUS,
  pt: FlagBR,
  es: FlagES,
}

function LanguageFlagChip({ lang }: { lang: string | null | undefined }) {
  if (!lang) return null
  const F = FLAG_MAP_LANG[lang] ?? FlagUS
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-foreground/80">
      <F className="h-3.5 w-3.5 rounded-[2px]" />
      {LANGUAGE_LABELS[lang as EstimateLanguage] ?? lang.toUpperCase()}
    </span>
  )
}

interface EstimatePreviewProps {
  estimate: EstimateWithSections
  projectName: string
  companyName: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function EstimatePreview({ estimate, projectName, companyName }: EstimatePreviewProps) {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const response = await fetch(`/api/estimates/${estimate.id}/pdf`)
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
    const shareLink = `${window.location.origin}/estimate/${estimate.share_token}`
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      toast.success(t('Link copied!'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('Failed to copy link'))
    }
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-lg">{t('Estimate Preview')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {companyName} &mdash; {projectName}
            </p>
            <LanguageFlagChip lang={estimate.language} />
          </div>
          {estimate.summary && (
            <p className="mt-1 text-sm">{estimate.summary}</p>
          )}
        </div>

        <Separator />

        {/* Sections */}
        {estimate.sections.map((section) => (
          <div key={section.id} className="space-y-2">
            <h4 className="text-sm font-semibold">{t(section.title)}</h4>
            <div className="space-y-1">
              {section.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.description || t('Untitled item')}
                    {item.quantity > 1 && (
                      <span className="ml-1">
                        ({item.quantity} {item.unit ?? 'x'})
                      </span>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(item.total)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end text-sm font-medium">
              {t('Section:')} {formatCurrency(section.subtotal)}
            </div>
          </div>
        ))}

        <Separator />

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Subtotal')}</span>
            <span className="tabular-nums">{formatCurrency(estimate.subtotal)}</span>
          </div>
          {estimate.discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('Discount')}
                {estimate.discount_type === 'percentage'
                  ? ` (${estimate.discount_value}%)`
                  : ''}
              </span>
              <span className="tabular-nums text-red-600">
                -{formatCurrency(estimate.discount_amount)}
              </span>
            </div>
          )}
          {estimate.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('Tax')} ({(estimate.tax_rate * 100).toFixed(1)}%)
              </span>
              <span className="tabular-nums">{formatCurrency(estimate.tax_amount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>{t('Total')}</span>
            <span className="tabular-nums">{formatCurrency(estimate.total)}</span>
          </div>
        </div>

        <Separator />

        {/* Action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDownloadPdf}
            disabled={downloading || estimate.workflow_status !== 'consolidated'}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? t('Generating...') : t('Download PDF')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCopyShareLink}
            disabled={estimate.workflow_status !== 'consolidated'}
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            {copied ? t('Copied!') : t('Copy Share Link')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
