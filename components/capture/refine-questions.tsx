'use client'

import { useState } from 'react'
import { Check, ChevronDown, CornerDownRight, ListChecks, Mic } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

/**
 * Notices review, stage 1 (2026-11-20): the AI's open questions as a short
 * script inside "Edit with AI", one card per question with its answer right
 * under it (this replaced the "Review before sending" box and its "Q:/A:"
 * text dumped into the instruction box).
 *
 * - Typing in a card answers it; the mic on a card answers it by voice (it
 *   starts the popup's one recorder and notes which questions the voice note
 *   answers).
 * - "Skip" makes it explicit that nothing is required; a skipped question
 *   stays here, dimmed, and can still be answered.
 * - The AI's assumptions sit collapsed at the end, for whoever wants to check.
 */

export interface RefineQuestionsProps {
  questions: string[]
  assumptions: string[]
  answers: Record<string, string>
  onAnswer: (question: string, answer: string) => void
  voiceFor: string[]
  onVoice: (question: string) => void
  skipped: string[]
  onSkip: (question: string) => void
  /** A recording is running: the per-question mics are disabled. */
  recording?: boolean
}

export function answeredCount(questions: readonly string[], answers: Record<string, string>, voiceFor: readonly string[]): number {
  return questions.filter((q) => (answers[q] ?? '').trim() || voiceFor.includes(q)).length
}

/**
 * The instruction the refine route receives: the answers first, then whatever
 * else the owner typed. Unanswered questions are left out.
 */
export function composeRefineInstruction(input: {
  questions: readonly string[]
  answers: Record<string, string>
  voiceFor: readonly string[]
  extra: string
}): string {
  const lines: string[] = []
  let n = 0
  for (const q of input.questions) {
    const typed = (input.answers[q] ?? '').trim()
    const byVoice = input.voiceFor.includes(q)
    if (!typed && !byVoice) continue
    n++
    const answer = typed
      ? byVoice ? `${typed} (more in the voice note)` : typed
      : '(answered in the voice note)'
    lines.push(`${n}. Q: ${q}\n   A: ${answer}`)
  }
  const extra = input.extra.trim()
  if (lines.length === 0) return extra
  const head = `Answers to your open questions:\n${lines.join('\n')}`
  return extra ? `${head}\n\nOther changes:\n${extra}` : head
}

export function RefineQuestions({
  questions,
  assumptions,
  answers,
  onAnswer,
  voiceFor,
  onVoice,
  skipped,
  onSkip,
  recording = false,
}: RefineQuestionsProps) {
  const { t } = useTranslation()
  const [showAssumptions, setShowAssumptions] = useState(false)
  // The first question that is neither answered nor skipped starts open.
  const firstOpen = questions.find((q) => !(answers[q] ?? '').trim() && !voiceFor.includes(q) && !skipped.includes(q))
  const [openQ, setOpenQ] = useState<string | null>(firstOpen ?? null)

  if (questions.length === 0 && assumptions.length === 0) return null
  const done = answeredCount(questions, answers, voiceFor)
  const open = questions.filter((q) => !(answers[q] ?? '').trim() && !voiceFor.includes(q) && !skipped.includes(q))

  return (
    <div className="flex flex-col gap-2.5" data-testid="refine-questions">
      {questions.length > 0 && (
        <div className="flex items-center justify-between px-0.5 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          <span>{t('Questions from the AI')}</span>
          <span className="flex items-center gap-2 font-medium normal-case tracking-normal">
            <span data-testid="refine-questions-progress">
              {t('{done} of {total} answered').replace('{done}', String(done)).replace('{total}', String(questions.length))}
            </span>
            {/* Every question is optional: one tap sets them all aside. */}
            {open.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => open.forEach((q) => onSkip(q))}
                  data-testid="refine-questions-skip-all"
                  className="relative font-semibold text-primary after:absolute after:-inset-2 after:content-[''] hover:underline"
                >
                  {t('Skip all')}
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {questions.map((q, i) => {
        const typed = answers[q] ?? ''
        const byVoice = voiceFor.includes(q)
        const isAnswered = !!typed.trim() || byVoice
        const isSkipped = !isAnswered && skipped.includes(q)
        const isOpen = openQ === q
        return (
          <div
            key={q}
            data-testid="refine-question"
            data-state={isAnswered ? 'answered' : isSkipped ? 'skipped' : 'open'}
            className={cn(
              'rounded-2xl border border-border bg-muted/40 px-4 py-3.5 transition-colors',
              isOpen && 'bg-background shadow-sm',
              isSkipped && !isOpen && 'opacity-60',
            )}
          >
            <button
              type="button"
              className="flex w-full items-start gap-3 text-left"
              onClick={() => setOpenQ(isOpen ? null : q)}
              aria-expanded={isOpen}
            >
              <span
                className={cn(
                  'mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold',
                  isAnswered ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary',
                )}
                aria-hidden
              >
                {isAnswered ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[14.5px] font-medium leading-snug">{q}</span>
            </button>

            {!isOpen && isAnswered && (
              <p className="ml-[34px] mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{typed.trim() || t('Answered in the voice note')}</span>
              </p>
            )}
            {!isOpen && isSkipped && (
              <p className="ml-[34px] mt-1 text-[12.5px] text-muted-foreground">{t('Skipped')}</p>
            )}

            {isOpen && (
              <div className="ml-[34px] mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={typed}
                    onChange={(e) => onAnswer(q, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      const next = questions.slice(i + 1).find((x) => !(answers[x] ?? '').trim() && !voiceFor.includes(x))
                      setOpenQ(next ?? null)
                    }}
                    placeholder={byVoice ? t('Answered in the voice note') : t('Your answer')}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-[hsl(var(--field-border))] bg-[hsl(var(--field))] px-3 text-[15px] outline-none placeholder:text-[hsl(var(--field-placeholder))] focus:border-primary focus:ring-4 focus:ring-primary/15"
                    data-testid="refine-question-input"
                    aria-label={q}
                  />
                  <button
                    type="button"
                    onClick={() => onVoice(q)}
                    disabled={recording}
                    aria-label={t('Answer by voice')}
                    aria-pressed={byVoice}
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary ring-1 ring-inset ring-primary/35 transition-colors disabled:opacity-50',
                      byVoice ? 'bg-primary text-primary-foreground ring-primary' : 'bg-primary/10 hover:bg-primary/15',
                    )}
                    data-testid="refine-question-mic"
                  >
                    <Mic className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>
                {!isAnswered && (
                  <button
                    type="button"
                    onClick={() => {
                      onSkip(q)
                      const next = questions.slice(i + 1).find((x) => !(answers[x] ?? '').trim() && !voiceFor.includes(x) && !skipped.includes(x))
                      setOpenQ(next ?? null)
                    }}
                    className="self-end px-1 py-0.5 text-[12.5px] text-muted-foreground hover:text-foreground"
                    data-testid="refine-question-skip"
                  >
                    {t('Skip')}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {assumptions.length > 0 && (
        <div className="rounded-2xl bg-muted/60">
          <button
            type="button"
            onClick={() => setShowAssumptions((v) => !v)}
            aria-expanded={showAssumptions}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13.5px] text-foreground/85"
            data-testid="refine-assumptions-toggle"
          >
            <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">
              {t('What the AI assumed ({count})').replace('{count}', String(assumptions.length))}
            </span>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showAssumptions && 'rotate-180')} aria-hidden />
          </button>
          {showAssumptions && (
            <ul className="list-disc space-y-1 px-4 pb-3.5 pl-9 text-[13px] text-muted-foreground" data-testid="refine-assumptions">
              {assumptions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
