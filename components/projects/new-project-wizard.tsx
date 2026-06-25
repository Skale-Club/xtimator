'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

import { resumeOrCreateDraftProjectAction, getProjectMinimalAction } from '@/lib/actions/project'
import { LoadingDots } from '@/components/ui/loading-dots'
import { CaptureRecorder } from '@/components/capture/capture-recorder'
import type { ProjectDetail } from '@/lib/queries/project'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

// Persisted id of the in-progress draft project for the New Xtimate popup.
// Reusing it across opens is what lets the typed text + uploaded photos survive
// closing the popup. Cleared once an estimate is generated from it.
const DRAFT_PROJECT_KEY = 'xtimator:draft-project-id'

function readDraftProjectId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(DRAFT_PROJECT_KEY)
  } catch {
    return null
  }
}

function writeDraftProjectId(id: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DRAFT_PROJECT_KEY, id)
  } catch {
    /* storage unavailable — draft just isn't resumable */
  }
}

function clearDraftProjectId(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(DRAFT_PROJECT_KEY)
  } catch {
    /* best-effort */
  }
}

interface NewProjectWizardProps {
  /** Called after navigating to the project page so the dialog can close/reset. */
  onComplete?: () => void
  /** Edit mode: when set, the popup edits THIS existing project's estimate
   * instead of creating a new project. Same popup, shared between new + edit. */
  editProjectId?: string
  /** Lifted estimate-language state so the Dialog header can own the selector. */
  estimateLanguage?: EstimateLanguage
  setEstimateLanguage?: (lang: EstimateLanguage) => void
}

export function NewProjectWizard({
  onComplete,
  editProjectId,
  estimateLanguage,
  setEstimateLanguage,
}: NewProjectWizardProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const createdRef = useRef(false)

  useEffect(() => {
    if (createdRef.current) return
    createdRef.current = true
    setIsCreating(true)

    void (async () => {
      // Edit mode: reuse the existing project unchanged.
      if (editProjectId) {
        const fetched = await getProjectMinimalAction(editProjectId)
        if ('error' in fetched) {
          toast.error(fetched.error)
          setIsCreating(false)
          return
        }
        setProject(fetched.data)
        setIsCreating(false)
        return
      }

      // New mode: resume the saved draft project (so its photos + typed text
      // survive a close) or create a fresh one, then persist its id so the next
      // open resumes the same draft.
      const clientId = searchParams.get('clientId') ?? undefined
      const result = await resumeOrCreateDraftProjectAction(readDraftProjectId(), clientId)
      if ('error' in result) {
        toast.error(result.error)
        setIsCreating(false)
        return
      }
      writeDraftProjectId(result.data.id)
      setProject(result.data)
      setIsCreating(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleComplete(estimateId: string) {
    if (!project) return
    // Draft consumed — the project now owns a real estimate, so the next New
    // Xtimate must start fresh instead of resuming this one.
    clearDraftProjectId()
    router.push(`/projects/${project.id}?tab=estimate&estimate=${estimateId}`)
    router.refresh()
    // Do NOT call onComplete() here — router.push changes the URL,
    // removing ?modal=new-project, so the dialog closes naturally.
    // Calling onComplete() (= router.replace) in the same tick races
    // with router.push and drops the navigation in Next.js App Router.
  }

  if (isCreating || !project) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingDots className="text-muted-foreground" dotClassName="h-2.5 w-2.5" />
      </div>
    )
  }

  return (
    <CaptureRecorder
      project={project}
      companyId={project.company_id}
      projectId={project.id}
      variant="popup"
      onComplete={handleComplete}
      estimateLanguage={estimateLanguage}
      setEstimateLanguage={setEstimateLanguage}
      // Persist the typed draft per flow: a stable 'new' key for new projects
      // (the draft project is resumed across opens), and a per-project key in
      // edit mode.
      draftKey={editProjectId ? `edit:${editProjectId}` : 'new'}
      // New mode resumes a draft project — rehydrate its photos into the strip.
      // Edit mode keeps its existing behavior (no photo strip prefill).
      restorePhotos={!editProjectId}
    />
  )
}
