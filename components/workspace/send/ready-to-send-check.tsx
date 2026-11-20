// components/workspace/send/ready-to-send-check.tsx
// "Ready to send?" card at the top of the Share sheet (notices review, stage 1).
// A calm checklist of what still needs the owner's eye: client, prices and
// unanswered AI questions. It NEVER blocks anything: link, message and PDF stay
// usable whatever the state. Copy is counts only (never how the AI priced).
// When everything is ok the card collapses to a single line.

'use client'

import { Check, ClipboardCheck, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'

export interface ReadyToSendReview {
  unpriced: number
  priceChecks: number
  pendingQuestions: string[]
  /** The estimate had AI questions at some point (so an all-answered row can show). */
  hadQuestions: boolean
  hasClient: boolean
}

export interface ReadyToSendCheckProps {
  review: ReadyToSendReview
  onFixPrices?: () => void
  onAnswerQuestions?: () => void
  onAddClient?: () => void
}

interface Row {
  key: 'client' | 'prices' | 'questions'
  ok: boolean
  label: string
  action?: { label: string; onClick?: () => void }
}

export function ReadyToSendCheck({
  review,
  onFixPrices,
  onAnswerQuestions,
  onAddClient,
}: ReadyToSendCheckProps) {
  const { t } = useTranslation()

  const unpriced = Math.max(0, review.unpriced)
  const priceChecks = Math.max(0, review.priceChecks)
  const questions = review.pendingQuestions.length

  const rows: Row[] = []

  rows.push(
    review.hasClient
      ? { key: 'client', ok: true, label: t('Client details filled in') }
      : {
          key: 'client',
          ok: false,
          label: t('No client yet'),
          action: { label: t('Add'), onClick: onAddClient },
        },
  )

  if (unpriced > 0) {
    rows.push({
      key: 'prices',
      ok: false,
      label: `${unpriced} ${unpriced === 1 ? t('item without a price') : t('items without a price')}`,
      action: { label: t('Set'), onClick: onFixPrices },
    })
  } else if (priceChecks > 0) {
    rows.push({
      key: 'prices',
      ok: false,
      label: `${priceChecks} ${priceChecks === 1 ? t('AI price to check') : t('AI prices to check')}`,
      action: { label: t('Check'), onClick: onFixPrices },
    })
  } else {
    rows.push({ key: 'prices', ok: true, label: t('All items priced') })
  }

  if (questions > 0) {
    rows.push({
      key: 'questions',
      ok: false,
      label: `${questions} ${questions === 1 ? t('AI question unanswered') : t('AI questions unanswered')}`,
      action: { label: t('Answer'), onClick: onAnswerQuestions },
    })
  } else if (review.hadQuestions) {
    rows.push({ key: 'questions', ok: true, label: t('AI questions answered') })
  }

  const okCount = rows.filter((r) => r.ok).length
  const allOk = okCount === rows.length

  if (allOk) {
    return (
      <div
        data-testid="ready-to-send-check"
        data-state="ready"
        className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-border bg-muted px-4 py-3.5"
      >
        <StatusDot ok />
        <p className="m-0 min-w-0 text-[14.5px] font-semibold text-foreground">
          {t('Ready to send')}
        </p>
      </div>
    )
  }

  const counter = t('{ok} of {total} ok')
    .replace('{ok}', String(okCount))
    .replace('{total}', String(rows.length))

  return (
    <div
      data-testid="ready-to-send-check"
      data-state="pending"
      className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-muted px-4 py-3.5"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="m-0 flex min-w-0 items-center gap-2 text-[14.5px] font-semibold text-foreground">
          <ClipboardCheck aria-hidden="true" className="size-[18px] shrink-0 text-primary" />
          <span className="min-w-0">{t('Ready to send?')}</span>
        </p>
        <span
          data-testid="ready-to-send-count"
          className="shrink-0 text-[12.5px] text-muted-foreground"
        >
          {counter}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => (
          <li
            key={row.key}
            data-testid={`ready-to-send-row-${row.key}`}
            data-ok={row.ok ? 'true' : 'false'}
            className="flex min-h-10 items-center gap-2.5"
          >
            <StatusDot ok={row.ok} />
            <span
              className={cn(
                'min-w-0 flex-1 text-[13.5px] leading-snug',
                row.ok ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              {row.label}
            </span>
            {row.action && (
              <button
                type="button"
                data-testid={`ready-to-send-action-${row.key}`}
                onClick={row.action.onClick}
                className="shrink-0 cursor-pointer whitespace-nowrap rounded px-1 py-2 text-[13.5px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {row.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full',
        ok
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      )}
    >
      {ok ? <Check className="size-3" strokeWidth={3} /> : <Minus className="size-3" strokeWidth={3} />}
    </span>
  )
}
