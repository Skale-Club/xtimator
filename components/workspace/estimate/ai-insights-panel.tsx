'use client'

import { AlertTriangle, MessageCircleQuestion, Sparkles } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { AiMeta } from '@/lib/estimate/ai-meta'

// SEED-057 Phase G: what the AI assumed, left out and could not decide, and the
// "AI needs review" banner when the structure score was low.
//
// OWNER-FACING ONLY. This panel lives in the editor, outside the document
// stage, so it is never part of the page view, the share page, a PDF, the
// WhatsApp message or the plain-text message. lib/queries/share.ts strips
// ai_meta before the public page ever sees the row, and
// tests/unit/estimate/ai-meta-client-surfaces.test.ts guards both.

const MAX_FINDINGS = 5

const IMPACT_STYLE = {
  high: 'bg-red-500/10 text-red-700 dark:text-red-300',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'bg-muted text-muted-foreground',
} as const

export function AiInsightsPanel({ meta, projectId }: { meta: AiMeta | null; projectId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()

  if (!meta) return null
  const needsReview = meta.quality && meta.quality.band !== 'ok'
  const assumptions = meta.assumptions ?? []
  const exclusions = meta.exclusions ?? []
  const questions = meta.open_questions ?? []
  if (!needsReview && assumptions.length === 0 && exclusions.length === 0 && questions.length === 0) {
    return null
  }

  const openEditWithAi = () =>
    router.push(editEstimateHref(searchParams.toString(), projectId), { scroll: false })

  return (
    <div className="space-y-2" data-testid="ai-insights-panel">
      {needsReview && meta.quality && (
        <Alert data-testid="ai-needs-review">
          <AlertTriangle />
          <AlertTitle>{t('AI needs review')}</AlertTitle>
          <AlertDescription>
            <p>{t('The AI draft is thin or incomplete in places. Check these before you send it:')}</p>
            {meta.quality.findings.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {meta.quality.findings.slice(0, MAX_FINDINGS).map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {(assumptions.length > 0 || exclusions.length > 0 || questions.length > 0) && (
        <details
          className="rounded-lg border bg-card text-card-foreground"
          open={questions.length > 0}
          data-testid="ai-notes"
        >
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('What the AI assumed')}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {t('Only you see this')}
            </span>
          </summary>

          <div className="space-y-3 border-t px-3 py-3 text-sm">
            {questions.length > 0 && (
              <section data-testid="ai-open-questions">
                <h3 className="mb-1 flex items-center gap-1.5 font-medium">
                  <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
                  {t('Open questions')}
                </h3>
                <ul className="space-y-1.5">
                  {questions.map((q) => (
                    <li key={q.question} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${IMPACT_STYLE[q.impact]}`}
                      >
                        {t(q.impact === 'high' ? 'High impact' : q.impact === 'medium' ? 'Medium impact' : 'Low impact')}
                      </span>
                      <span className="min-w-0 flex-1">{q.question}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={openEditWithAi}
                  data-testid="ai-answer-questions"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {t('Answer with AI')}
                </Button>
              </section>
            )}

            {assumptions.length > 0 && (
              <section data-testid="ai-assumptions">
                <h3 className="mb-1 font-medium">{t('Assumptions')}</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  {assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </section>
            )}

            {exclusions.length > 0 && (
              <section data-testid="ai-exclusions">
                <h3 className="mb-1 font-medium">{t('Not included')}</h3>
                <ul className="list-disc space-y-0.5 pl-5">
                  {exclusions.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
