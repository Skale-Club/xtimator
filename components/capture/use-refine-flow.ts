'use client'

// Refine mode of the "Edit with AI" popup. Owns the whole non-generate path:
//   flush unsaved editor edits -> POST /api/estimates/[id]/refine (preview)
//   -> review (mergeRefinement diff) -> Apply | Discard.
// Nothing here touches recordings or /api/generate-estimate. The bridge to the
// editor is documented in lib/estimate/refine-bridge.ts.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getEstimateByIdAction } from '@/lib/actions/estimate'
import { showBillingBlockToast } from '@/lib/billing/block-toast'
import { requestRefine, type RefineInput } from '@/lib/capture/refine-client'
import { mergeRefinement, type MergeCurrentContent, type RefineDiff } from '@/lib/estimate/refine-merge'
import { getRefineEditor, storePendingRefinement } from '@/lib/estimate/refine-bridge'
import type { EditorSection, RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'
import { useTranslation } from '@/lib/i18n/use-translation'

export type RefinePhase = 'idle' | 'saving' | 'refining' | 'review' | 'applying'

export interface RefineReviewState {
  /** Exactly what Apply will deliver to the editor. */
  refined: RefinementPayload
  diff: RefineDiff
  instruction: string
  currencyCode: string
}

interface Options {
  estimateId: string
  projectId: string
  /** Called after a successful apply into a mounted editor, and after Discard. */
  onDone: () => void
  /** Called after Apply (either path) so the caller can drop its draft text. */
  onApplied?: () => void
}

async function loadPersistedContent(
  estimateId: string,
): Promise<{ content: MergeCurrentContent; currencyCode: string } | null> {
  const res = await getEstimateByIdAction(estimateId)
  if (res.error || !res.data) return null
  const e = res.data
  return {
    currencyCode: e.currency_code ?? 'USD',
    content: {
      summary: e.summary,
      notes: e.notes,
      timeline: e.timeline,
      payment_terms: e.payment_terms,
      warranty_terms: e.warranty_terms,
      // Persisted rows already carry id/description/quantity/unit_price, the
      // only fields the diff and the id-matching read.
      sections: e.sections as unknown as EditorSection[],
    },
  }
}

export function useRefineFlow({ estimateId, projectId, onDone, onApplied }: Options) {
  const { t } = useTranslation()
  const router = useRouter()
  const [phase, setPhase] = useState<RefinePhase>('idle')
  const [review, setReview] = useState<RefineReviewState | null>(null)
  const busyRef = useRef(false)

  const submit = useCallback(
    async (input: RefineInput): Promise<void> => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        // 1. The server refines the PERSISTED estimate, so unsaved editor edits
        //    must reach the database first. No mounted editor = nothing unsaved.
        const editor = getRefineEditor(estimateId)
        if (editor) {
          setPhase('saving')
          const flushed = await editor.flush()
          if (!flushed.ok) {
            toast.error(flushed.error || t('Could not save your latest edits. Fix that first, then try again.'))
            setPhase('idle')
            return
          }
        }

        // 2. Preview request.
        setPhase('refining')
        const result = await requestRefine(estimateId, input)
        if (!result.ok) {
          if (result.billing && showBillingBlockToast(result.billing, router, t)) {
            setPhase('idle')
            return
          }
          // Locked (sent/signed) and every other failure: show the route's message.
          toast.error(result.error)
          setPhase('idle')
          return
        }

        // 3. Diff against what is on screen now (post-flush editor content, or
        //    the persisted row when no editor is mounted).
        let current: MergeCurrentContent
        let currencyCode: string
        const liveEditor = getRefineEditor(estimateId)
        if (liveEditor) {
          current = liveEditor.getContent()
          currencyCode = liveEditor.currencyCode()
        } else {
          const persisted = await loadPersistedContent(estimateId)
          if (!persisted) {
            toast.error(t('Could not load the current estimate to compare.'))
            setPhase('idle')
            return
          }
          current = persisted.content
          currencyCode = persisted.currencyCode
        }
        const { diff } = mergeRefinement(current, result.refined)
        setReview({ refined: result.refined, diff, instruction: result.instruction, currencyCode })
        setPhase('review')
      } catch {
        toast.error(t('Something went wrong. Please try again.'))
        setPhase('idle')
      } finally {
        busyRef.current = false
      }
    },
    [estimateId, router, t],
  )

  const apply = useCallback(async (): Promise<void> => {
    if (!review || busyRef.current) return
    busyRef.current = true
    try {
      const editor = getRefineEditor(estimateId)
      if (editor) {
        setPhase('applying')
        const outcome = await editor.apply(review.refined)
        if (outcome === 'blocked') {
          toast.error(t('This estimate is locked, so it cannot be changed. Create a new version to keep editing.'))
          setPhase('review')
          return
        }
        if (outcome === 'unsaved') {
          toast.error(t('The changes were applied in the editor but could not be saved yet. Review them there.'))
        } else {
          toast.success(t('AI changes applied'))
        }
        onApplied?.()
        setReview(null)
        setPhase('idle')
        onDone()
        return
      }
      // No editor mounted: hand the payload to the editor that mounts on the
      // estimate tab; it applies and saves it.
      if (!storePendingRefinement(estimateId, review.refined)) {
        toast.error(t('Could not hand the changes to the editor. Please try again.'))
        return
      }
      onApplied?.()
      setReview(null)
      setPhase('idle')
      router.push(`/projects/${projectId}?tab=estimate`)
    } finally {
      busyRef.current = false
    }
  }, [review, estimateId, projectId, router, t, onDone, onApplied])

  const discard = useCallback(() => {
    setReview(null)
    setPhase('idle')
    onDone()
  }, [onDone])

  return { phase, review, submit, apply, discard }
}
