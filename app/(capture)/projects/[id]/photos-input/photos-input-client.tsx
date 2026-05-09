'use client'
import { PhotosInput } from '@/components/projects/photos-input'
import type { ProjectDetail } from '@/lib/queries/project'

interface PhotosInputClientProps {
  project: ProjectDetail
  companyId: string
}

export function PhotosInputClient({ project, companyId }: PhotosInputClientProps) {
  return <PhotosInput project={project} companyId={companyId} projectId={project.id} />
}