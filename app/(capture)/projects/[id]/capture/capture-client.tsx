'use client'
import { CaptureRecorder } from '@/components/capture/capture-recorder'
import type { ProjectDetail } from '@/lib/queries/project'

interface CaptureClientProps {
  project: ProjectDetail
  companyId: string
}

export function CaptureClient({ project, companyId }: CaptureClientProps) {
  return <CaptureRecorder project={project} companyId={companyId} projectId={project.id} />
}
