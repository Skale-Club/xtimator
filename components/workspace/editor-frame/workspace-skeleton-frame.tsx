'use client'

import type { ReactNode } from 'react'
import { ProjectHeader } from '@/components/workspace/project-header'
import { EditorTopBar } from '@/components/workspace/editor-frame/editor-top-bar'
import { useEditorFrame } from '@/components/workspace/editor-frame/frame'
import type { ProjectDetail } from '@/lib/queries/project'

/**
 * Client wrapper for the streaming skeleton in projects/[id]/page.tsx (a server
 * component): it picks the same frame the real workspace will draw, so the
 * header does not jump when the workspace streams in.
 */
export function WorkspaceSkeletonFrame({
  project,
  children,
}: {
  project: ProjectDetail
  children: ReactNode
}) {
  const frame = useEditorFrame()

  if (frame === 'v2') {
    return (
      <div data-editor-frame="v2" className="flex min-h-full flex-col">
        <EditorTopBar project={project} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-full flex-row gap-0 items-start">
      <div className="min-w-0 flex-1">
        <ProjectHeader project={project} />
        {children}
      </div>
    </div>
  )
}

/** Renders children only in the v1 frame (e.g. the floating pill skeleton). */
export function LegacyFrameOnly({ children }: { children: ReactNode }) {
  const frame = useEditorFrame()
  return frame === 'v1' ? <>{children}</> : null
}
