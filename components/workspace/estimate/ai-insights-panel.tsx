'use client'

import { MessageCircleQuestion, Sparkles } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { AiMeta } from '@/lib/estimate/ai-meta'

// SEED-057 Phase G: what the AI assumed, left out and could not decide.
//
// PLATFORM-ADMIN ONLY. This is presentational content for the estimate debug
// dialog (estimate-debug-dialog.tsx); it is no longer rendered in the editor
// page flow. It is never part of the page view, the share page, a PDF, the
// WhatsApp message or the plain-text message. The project page strips ai_meta
// for non-admins, lib/queries/share.ts strips it for the public page, and
// tests/unit/estimate/ai-meta-client-surfaces.test.ts guards the client surfaces.

const IMPACT_STYLE = {
  high: 'bg-red-500/10 text-red-700 dark:text-red-300',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'bg-muted text-muted-foreground',
} as const

interface AiInsightsSectionsProps {
  meta: AiMeta | null
  projectId: string
  /** Called right before "Answer with AI" navigates (the debug dialog closes itself). */
  onNavigate?: () => void
}

/** Open questions, assumptions and exclusions. Renders nothing when there are none. */
export function AiInsightsSections({ meta, projectId, onNavigate }: AiInsightsSectionsProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()

  if (!meta) return null
  const assumptions = meta.assumptions ?? []
  const exclusions = meta.exclusions ?? []
  const questions = meta.open_questions ?? []
  if (assumptions.length === 0 && exclusions.length === 0 && questions.length === 0) return null

  // Seed the popup's text box with the open questions so the owner only types
  // the answers: "Q: <question>\nA: " per question.
  const openEditWithAi = () => {
    onNavigate?.()
    router.push(
      editEstimateHref(
        searchParams.toString(),
        projectId,
        questions.map((q) => `Q: ${q.question}\nA: `).join('\n\n'),
      ),
      { scroll: false },
    )
  }

  return (
    <div className="space-y-3" data-testid="ai-notes">
      {questions.length > 0 && (
        <section data-testid="ai-open-questions">
          <h3 className="mb-1 flex items-center gap-1.5 font-medium">
            <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />
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
  )
}
