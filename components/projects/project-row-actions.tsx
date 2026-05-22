'use client'

import type { ProjectListStatus } from '@/lib/queries/project'

/**
 * Quick task 260522-lhp — Per-row action menu placeholder.
 *
 * NOTE: This is a stub created in task 4 so the projects page shell compiles.
 * Task 5 replaces this with the full DropdownMenu + AlertDialog implementation.
 */
interface Props {
  projectId: string
  projectName: string
  status: ProjectListStatus
}

// Reference args once so TypeScript doesn't flag them as unused before task 5.
export function ProjectRowActions(_props: Props) {
  void _props
  return null
}
