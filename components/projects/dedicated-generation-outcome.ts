'use client'

import { toast } from 'sonner'
import { showBillingBlockToast } from '@/lib/billing/block-toast'
import { pollEstimateOutcome } from '@/lib/estimate/poll-outcome'

/** Report the estimate linked to this attempt before opening the project editor. */
export async function waitForDedicatedEstimate({
  projectId, attemptId, signal, router, t, vagueMessage, timeoutMessage,
}: {
  projectId: string
  attemptId: string
  signal: AbortSignal
  router: { push: (href: string) => void }
  t: (key: string) => string
  vagueMessage: string
  timeoutMessage: string
}): Promise<boolean> {
  const outcome = await pollEstimateOutcome({ projectId, attemptId, signal, previousEstimateId: null, requireAttemptResult: true })
  if (signal.aborted) return false

  switch (outcome.state) {
    case 'completed':
      router.push(`/projects/${projectId}?tab=estimate&estimate=${outcome.estimateId}`)
      return true
    case 'paused':
      showBillingBlockToast('out_of_credits', router, t)
      break
    case 'failed':
      if (outcome.creditBlocked) showBillingBlockToast('out_of_credits', router, t)
      else toast.error(outcome.reason || t('Failed to generate estimate'))
      break
    case 'awaiting_details':
      toast.error(vagueMessage)
      break
    case 'timeout':
      toast.error(timeoutMessage)
      break
  }
  return false
}
