'use client'
import { CaptureRecorder } from '@/components/capture/capture-recorder'
import type { ProjectDetail } from '@/lib/queries/project'

interface CaptureClientProps {
  project: ProjectDetail
  companyId: string
}

export function CaptureClient({ project, companyId }: CaptureClientProps) {
  return (
    <CaptureRecorder
      project={project}
      companyId={companyId}
      projectId={project.id}
      // CAPT-02/05 (audit F4): the legacy fullscreen route previously passed
      // neither draftKey nor restorePhotos — the typed draft was lost on any
      // navigation away and back.
      draftKey={`capture:${project.id}`}
      restorePhotos
    />
  )
}
