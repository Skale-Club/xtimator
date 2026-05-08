'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Copy, Check, RotateCcw, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { resolveTemplate, buildItemsBreakdown } from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

interface PlainTextCardProps {
  estimate: EstimateWithSections
  clientName: string
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
}

export function PlainTextCard({
  estimate,
  clientName,
  companyName,
  ownerName,
  estimateTemplate,
}: PlainTextCardProps) {
  function generateText(): string {
    return resolveTemplate(estimateTemplate, {
      client_name: clientName,
      company_name: companyName,
      owner_name: ownerName,
      total: formatCurrency(estimate.total),
      items_breakdown: buildItemsBreakdown(estimate),
    })
  }

  const [text, setText] = useState<string>(generateText)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  function handleReset() {
    setText(generateText())
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Plain Text</CardTitle>
            <CardDescription>Paste into WhatsApp, SMS, or email</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleReset} aria-label="Reset to generated text">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to generated text</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button onClick={handleCopy}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          className="font-mono text-sm resize-none"
        />
      </CardContent>
    </Card>
  )
}

interface PlainTextCardEmptyProps {
  className?: string
}

export function PlainTextCardEmpty({ className }: PlainTextCardEmptyProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Generate an estimate first — then come back here to copy the plain text version.
        </p>
      </CardContent>
    </Card>
  )
}
