'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CaptureRecorder } from '@/components/capture/capture-recorder'
import { getProjectMinimalAction } from '@/lib/actions/project'
import type { ProjectDetail } from '@/lib/queries/project'
import { T } from '@/components/i18n/t'

export const CAPTURE_PARAM = 'capture'
export const PROJECT_ID_PARAM = 'projectId'

export type CaptureMode = 'audio' | 'text' | 'photos'

function isCaptureMode(value: string | null): value is CaptureMode {
  return value === 'audio' || value === 'text' || value === 'photos'
}

/**
 * Build the href that opens the estimate creation popup from any page.
 * Preserves existing search params on the target pathname.
 */
export function captureHref({
  pathname,
  search,
  mode,
  projectId,
}: {
  pathname: string
  search?: string
  mode: CaptureMode
  projectId: string
}): string {
  const params = new URLSearchParams(search ?? '')
  params.set(CAPTURE_PARAM, mode)
  params.set(PROJECT_ID_PARAM, projectId)
  // Drop the modal param if NewProjectDialog handed us off mid-flow.
  params.delete('modal')
  return `${pathname}?${params.toString()}`
}

function EstimateCreationPopupInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const mode = searchParams.get(CAPTURE_PARAM)
  const projectId = searchParams.get(PROJECT_ID_PARAM)
  const isOpen = isCaptureMode(mode) && !!projectId
  // Narrow the URL param to CaptureMode for the recorder. `isOpen` guarantees
  // `isCaptureMode(mode) === true` at this render path, so the cast is safe.
  const captureMode = mode as CaptureMode

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)

  function clearParams() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(CAPTURE_PARAM)
    params.delete(PROJECT_ID_PARAM)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  useEffect(() => {
    if (!isOpen || !projectId) {
      setProject(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void getProjectMinimalAction(projectId).then((result) => {
      if (cancelled) return
      if ('error' in result) {
        // Bad projectId — drop the params so the popup closes.
        clearParams()
      } else {
        setProject(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId])

  function handleComplete() {
    if (!projectId) return
    clearParams()
    // Overview is now the live estimate (project A R3). Navigate there and
    // refresh so the freshly-generated estimate is visible immediately.
    router.push(`/projects/${projectId}`)
    router.refresh()
  }

  function handleCancel() {
    clearParams()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) clearParams() }}>
      <DialogContent className="p-0 gap-0 sm:max-w-lg max-h-[92vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0 text-left">
          <DialogTitle className="text-base font-semibold truncate">
            {project?.name ?? <T>Create estimate</T>}
          </DialogTitle>
          <DialogDescription className="sr-only">
            <T>Record audio, type, or upload photos to generate an estimate. The popup stays open until the estimate is ready.</T>
          </DialogDescription>
        </DialogHeader>
        {loading || !project ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CaptureRecorder
            project={project}
            companyId={project.company_id}
            projectId={project.id}
            variant="popup"
            mode={captureMode}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Mount in the app-shell layout — renders the estimate creation popup when
 * `?capture=audio|text|photos` + `?projectId=<id>` are present on the URL.
 * Any surface (NewProjectWizard hand-off, OverviewTab Record button, etc.)
 * can open it by setting those params without navigating away from the
 * current page.
 */
export function EstimateCreationPopup() {
  return (
    <Suspense>
      <EstimateCreationPopupInner />
    </Suspense>
  )
}
