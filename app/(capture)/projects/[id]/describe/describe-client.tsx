'use client'
import { TextDescribe } from '@/components/projects/text-describe'
import type { ProjectDetail } from '@/lib/queries/project'

interface DescribeClientProps {
  project: ProjectDetail
  companyId: string
}

export function DescribeClient({ project, companyId }: DescribeClientProps) {
  return <TextDescribe project={project} companyId={companyId} projectId={project.id} />
}
