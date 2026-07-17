'use client'

import { Suspense, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Loader2, ArrowLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// Lazy-loaded: the CaptureRecorder bundle (~1.5k LOC + the MediaRecorder
// pipeline) is heavy and this popup is mounted on every authenticated page.
// next/dynamic with ssr:false keeps that chunk out of the initial payload —
// it only loads once the popup actually opens and renders the recorder.
const CaptureRecorder = dynamic(
  () => import('@/components/capture/capture-recorder').then((m) => m.CaptureRecorder),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
)
import { getProjectMinimalAction, renameProjectAction } from '@/lib/actions/project'
import type { ProjectDetail } from '@/lib/queries/project'
import { isPlaceholderName } from '@/lib/constants/project'
import { useTranslation } from '@/lib/i18n/use-translation'
import { T } from '@/components/i18n/t'
import { NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE } from './new-project-dialog'

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
  const { t } = useTranslation()

  const mode = searchParams.get(CAPTURE_PARAM)
  const projectId = searchParams.get(PROJECT_ID_PARAM)
  const isOpen = isCaptureMode(mode) && !!projectId
  // Narrow the URL param to CaptureMode for the recorder. `isOpen` guarantees
  // `isCaptureMode(mode) === true` at this render path, so the cast is safe.
  const captureMode = mode as CaptureMode

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)
  // Editable project name. Empty while the name is still the auto-generated
  // placeholder ("Untitled project — <date>") so the user starts from a blank
  // field instead of having to clear the placeholder + date themselves.
  const [name, setName] = useState('')

  function clearParams() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(CAPTURE_PARAM)
    params.delete(PROJECT_ID_PARAM)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  // Back arrow: return to the "New project" modality picker without leaving the
  // popup — drop the capture params and re-open the new-project dialog in place.
  function handleBack() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(CAPTURE_PARAM)
    params.delete(PROJECT_ID_PARAM)
    params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Persist the project name. Only fires when the user actually typed something
  // different from what's saved — avoids clobbering the name with the placeholder.
  async function saveName() {
    if (!projectId) return
    const trimmed = name.trim()
    if (!trimmed) return
    if (project && trimmed === project.name) return
    const result = await renameProjectAction(projectId, trimmed)
    if (!('error' in result)) {
      setProject((prev) => (prev ? { ...prev, name: trimmed } : prev))
      router.refresh()
    }
  }

  useEffect(() => {
    if (!isOpen || !projectId) {
      setProject(null)
      setName('')
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
        // Seed the input with the saved name, but leave it blank if it's still
        // the placeholder (so the date doesn't show and the user names it fresh).
        setName(isPlaceholderName(result.data.name) ? '' : result.data.name)
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
    // Navigate straight to the project page. Do NOT call clearParams() here:
    // clearParams() fires router.replace(), and a synchronous replace + push in
    // the same tick races in the App Router — the push gets dropped (broke the
    // new-project flow, which opens on /projects so replace and push target
    // different URLs). router.push to /projects/[id] yields a URL with no
    // ?capture/?projectId params, so the Dialog's isOpen flips to false and the
    // popup closes on its own — clearParams() is redundant. refresh() is still
    // needed for the same-route existing-project record case so the freshly
    // generated estimate shows.
    router.push(`/projects/${projectId}`)
    router.refresh()
  }

  function handleCancel() {
    clearParams()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) clearParams() }}>
      <DialogContent className="p-0 gap-0 sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0 text-left">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              aria-label={t('Back')}
              className="-ml-1 p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <DialogTitle className="sr-only">
              <T>Create estimate</T>
            </DialogTitle>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              placeholder={t('Name this project')}
              aria-label={t('Project name')}
              disabled={loading || !project}
              className="flex-1 min-w-0 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60 rounded px-1.5 py-0.5 -mx-0.5 focus:bg-muted/40 transition-colors"
            />
          </div>
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
            // CAPT-02/05 (audit F4): the typed-description draft (and, per the
            // new-project-wizard pattern, already-uploaded photos) now survive
            // closing this popup — previously neither was passed here at all.
            draftKey={`popup:${project.id}`}
            restorePhotos
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
