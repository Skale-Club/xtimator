'use client'

/**
 * components/chat/estimate-card.tsx — inline estimate-generation result (CHATUI-04).
 *
 * When the assistant calls createEstimate, the tool returns a {jobId} for the
 * async Inngest generation job. This card polls that job via the existing
 * useJobStatus hook and renders the right state:
 *   - processing            → a spinner card ("Generating estimate…").
 *   - failed | config_unavailable | not_found → a friendly error card (surfacing
 *     `reason` when present — never a raw status code).
 *   - completed             → resolve the produced estimate id via the
 *     resolveCurrentEstimateId server action, then an "Open in editor" Button
 *     linking to the existing editor (/projects/<id>?tab=estimate&estimate=<id>).
 *
 * Reuses battle-tested job-poll + estimate-query primitives; introduces NO domain
 * logic. The backend route + tools stay frozen.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Loader2, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useJobStatus } from '@/hooks/use-job-status'
import { resolveCurrentEstimateId } from '@/lib/actions/chat'

export function EstimateCard({
  jobId,
  projectId,
}: {
  jobId: string
  projectId: string
}) {
  const { t } = useTranslation()
  const job = useJobStatus(jobId)
  const [estimateId, setEstimateId] = useState<string | null>(null)
  const [resolveFailed, setResolveFailed] = useState(false)

  useEffect(() => {
    if (job.state !== 'completed') return
    let cancelled = false
    void (async () => {
      const id = await resolveCurrentEstimateId(projectId)
      if (cancelled) return
      if (id) setEstimateId(id)
      else setResolveFailed(true)
    })()
    return () => {
      cancelled = true
    }
  }, [job.state, projectId])

  // Error states — surface the reason when present, never a raw status code.
  if (
    job.state === 'failed' ||
    job.state === 'config_unavailable' ||
    job.state === 'not_found' ||
    resolveFailed
  ) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex items-center gap-2 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{job.reason || t('We could not generate the estimate. Please try again.')}</span>
        </CardContent>
      </Card>
    )
  }

  // Completed AND the estimate id resolved — the open-in-editor action.
  if (job.state === 'completed' && estimateId) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-sm">
          <FileText className="h-4 w-4 text-primary" />
          <span>{t('Your estimate is ready.')}</span>
        </CardContent>
        <CardFooter>
          <Button asChild size="sm">
            <Link href={`/projects/${projectId}?tab=estimate&estimate=${estimateId}`}>
              {t('Open in editor')}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Processing (or completed-but-still-resolving) — the spinner card.
  return (
    <Card>
      <CardContent className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t('Generating estimate…')}</span>
      </CardContent>
    </Card>
  )
}
