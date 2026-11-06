'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, MessageSquareReply, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useTranslation } from '@/lib/i18n/use-translation'

export type ClientResponseValue = 'accepted' | 'declined' | null

interface ClientResponseControlProps {
  clientResponse: string | null
  respondedAt: string | null
  /** A signature row exists: the answer came from the public page and is final. */
  signedOnline: boolean
  /** Unsaved edits / save in flight: marking would lock content mid-save. */
  disabled?: boolean
  onRecord: (response: ClientResponseValue) => Promise<void>
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * "Client response" entry in the estimate action pill. Lets the owner record
 * the client's answer in-app (phone / in-person acceptance, or a company
 * without online approval) and shows the current answer quietly in the label.
 * Marking locks the estimate content, hence the confirm dialog.
 */
export function ClientResponseControl({
  clientResponse,
  respondedAt,
  signedOnline,
  disabled,
  onRecord,
}: ClientResponseControlProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<ClientResponseValue | 'clear' | null>(null)
  const [busy, setBusy] = useState(false)

  const answered = clientResponse === 'accepted' || clientResponse === 'declined'
  const date = shortDate(respondedAt)
  const stateLabel = clientResponse === 'accepted' ? t('Accepted') : clientResponse === 'declined' ? t('Declined') : null

  if (signedOnline) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('Signed online')}
        {date ? ` · ${date}` : ''}
      </span>
    )
  }

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
      ? t('Mark as accepted?')
      : pending === 'declined'
        ? t('Mark as declined?')
        : t('Clear the client response?')
  const description =
    pending === 'clear'
      ? t('The estimate becomes editable again if it was not sent to the client.')
      : t('This records the answer you got from the client and locks the estimate content. You can clear it later.')

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label={t('Client response')}
            className="shrink-0 gap-1.5 rounded-full text-foreground"
          >
            {clientResponse === 'accepted' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : clientResponse === 'declined' ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <MessageSquareReply className="h-3.5 w-3.5" />
            )}
            {stateLabel ? `${stateLabel}${date ? ` · ${date}` : ''}` : t('Client response')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          {clientResponse !== 'accepted' && (
            <DropdownMenuItem onSelect={() => setPending('accepted')}>
              <CheckCircle2 className="h-4 w-4" />
              {t('Mark as accepted')}
            </DropdownMenuItem>
          )}
          {clientResponse !== 'declined' && (
            <DropdownMenuItem onSelect={() => setPending('declined')}>
              <XCircle className="h-4 w-4" />
              {t('Mark as declined')}
            </DropdownMenuItem>
          )}
          {answered && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPending('clear')}>
                <Undo2 className="h-4 w-4" />
                {t('Clear response')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
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
