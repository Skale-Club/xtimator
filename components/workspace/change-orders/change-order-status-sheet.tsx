'use client'

import { useState } from 'react'
import { CheckCircle2, Undo2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { relativeTime } from '@/lib/utils/relative-time'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import type { ChangeOrderResponse, ChangeOrderStatus } from '@/lib/change-orders/types'
import { shortDate } from './change-order-utils'

export interface ChangeOrderStatusSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: ChangeOrderStatus
  createdAt: string
  sentAt: string | null
  viewCount: number
  lastViewedAt: string | null
  clientResponse: ChangeOrderResponse | null
  respondedAt: string | null
  signedOnline: boolean
  /** Unsaved edits or a save in flight: recording an answer would lock the content mid-save. */
  recordDisabled: boolean
  onRecord: (response: ChangeOrderResponse | null) => Promise<void>
}

function TimelineLine({ lead, rest, tone = 'primary' }: { lead: string; rest?: string; tone?: 'primary' | 'success' | 'danger' }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          'mt-[7px] size-2 shrink-0 rounded-full',
          tone === 'success' ? 'bg-[hsl(var(--success))]' : tone === 'danger' ? 'bg-[hsl(var(--destructive-text))]' : 'bg-primary',
        )}
      />
      <span className="min-w-0">
        <b className="font-semibold text-foreground">{lead}</b>
        {rest ? ` ${rest}` : ''}
      </span>
    </li>
  )
}

const ACTION_BTN =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary/10 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-50'

/**
 * Timeline of what happened to the change order, plus (unless the client
 * signed online) the place to record their answer by hand. Bottom sheet on
 * phones, centred card from sm up.
 */
export function ChangeOrderStatusSheet({
  open,
  onOpenChange,
  status,
  createdAt,
  sentAt,
  viewCount,
  lastViewedAt,
  clientResponse,
  respondedAt,
  signedOnline,
  recordDisabled,
  onRecord,
}: ChangeOrderStatusSheetProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<ChangeOrderResponse | 'clear' | null>(null)
  const [busy, setBusy] = useState(false)
  const answered = clientResponse === 'accepted' || clientResponse === 'declined'

  const confirm = async () => {
    if (pending === null) return
    setBusy(true)
    try {
      await onRecord(pending === 'clear' ? null : pending)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  const title =
    pending === 'accepted'
      ? t('Mark as approved?')
      : pending === 'declined'
        ? t('Mark as declined?')
        : t('Clear the client response?')
  const description =
    pending === 'clear'
      ? t('The change order becomes editable again.')
      : t('This records the answer you got from the client and locks the change order. You can clear it later.')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            'flex flex-col gap-0 overflow-hidden border-border bg-background p-0 backdrop-blur-none',
            'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none pb-[env(safe-area-inset-bottom)]',
            'sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:max-h-[85dvh] sm:max-w-[440px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:pb-0',
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
              {t('Change order status')}
            </DialogTitle>
            <DialogDescription className="sr-only">{t('Change order status')}</DialogDescription>

            <ul className="flex flex-col gap-2 text-[13.5px] text-muted-foreground">
              <TimelineLine lead={t('Created')} rest={shortDate(createdAt)} />
              {sentAt && <TimelineLine lead={t('Shared')} rest={shortDate(sentAt)} />}
              {viewCount > 0 && (
                <TimelineLine
                  lead={`${t('Opened')} ${viewCount} ${viewCount === 1 ? t('time') : t('times')}`}
                  rest={lastViewedAt ? `· ${relativeTime(lastViewedAt)}` : undefined}
                />
              )}
              {answered && (
                <TimelineLine
                  lead={clientResponse === 'accepted' ? t('Approved') : t('Declined')}
                  rest={[shortDate(respondedAt), signedOnline ? `· ${t('Signed online')}` : ''].filter(Boolean).join(' ')}
                  tone={clientResponse === 'accepted' ? 'success' : 'danger'}
                />
              )}
            </ul>

            {status === 'draft' ? (
              <p className="text-[13.5px] text-muted-foreground">
                {t('Not shared yet. The client’s answer shows up here after you share the change order.')}
              </p>
            ) : signedOnline ? null : (
              <div className="flex flex-col gap-2">
                <p className="text-[13.5px] text-muted-foreground">{t('Got the answer by phone or in person? Record it here.')}</p>
                {clientResponse !== 'accepted' && (
                  <button type="button" className={ACTION_BTN} disabled={recordDisabled} onClick={() => setPending('accepted')}>
                    <CheckCircle2 className="size-4" aria-hidden />
                    {t('Mark as approved')}
                  </button>
                )}
                {clientResponse !== 'declined' && (
                  <button type="button" className={ACTION_BTN} disabled={recordDisabled} onClick={() => setPending('declined')}>
                    <XCircle className="size-4" aria-hidden />
                    {t('Mark as declined')}
                  </button>
                )}
                {answered && (
                  <button type="button" className={ACTION_BTN} disabled={recordDisabled} onClick={() => setPending('clear')}>
                    <Undo2 className="size-4" aria-hidden />
                    {t('Clear response')}
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void confirm()
              }}
            >
              {t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
