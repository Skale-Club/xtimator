'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { MAX_OWNER_QUESTIONS } from '@/lib/estimate/question-limits'

/**
 * Notices review stage 1, part 2 (2026-11-20).
 *
 * The owner's review questions: the AI's open questions for the draft, then
 * the clarifying questions of a project waiting for details. Same text once,
 * and never more than MAX_OWNER_QUESTIONS in all.
 */
export function mergeReviewQuestions(
  ownerQuestions: readonly string[] | null | undefined,
  needsDetailsQuestions: readonly string[] | null | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const q of [...(ownerQuestions ?? []), ...(needsDetailsQuestions ?? [])]) {
    const text = q.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length === MAX_OWNER_QUESTIONS) break
  }
  return out
}

const HINT_KEY = (estimateId: string) => `xtm:shared-edit-hint:${estimateId}`

function hintShown(estimateId: string): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY(estimateId)) === '1'
  } catch {
    return false
  }
}

function markHintShown(estimateId: string) {
  try {
    window.localStorage.setItem(HINT_KEY(estimateId), '1')
  } catch {
    // Private mode or blocked storage: the hint may show again next visit.
  }
}

/**
 * Replaces the permanent "Shared with the client" strip: the first edit after
 * the estimate was shared shows one toast saying the client's link updates.
 * Once per estimate per browser.
 */
export function useSharedEditHint({
  estimateId,
  isDirty,
  shared,
  clientName,
}: {
  estimateId: string
  isDirty: boolean
  shared: boolean
  clientName: string | null
}) {
  const { t } = useTranslation()
  const shownThisMount = useRef<string | null>(null)

  useEffect(() => {
    if (!shared || !isDirty) return
    if (shownThisMount.current === estimateId || hintShown(estimateId)) return
    shownThisMount.current = estimateId
    markHintShown(estimateId)
    const name = clientName?.trim()
    const message = name
      ? t('{name} already has this link. What you change shows up there right away.').replace('{name}', name)
      : t('Your client already has this link. What you change shows up there right away.')
    toast.info(message, { id: `shared-edit-hint-${estimateId}`, duration: 6000 })
  }, [shared, isDirty, estimateId, clientName, t])
}
