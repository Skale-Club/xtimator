'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { getCurrentEstimateIdOrThrow } from '@/lib/estimate/poll-outcome'
import { consumeSearchParam } from '@/lib/utils/modal-url'

import { resumeOrCreateDraftProjectAction, getProjectMinimalAction } from '@/lib/actions/project'
import { createBlankEstimate } from '@/lib/actions/estimate'
import { billingBlockCopy, showBillingBlockToast } from '@/lib/billing/block-toast'
import { BILLING_SETTINGS_PATH, isBillingBlockCode, type BillingBlockCode } from '@/lib/billing/block-codes'
import { CreditCard } from 'lucide-react'
import { BuyCreditsInline } from '@/components/billing/buy-credits'
import { Button } from '@/components/ui/button'
import { useAppTranslation, useTranslation } from '@/lib/i18n/use-translation'
import { LoadingDots } from '@/components/ui/loading-dots'
import type { ProjectDetail } from '@/lib/queries/project'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

// Kept in sync with NEW_PROJECT_PREFILL_PARAM (new-project-dialog.tsx); not
// imported from there because the dialog imports this wizard.
const PREFILL_PARAM = 'refinePrefill'

// Lazy-loaded: the CaptureRecorder bundle (~1.5k LOC + the MediaRecorder
// pipeline) is heavy and this wizard is mounted on every authenticated page.
// next/dynamic with ssr:false keeps that chunk out of the initial payload —
// it only loads once the wizard has a project and renders the recorder.
const CaptureRecorder = dynamic(
  () => import('@/components/capture/capture-recorder').then((m) => m.CaptureRecorder),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center py-16">
        <LoadingDots className="text-muted-foreground" dotClassName="h-2.5 w-2.5" />
      </div>
    ),
  },
)

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
  /** Edit mode only: generate a fresh estimate for the project, don't refine. */
  fresh?: boolean
  /** Lifted estimate-language state so the Dialog header can own the selector. */
  estimateLanguage?: EstimateLanguage
  setEstimateLanguage?: (lang: EstimateLanguage) => void
}

export function NewProjectWizard({
  onComplete,
  editProjectId,
  fresh = false,
  estimateLanguage,
  setEstimateLanguage,
}: NewProjectWizardProps = {}) {
  const router = useRouter()
  const { t } = useTranslation()
  // The popup scopes useTranslation to the ESTIMATE language; the block card is
  // app chrome, so it speaks the app language (like the processing overlay).
  const { t: tApp } = useAppTranslation()
  const searchParams = useSearchParams()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  // The company cannot start a new estimate (paywalled / out of credits, or
  // below the estimate's entry gate): the popup shows why, with the way out,
  // instead of an endless loader behind a toast that disappears.
  const [blockedCode, setBlockedCode] = useState<BillingBlockCode | null>(null)
  const createdRef = useRef(false)
  // Edit mode: the project's current estimate. When set the popup REFINES it
  // (preview + apply); when null the popup keeps the generate behavior.
  const [currentEstimateId, setCurrentEstimateId] = useState<string | null>(null)
  // "Answer with AI" seeds the text box once; the param is removed from the URL.
  const [prefill, setPrefill] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!editProjectId) return
    const value = consumeSearchParam(PREFILL_PARAM)
    if (value) setPrefill(value)
  }, [editProjectId])

  const start = useCallback(() => {
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
        // "Answer and generate" (fresh): the generate path on purpose, the
        // estimate on screen has nothing to refine yet.
        if (fresh) {
          setProject(fetched.data)
          setIsCreating(false)
          return
        }
        // OrThrow: a failed read must stop here, never fall through to the
        // generate path (Edit with AI never regenerates an existing estimate).
        try {
          setCurrentEstimateId(await getCurrentEstimateIdOrThrow(editProjectId))
        } catch {
          toast.error(t('Could not load the current estimate. Please try again.'))
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
        // SEED-055 Phase D: a paywalled / out-of-credits company cannot create a
        // draft project - the popup shows the block with its Subscribe / Buy
        // credits way out (credit recalibration 2026-11-19: it used to show a
        // toast and keep the loader spinning forever).
        const code = (result as { code?: unknown }).code
        if (isBillingBlockCode(code)) setBlockedCode(code)
        else toast.error(result.error)
        setIsCreating(false)
        return
      }
      writeDraftProjectId(result.data.id)
      setProject(result.data)
      setIsCreating(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (createdRef.current) return
    createdRef.current = true
    start()
  }, [start])

  // Credits plan 2026-11-20: bought credits from the block below - carry on
  // creating the draft right here, no reload.
  const handlePurchased = useCallback(() => {
    setBlockedCode(null)
    start()
  }, [start])

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

  // Returns false when no blank estimate was created, so the popup can drop its loader.
  async function handleStartBlank(): Promise<boolean> {
    if (!project) return false
    const result = await createBlankEstimate(project.id)
    if ('error' in result || !result.data) {
      if (!showBillingBlockToast((result as { code?: unknown }).code, router, t)) {
        toast.error((result as { error?: string }).error ?? 'Failed to create estimate')
      }
      return false
    }
    clearDraftProjectId()
    router.push(`/projects/${project.id}?tab=estimate&estimate=${result.data.estimateId}`)
    router.refresh()
    return true
  }

  if (blockedCode) {
    const copy = billingBlockCopy(blockedCode, tApp)
    return (
      <div
        data-testid="new-xtimate-blocked"
        data-state={blockedCode}
        className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-10 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CreditCard className="h-6 w-6" />
        </div>
        <div className="max-w-xs space-y-1.5">
          <p className="text-base font-semibold">{copy.title}</p>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        {blockedCode === 'out_of_credits' ? (
          <div className="w-full max-w-sm">
            <BuyCreditsInline onPurchased={handlePurchased} />
          </div>
        ) : (
          copy.cta && (
            <Button size="lg" onClick={() => router.push(`${BILLING_SETTINGS_PATH}#choose-plan`)}>
              {copy.cta}
            </Button>
          )
        )}
      </div>
    )
  }

  if (isCreating || !project) {
    return (
      <div className="flex min-h-[260px] items-center justify-center py-16">
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
      // Only offered in new-project mode — doesn't make sense when editing.
      onStartBlank={!editProjectId ? handleStartBlank : undefined}
      // Edit mode with an existing estimate: refine it instead of regenerating.
      refineEstimateId={editProjectId ? (currentEstimateId ?? undefined) : undefined}
      onRefineDone={onComplete}
      initialText={prefill}
    />
  )
}
