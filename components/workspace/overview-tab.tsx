'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { ClientPicker } from '@/components/clients/client-picker'
import { EstimateTab } from './estimate/estimate-tab'
import { answerDetailsHref } from '@/lib/estimate/creation-href'
import { clearCapturePrompts, setCapturePrompts } from '@/lib/estimate/capture-prompts'
import type { ProjectDetail } from '@/lib/queries/project'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { InvoiceRow } from '@/lib/queries/invoice'
import type { PriceBookItem } from '@/lib/queries/price-book'
import type { DocumentCompany, CompanyDefaults } from './estimate/estimate-document'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'

interface OverviewTabProps {
  project: ProjectDetail
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
  priceBookItems: PriceBookItem[]
  companyName: string
  companySlug?: string | null
  ownerName: string
  estimateTemplate: EstimateTemplate
  /** Phase 185 (PGMODE-02) — forwarded to EstimateTab -> EstimateEditor. */
  estimateTemplateId: EstimateTemplateId
  /** Phase 185 (PGMODE-03) — forwarded to EstimateTab -> EstimateEditor. */
  preparedBy: string | null
  smsDeliveryEnabled?: boolean
  /** Phase 163 (SENDHUB) — server-resolved WhatsApp availability, forwarded to
   * the Send hub via EstimateTab. */
  whatsappEnabled?: boolean
  /** Server-resolved platform-admin flag, forwarded to the editor (estimate debug tool). */
  isPlatformAdmin?: boolean
  /** Opens the Photos dialog (floating-bar affordance). */
  onOpenPhotos?: () => void
}

/**
 * R3 — the project-detail screen's primary content is now the live, editable
 * Estimate preview (rendered via the shared EstimateTab surface). Project
 * metadata sits in a chrome strip above the document; activity timeline drops
 * below it. The Project Summary card from the previous overview is gone.
 *
 * R6 — Record + conditional Link Client are wired into the floating action
 * bar via slot props. The full ClientPicker card variant remains for the
 * no-estimate state where the wider explanatory surface is appropriate.
 * Phase 162-02 (DOCUX-03) — consolidated onto <ClientPicker variant="button">.
 */
export function OverviewTab({
  project,
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
  priceBookItems,
  companyName,
  companySlug,
  ownerName,
  estimateTemplate,
  estimateTemplateId,
  preparedBy,
  smsDeliveryEnabled,
  whatsappEnabled,
  isPlatformAdmin = false,
  onOpenPhotos,
}: OverviewTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Notices review stage 1, part 2: a project waiting for details is no longer
  // a banner above the estimate. EstimateTab shows a blank estimate as the
  // "Almost there" empty state, and adds the questions to "Edit with AI" on
  // one that has content.
  const waiting = project.status === 'awaiting_details'
  const needsReason = project.needs_details?.reason
  const needsQuestions = project.needs_details?.questions
  const needsDetails = useMemo(
    () => (waiting ? { reason: needsReason, questions: needsQuestions } : null),
    [waiting, needsReason, needsQuestions]
  )
  useEffect(() => {
    if (!waiting) clearCapturePrompts(project.id)
  }, [waiting, project.id])
  function answerDetails() {
    setCapturePrompts(project.id, needsQuestions ?? [])
    router.push(answerDetailsHref(searchParams.toString(), project.id), { scroll: false })
  }

  // Rendered inside the estimate's gear panel (popover on desktop, bottom sheet
  // on mobile) — not the floating action pill any more. Hence `modal` (so a
  // click inside the picker doesn't dismiss the panel behind it) and the
  // downward/start anchoring, since the panel row it hangs off is at the top of
  // the panel rather than at the bottom edge of the screen.
  const linkClientSlot =
    !project.client && currentEstimate ? (
      <ClientPicker
        projectId={project.id}
        currentClientId={null}
        variant="button"
        side="bottom"
        align="start"
        modal
      />
    ) : null

  return (
    <div className="space-y-6">
      <EstimateTab
        projectId={project.id}
        companyId={companyId}
        companyBrandColor={companyBrandColor}
        company={company}
        companyDefaults={companyDefaults}
        currentEstimate={currentEstimate}
        allVersions={allVersions}
        issuedInvoices={issuedInvoices}
        paymentsEnabled={paymentsEnabled}
        recordings={recordings}
        photos={photos}
        projectName={project.name}
        projectType={project.project_type ?? null}
        client={project.client ? {
          id: project.client.id,
          name: project.client.name,
          email: project.client.email ?? null,
          phone: project.client.phone ?? null,
          address: null,
          city: null,
          state: null,
          zip: null,
        } : null}
        linkClientSlot={linkClientSlot}
        onOpenPhotos={onOpenPhotos}
        priceBookItems={priceBookItems}
        companyName={companyName}
        companySlug={companySlug}
        ownerName={ownerName}
        estimateTemplate={estimateTemplate}
        estimateTemplateId={estimateTemplateId}
        preparedBy={preparedBy}
        smsDeliveryEnabled={smsDeliveryEnabled}
        whatsappEnabled={whatsappEnabled}
        isPlatformAdmin={isPlatformAdmin}
        needsDetails={needsDetails}
        onAnswerDetails={answerDetails}
      />

    </div>
  )
}
