'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Eye } from 'lucide-react'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { changeOrderPublicPath } from '@/lib/change-orders/types'
import type { ChangeOrderActions } from './change-order-actions'
import { formatSigned } from './change-order-utils'

// Same blue palette as the estimate Share sheet (`nx-surface` popups).
const PRIMARY_STYLE = {
  backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))',
} as const
const PRIMARY_BTN = 'h-[50px] rounded-full px-5 text-[15px] font-semibold text-white shadow-none hover:text-white'
const SECONDARY_BTN =
  'rounded-full bg-primary/10 font-semibold text-primary shadow-none hover:bg-primary/15 hover:text-primary hover:translate-y-0'
const LABEL = 'text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'

export interface ChangeOrderShareSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changeOrderId: string
  number: number
  title: string
  /** Signed total of the change order. */
  total: number
  currencyCode: string
  projectName: string
  clientName: string | null
  shareToken: string
  /** sent_at already set: the first-share call is skipped. */
  alreadyShared: boolean
  markShared: ChangeOrderActions['markChangeOrderShared']
  /** Called after the first-share call succeeded (the editor refreshes). */
  onShared: () => void
}

function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * Share sheet for a change order. Like the estimate's: Xtimator never sends
 * anything itself, the owner copies the link or the message and sends it from
 * their own apps. The FIRST copy/open marks the change order as shared.
 */
export function ChangeOrderShareSheet({
  open,
  onOpenChange,
  changeOrderId,
  number,
  title,
  total,
  currencyCode,
  projectName,
  clientName,
  shareToken,
  alreadyShared,
  markShared,
  onShared,
}: ChangeOrderShareSheetProps) {
  const { t } = useTranslation()
  const [linkCopied, setLinkCopied] = useState(false)
  const [messageCopied, setMessageCopied] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const markedRef = useRef(alreadyShared)

  const link = typeof window === 'undefined' ? changeOrderPublicPath(shareToken) : `${window.location.origin}${changeOrderPublicPath(shareToken)}`

  const name = firstName(clientName)
  const template =
    total > 0
      ? t('Hi{name}, here is change order #{number} for {project}{title}. It adds {amount} to the contract. Please review and approve it here:')
      : total < 0
        ? t('Hi{name}, here is change order #{number} for {project}{title}. It removes {amount} from the contract. Please review and approve it here:')
        : t('Hi{name}, here is change order #{number} for {project}{title}. It does not change the contract total. Please review and approve it here:')
  const generated = template
    .replace('{name}', name ? ` ${name}` : '')
    .replace('{number}', String(number))
    .replace('{project}', () => projectName)
    .replace('{title}', () => (title.trim() ? `: ${title.trim()}` : ''))
    .replace('{amount}', formatCurrency(Math.abs(total), currencyCode))
  const message = draft ?? generated

  function ensureMarked() {
    if (markedRef.current) return
    markedRef.current = true
    void markShared(changeOrderId)
      .then((result) => {
        if (result.error) {
          markedRef.current = false
          return
        }
        onShared()
      })
      .catch(() => {
        markedRef.current = false
      })
  }

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      toast.error(t('Could not copy. Select the text and copy it by hand.'))
      return false
    }
  }

  async function handleCopyLink() {
    if (!(await copy(link))) return
    ensureMarked()
    setLinkCopied(true)
    window.setTimeout(() => setLinkCopied(false), 2500)
  }

  async function handleCopyMessage() {
    if (!(await copy(`${message}\n\n${link}`))) return
    ensureMarked()
    setMessageCopied(true)
    window.setTimeout(() => setMessageCopied(false), 2500)
  }

  function handleOpen() {
    ensureMarked()
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-[560px]">

        <DialogHeader data-sheet-drag="" className="flex shrink-0 touch-none flex-row items-start justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pl-6 sm:pr-4 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">{t('Share change order')}</DialogTitle>
            <p className="min-w-0 truncate text-[13.5px] text-muted-foreground">
              {[clientName, `${t('Change order')} #${number}`, formatSigned(total, currencyCode)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <BottomSheetCloseButton label={t('Close')} />
          <DialogDescription className="sr-only">
            {t('Copy the link or the message and send it from your own apps.')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-5 pt-3.5 pb-5 sm:px-6 sm:pt-4 sm:pb-6">
          <div className="flex min-w-0 flex-col gap-2">
            <p className={LABEL}>{t('Online change order')}</p>
            <div className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-border bg-muted p-3.5">
              <p
                data-testid="change-order-share-url"
                className="m-0 text-[14.5px] leading-snug font-medium text-foreground [overflow-wrap:anywhere]"
              >
                {link}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => void handleCopyLink()} style={PRIMARY_STYLE} className={cn(PRIMARY_BTN, 'min-w-0 flex-1')}>
                  {linkCopied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}
                  {linkCopied ? t('Link copied') : t('Copy link')}
                </Button>
                <Button variant="ghost" onClick={handleOpen} className={cn(SECONDARY_BTN, 'h-[50px] shrink-0 px-[18px] text-[14.5px]')}>
                  <Eye className="size-[18px]" />
                  {t('Open')}
                </Button>
              </div>
              {linkCopied && (
                <p className="m-0 text-[12.5px] text-muted-foreground">{t('Paste it where you already talk to the client.')}</p>
              )}
            </div>
          </div>

          <div data-testid="change-order-share-message" className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className={LABEL}>{t('Ready message')}</p>
              <Button
                variant="ghost"
                onClick={() => void handleCopyMessage()}
                className={cn(SECONDARY_BTN, 'h-10 px-3.5 text-[13.5px]')}
              >
                {messageCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {messageCopied ? t('Message copied') : t('Copy message')}
              </Button>
            </div>
            <div className="rounded-2xl border border-border bg-muted px-4 py-3.5">
              <Textarea
                value={message}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={t('Ready message')}
                className="h-[150px] min-h-0 resize-none rounded-none border-0 bg-transparent p-0 text-[15px] leading-normal shadow-none [field-sizing:fixed] focus-visible:shadow-none"
              />
            </div>
            <p className="m-0 text-[12.5px] text-muted-foreground">
              {t('Copying the message adds the link at the end.')}
              {draft !== null && draft !== generated && (
                <>
                  {' '}
                  <button type="button" onClick={() => setDraft(null)} className="font-medium text-primary underline-offset-2 hover:underline">
                    {t('Reset message')}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </BottomSheetContent>
    </Dialog>
  )
}
