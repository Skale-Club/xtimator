'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'
import {
  listBackgroundGenerations,
  removeBackgroundGeneration,
} from '@/lib/estimate/background-generations'
import { useBackgroundGenerations } from '@/hooks/use-background-generations'
import { useAppTranslation } from '@/lib/i18n/use-translation'

/** Journal read cadence per watched attempt. Slower than the popup's 2.5s: nobody is staring at it. */
export const BACKGROUND_POLL_MS = 5_000

/**
 * Announces the result of every estimate generation the operator walked away
 * from (lib/estimate/background-generations.ts). Mounted once in the app shell,
 * so it keeps watching on every page.
 *
 * On a terminal journal outcome it drops the entry and says what happened:
 *   - completed: "Estimate ready", with a button that opens it; if the
 *     operator is already on that project, the page refreshes so the estimate
 *     simply appears, and no toast repeats what the page already shows;
 *   - needs_details / failed: a notice that opens the project, where the
 *     operator can add details or retry.
 * When the tab is hidden and the operator allowed notifications, a browser
 * notification says it too, so a phone in a pocket still hears about it.
 */
export function BackgroundGenerationWatcher() {
  const generations = useBackgroundGenerations()
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useAppTranslation()

  // Latest values for the interval callback, without restarting the interval
  // on every render.
  const latest = useRef({ pathname, t, router })
  useEffect(() => {
    latest.current = { pathname, t, router }
  })

  const inFlight = useRef(new Set<string>())
  const hasWork = generations.length > 0

  useEffect(() => {
    if (!hasWork) return

    const notifyBrowser = (title: string, body: string | undefined, url: string, tag: string) => {
      try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        if (!document.hidden) return
        const n = new Notification(title, { body, tag })
        n.onclick = () => {
          window.focus()
          latest.current.router.push(url)
          n.close()
        }
      } catch {
        // Notifications are a nicety; the in-app notice already fired.
      }
    }

    const check = async () => {
      // Read the store itself, not the last render's copy: an entry removed a
      // moment ago must never be announced twice.
      for (const g of listBackgroundGenerations()) {
        if (inFlight.current.has(g.attemptId)) continue
        inFlight.current.add(g.attemptId)
        try {
          const outcome = await getAttemptOutcome(g.attemptId)
          // Another tab (or an earlier tick) may have announced it meanwhile.
          if (!listBackgroundGenerations().some((e) => e.attemptId === g.attemptId)) continue
          const { t: tr, router: r, pathname: path } = latest.current
          const projectUrl = `/projects/${g.projectId}`
          const onProject = path === projectUrl || path?.startsWith(`${projectUrl}/`)

          if (outcome.state === 'completed') {
            removeBackgroundGeneration(g.attemptId)
            const url = `${projectUrl}?tab=estimate&estimate=${outcome.estimateId}`
            if (onProject) {
              r.refresh()
              // Already looking at it: the estimate tab's checklist completes
              // and the estimate appears in place. A toast would only repeat it.
              if (!document.hidden) continue
            }
            toast.success(tr('Estimate ready'), {
              description: g.projectName,
              duration: 15_000,
              action: { label: tr('Open'), onClick: () => r.push(url) },
            })
            notifyBrowser(tr('Estimate ready'), g.projectName, url, g.attemptId)
          } else if (outcome.state === 'needs_details') {
            removeBackgroundGeneration(g.attemptId)
            if (onProject) r.refresh()
            toast.info(tr('The estimate needs more details'), {
              description: g.projectName,
              duration: 15_000,
              action: { label: tr('Open'), onClick: () => r.push(projectUrl) },
            })
            notifyBrowser(tr('The estimate needs more details'), g.projectName, projectUrl, g.attemptId)
          } else if (outcome.state === 'failed') {
            removeBackgroundGeneration(g.attemptId)
            if (onProject) r.refresh()
            toast.error(tr('Estimate generation failed'), {
              description: g.projectName,
              duration: 15_000,
              action: { label: tr('Open'), onClick: () => r.push(projectUrl) },
            })
            notifyBrowser(tr('Estimate generation failed'), g.projectName, projectUrl, g.attemptId)
          }
          // pending / unauthorized: keep watching; the entry expires on its own.
        } catch {
          // A failed read (offline, deploy in progress) is retried next tick.
        } finally {
          inFlight.current.delete(g.attemptId)
        }
      }
    }

    void check()
    const id = setInterval(() => void check(), BACKGROUND_POLL_MS)
    return () => clearInterval(id)
  }, [hasWork])

  return null
}
