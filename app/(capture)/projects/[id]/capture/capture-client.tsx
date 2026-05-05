'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { ProjectDetail } from '@/lib/queries/project'

interface CaptureClientProps {
  project: ProjectDetail
  companyId: string
}

export function CaptureClient({ project, companyId }: CaptureClientProps) {
  return (
    <div className="flex flex-1 flex-col" data-testid="capture-screen">
      {/* Top bar — minimal, NOT the app shell topbar */}
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm text-muted-foreground">{project.name}</span>
        <Button asChild variant="ghost" size="sm" data-testid="skip-recording">
          <Link href={`/projects/${project.id}`}>
            Skip recording
            <X className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </header>

      {/* Body placeholder — full implementation lands in plan 18-02 */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <p data-testid="recorder-placeholder">Recorder will appear here (plan 18-02)</p>
          <p className="text-xs mt-2">Project ID: {project.id}</p>
          <p className="text-xs">Company ID: {companyId}</p>
        </div>
      </main>
    </div>
  )
}
