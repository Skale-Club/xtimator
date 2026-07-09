'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { createBlankEstimate } from '@/lib/actions/estimate'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import { Skeleton } from '@/components/ui/skeleton'
import { EstimateEditor } from './estimate-editor'
// Phase 163-04 (SENDHUB-01/-06): the format-first hub replaces the retired
// channel-first dialog. Same dialog-open state slot, same prop shape + 2
// new optional props (companySlug, whatsappEnabled) threaded below.
import { SendHubDialog } from '@/components/workspace/send/send-hub-dialog'
import {
  popStoredClientSuggestion,
  showClientSuggestionToast,
} from './client-suggestion-toast'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { DocumentClient, DocumentCompany, CompanyDefaults } from './estimate-document'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

interface EstimateTabProps {
  projectId: string
  companyId: string
  companyBrandColor: string | null
  company: DocumentCompany
  companyDefaults: CompanyDefaults
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  issuedInvoices: InvoiceRow[]
  /** PAYGATE-01/02 — forward-looking payment gate (Connect active), forwarded to the editor. */
  paymentsEnabled: boolean
  recordings: Recording[]
  photos: Photo[]
  projectName: string
  projectType: string | null
  client: DocumentClient | null
  linkClientSlot?: React.ReactNode
  onOpenPhotos?: () => void
  priceBookItems: PriceBookItem[]
  companyName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  smsDeliveryEnabled?: boolean
  /**
   * Phase 163-04 (SENDHUB-01): company slug for buildEstimatePublicPath in the
   * hub's Online Estimate card. Optional here -- when the parent chain
   * (OverviewTab -> ProjectWorkspace -> page.tsx) hasn't threaded it yet,
   * buildEstimatePublicPath falls back to the legacy /estimate/{share_token}
   * path. Wired end-to-end in 163-05 once the delivery-action buttons need
   * real URLs.
   */
  companySlug?: string | null
  /**
   * Phase 163-04 (SENDHUB-01): whether WhatsApp delivery is configured for
   * this account. Optional; defaults to true inside the hub so the WhatsApp
   * placeholder buttons show unless the parent explicitly disables them.
   * 163-05 wires real gating from getWhatsAppAccountStatus().
   */
  whatsappEnabled?: boolean
}

export function EstimateTab({
  projectId,
  companyId,
  companyBrandColor,
  company,
  companyDefaults,
  currentEstimate,
  allVersions,
  issuedInvoices,
  paymentsEnabled,
  recordings,
  photos,
  projectName,
  projectType,
  client,
  linkClientSlot,
  onOpenPhotos,
  priceBookItems,
  companyName,
  ownerName,
  estimateTemplate,
  smsDeliveryEnabled,
  companySlug,
  whatsappEnabled,
}: EstimateTabProps) {
  const [sendOpen, setSendOpen] = useState(false)
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const blankFiredRef = useRef(false)

  // True when the user navigated here right after stopping a recording —
  // the pipeline is running server-side (Inngest) and we poll until the
  // estimate appears, then clear the param.
  const isAutoGenerating = searchParams.get('autoGenerating') === 'true'

  useEffect(() => {
    if (!isAutoGenerating || currentEstimate) return
    const id = setInterval(() => router.refresh(), 2000)
    return () => clearInterval(id)
  }, [isAutoGenerating, currentEstimate, router])

  useEffect(() => {
    if (!isAutoGenerating || !currentEstimate) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('autoGenerating')
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [isAutoGenerating, currentEstimate, searchParams, pathname, router])

  // Lazy materialization — a project with no estimate and no in-flight AI
  // generation should simply BE a blank, editable estimate (not an empty-state
  // chooser). Create the blank once, then refresh so the editor renders. Gated
  // on !isAutoGenerating so this never races the AI-generation path (which
  // creates the estimate itself). createBlankEstimate is idempotent as a
  // backstop against a double-fire.
  useEffect(() => {
    if (currentEstimate || isAutoGenerating || blankFiredRef.current) return
    blankFiredRef.current = true
    createBlankEstimate(projectId).then((result) => {
      if (result.error) {
        toast.error(result.error)
        blankFiredRef.current = false // allow a retry on the next render
        return
      }
      router.refresh()
    })
  }, [currentEstimate, isAutoGenerating, projectId, router])

  useEffect(() => {
    const suggestion = popStoredClientSuggestion(projectId)
    if (suggestion) {
      queueMicrotask(() => {
        showClientSuggestionToast({ projectId, router, suggestion })
      })
    }
  }, [projectId, router])

  if (isAutoGenerating && !currentEstimate) {
    const hasTranscript = recordings.some(r => r.transcript && r.transcript.trim().length > 0)
    const statusLabel = hasTranscript ? t('Generating estimate...') : t('Transcribing audio...')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '-0.3s' }} />
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '-0.15s' }} />
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0s' }} />
        </div>
        <p className="text-sm text-muted-foreground">{statusLabel}</p>
      </div>
    )
  }

  if (currentEstimate) {
    return (
      <>
        <EstimateEditor
          estimate={currentEstimate}
          versions={allVersions}
          issuedInvoices={issuedInvoices}
          paymentsEnabled={paymentsEnabled}
          projectId={projectId}
          companyId={companyId}
          companyBrandColor={companyBrandColor}
          company={company}
          companyDefaults={companyDefaults}
          recordings={recordings}
          photos={photos}
          projectName={projectName}
          projectType={projectType}
          client={client}
          linkClientSlot={linkClientSlot}
          onOpenPhotos={onOpenPhotos}
          priceBookItems={priceBookItems}
          onSend={() => setSendOpen(true)}
        />
        <SendHubDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          estimate={currentEstimate}
          projectName={projectName}
          companyName={companyName}
          companySlug={companySlug ?? null}
          clientEmail={client?.email ?? null}
          clientPhone={client?.phone ?? null}
          clientName={client?.name ?? ''}
          ownerName={ownerName}
          estimateTemplate={estimateTemplate}
          smsDeliveryEnabled={smsDeliveryEnabled ?? false}
          whatsappEnabled={whatsappEnabled}
        />
      </>
    )
  }

  // No estimate yet — the lazy effect above is creating a blank one. Show a brief
  // skeleton mirroring the estimate document until the refresh swaps in the editor.
  return (
    <div className="space-y-4" aria-busy>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-12 w-12 rounded-md" />
        </div>
        <Skeleton className="h-10 w-full rounded-none" />
        <div className="p-5 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="border-t border-border px-5 py-4 space-y-3">
          <Skeleton className="h-4 w-44" />
          {Array.from({ length: 2 }).map((_, r) => (
            <div key={r} className="flex items-center gap-3">
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
