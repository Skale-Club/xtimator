'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { LinkClientButton } from './link-client-button'
import { EstimateTab } from './estimate/estimate-tab'
import { captureHref, type CaptureMode } from '@/components/projects/estimate-creation-popup'
import { CaptureModePicker } from '@/components/workspace/capture-mode-picker'
import type { ProjectDetail } from '@/lib/queries/project'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface OverviewTabProps {
  project: ProjectDetail
  companyId: string
  companyBrandColor: string | null
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  recordings: Recording[]
  photos: Photo[]
  priceBookItems: PriceBookItem[]
}

/**
 * R3 — the project-detail screen's primary content is now the live, editable
 * Estimate preview (rendered via the shared EstimateTab surface). Project
 * metadata sits in a chrome strip above the document; activity timeline drops
 * below it. The Project Summary card from the previous overview is gone.
 *
 * R6 — Record + conditional Link Client are wired into the floating action
 * bar via slot props. The full LinkClientCard remains for the no-estimate
 * state where the wider explanatory surface is appropriate.
 */
export function OverviewTab({
  project,
  companyId,
  companyBrandColor,
  currentEstimate,
  allVersions,
  recordings,
  photos,
  priceBookItems,
}: OverviewTabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [modePickerOpen, setModePickerOpen] = useState(false)

  const linkClientSlot =
    !project.client && currentEstimate ? (
      <LinkClientButton projectId={project.id} />
    ) : null

  function handleRecord() {
    setModePickerOpen(true)
  }

  function handleModeSelect(mode: CaptureMode) {
    router.push(
      captureHref({
        pathname,
        search: searchParams.toString(),
        mode,
        projectId: project.id,
      })
    )
  }

  return (
    <div className="space-y-6">
      <CaptureModePicker
        open={modePickerOpen}
        onOpenChange={setModePickerOpen}
        onSelect={handleModeSelect}
      />

      <EstimateTab
        projectId={project.id}
        companyId={companyId}
        companyBrandColor={companyBrandColor}
        currentEstimate={currentEstimate}
        allVersions={allVersions}
        recordings={recordings}
        photos={photos}
        projectName={project.name}
        projectType={project.project_type ?? null}
        client={project.client ? {
          name: project.client.name,
          email: project.client.email ?? null,
          phone: project.client.phone ?? null,
          address: null,
          city: null,
          state: null,
          zip: null,
        } : null}
        onRecord={handleRecord}
        linkClientSlot={linkClientSlot}
        priceBookItems={priceBookItems}
      />

    </div>
  )
}
