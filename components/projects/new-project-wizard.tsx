'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { createProjectAction, getProjectMinimalAction } from '@/lib/actions/project'
import { CaptureRecorder } from '@/components/capture/capture-recorder'
import type { ProjectDetail } from '@/lib/queries/project'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

interface NewProjectWizardProps {
  /** Called after navigating to the project page so the dialog can close/reset. */
  onComplete?: () => void
  /** Lifted estimate-language state so the Dialog header can own the selector. */
  estimateLanguage?: EstimateLanguage
  setEstimateLanguage?: (lang: EstimateLanguage) => void
}

export function NewProjectWizard({
  onComplete,
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
      const clientId = searchParams.get('clientId') ?? undefined
      const result = await createProjectAction({
        clientId,
        clientName: '',
        inputMode: undefined,
      })
      if ('error' in result) {
        toast.error(result.error)
        setIsCreating(false)
        return
      }

      const fetched = await getProjectMinimalAction(result.data.id)
      if ('error' in fetched) {
        toast.error(fetched.error)
        setIsCreating(false)
        return
      }

      setProject(fetched.data)
      setIsCreating(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleComplete(estimateId: string) {
    if (!project) return
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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
    />
  )
}
