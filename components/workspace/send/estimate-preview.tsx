'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Download, Link2, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { EstimateWithSections } from '@/lib/queries/estimate'

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
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleDownloadPdf() {
    setDownloading(true)
    try {
      const response = await fetch(`/api/estimates/${estimate.id}/pdf`)
      if (!response.ok) {
        throw new Error('Failed to generate PDF')
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
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to download PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleCopyShareLink() {
    const shareLink = `${window.location.origin}/estimate/${estimate.share_token}`
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      toast.success('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-lg">Estimate Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {companyName} &mdash; {projectName}
          </p>
          {estimate.summary && (
            <p className="mt-1 text-sm">{estimate.summary}</p>
          )}
        </div>

        <Separator />

        {/* Sections */}
        {estimate.sections.map((section) => (
          <div key={section.id} className="space-y-2">
            <h4 className="text-sm font-semibold">{section.title}</h4>
            <div className="space-y-1">
              {section.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.description || 'Untitled item'}
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
              Section: {formatCurrency(section.subtotal)}
            </div>
          </div>
        ))}

        <Separator />

        {/* Totals */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatCurrency(estimate.subtotal)}</span>
          </div>
          {estimate.discount_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Discount
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
                Tax ({(estimate.tax_rate * 100).toFixed(1)}%)
              </span>
              <span className="tabular-nums">{formatCurrency(estimate.tax_amount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
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
            disabled={downloading}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCopyShareLink}
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            {copied ? 'Copied!' : 'Copy Share Link'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
