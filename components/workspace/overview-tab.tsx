'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ActivityTimeline } from './activity-timeline'
import { LinkClientCard } from './link-client-card'
import { LinkClientButton } from './link-client-button'
import { ProjectMetadataStrip } from './project-metadata-strip'
import { EstimateTab } from './estimate/estimate-tab'
import { captureHref } from '@/components/projects/estimate-creation-popup'
import type { ProjectDetail, ActivityEvent } from '@/lib/queries/project'
import type { Recording } from '@/lib/queries/recording'
import type { Photo } from '@/lib/queries/photo'
import type { EstimateWithSections, Estimate } from '@/lib/queries/estimate'

interface OverviewTabProps {
  project: ProjectDetail
  activity: ActivityEvent[]
  companyId: string
  currentEstimate: EstimateWithSections | null
  allVersions: Estimate[]
  recordings: Recording[]
  photos: Photo[]
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
  activity,
  companyId,
  currentEstimate,
  allVersions,
  recordings,
  photos,
}: OverviewTabProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const linkClientSlot =
    !project.client && currentEstimate ? (
      <LinkClientButton projectId={project.id} />
    ) : null

  // B-R4: Record opens the unified EstimateCreationPopup instead of hard-
  // navigating to the legacy /capture full-screen route. Single surface.
  function handleRecord() {
    router.push(
      captureHref({
        pathname,
        search: searchParams.toString(),
        mode: 'audio',
        projectId: project.id,
      })
    )
  }

  return (
    <div className="space-y-6">
      <ProjectMetadataStrip project={project} />

      {!project.client && !currentEstimate && (
        <LinkClientCard projectId={project.id} />
      )}

      <EstimateTab
        projectId={project.id}
        companyId={companyId}
        currentEstimate={currentEstimate}
        allVersions={allVersions}
        recordings={recordings}
        photos={photos}
        onRecord={handleRecord}
        linkClientSlot={linkClientSlot}
      />

      <ActivityTimeline events={activity} />
    </div>
  )
}
