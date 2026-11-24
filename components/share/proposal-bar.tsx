'use client'

import type { ReactNode } from 'react'
import { CheckCircle, Mail, MessageSquare, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

/** Phone number for an `sms:` link, in E.164 form. A bare 10-digit number is
 *  a US number, so +1 is prepended; anything else keeps its own digits. */
export function smsNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  return `+${digits.length === 10 ? `1${digits}` : digits}`
}

interface ProposalBarProps {
  companyName: string
  logoUrl: string | null
  phone: string | null
  email: string | null
  /** Already formatted estimate number (same value the document shows). */
  estimateNumber: string
  /** Already formatted estimate date (same formatting as the document). */
  estimateDate: string
  /** Already formatted total, e.g. "$1,234.50". */
  total: string
  brandText: string
  /** Show the primary Accept button (online approval on and not responded). */
  showAccept: boolean
  onAccept: () => void
  /** Optional trailing slot, e.g. the language chip. */
  trailing?: ReactNode
  /** Replaces the "Estimate #{number} · {date}" subtitle (already translated),
   *  e.g. the change order page says "Change order SK-1045-CO1". */
  subtitle?: string
  /** Replaces the "Total" caption above the amount (already translated). */
  totalLabel?: string
}

/**
 * Sticky header of the public estimate page. Sits above the document, shows
 * who sent it, the estimate number/date and total, the company's contact
 * actions and — only when online approval is on — the primary Accept button.
 */
export function ProposalBar({
  companyName,
  logoUrl,
  phone,
  email,
  estimateNumber,
  estimateDate,
  total,
  brandText,
  showAccept,
  onAccept,
  trailing,
  subtitle,
  totalLabel,
}: ProposalBarProps) {
  const { t } = useTranslation()
  const sms = phone ? smsNumber(phone) : ''

  // With the Accept button present, mobile keeps only name + total + Call + Accept.
  const collapseOnMobile = showAccept ? 'hidden sm:inline-flex' : ''

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <header
      data-testid="proposal-bar"
      className="sticky top-0 z-30 -mx-4 border-b border-border bg-white px-4 shadow-md sm:mx-0 sm:rounded-b-lg"
    >
      <div className="flex min-h-14 items-center gap-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded object-contain"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{companyName}</p>
            <p className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">
              {subtitle ?? `${t('Estimate')} #${estimateNumber} · ${estimateDate}`}
            </p>
          </div>
        </div>

        {trailing}

        {/* On phones with the Accept button present the fixed bottom bar already
            shows the total; dropping it here keeps the company name readable
            instead of squeezed to one letter at 360px. */}
        <div className={`shrink-0 text-right ${showAccept ? 'hidden sm:block' : ''}`}>
          <p className="hidden text-[11px] leading-none text-muted-foreground sm:block">
            {totalLabel ?? t('Total')}
          </p>
          <p
            data-testid="proposal-bar-total"
            className="text-sm font-semibold leading-tight tabular-nums sm:text-base"
            style={{ color: brandText }}
          >
            {total}
          </p>
        </div>

        <nav aria-label={t('Contact')} className="flex shrink-0 items-center gap-1.5">
          {phone && (
            <a href={`tel:${phone}`} aria-label={t('Call')} className={iconBtn}>
              <Phone className="h-4 w-4" />
            </a>
          )}
          {sms && (
            <a
              href={`sms:${sms}`}
              aria-label={t('Text message')}
              className={`${iconBtn} ${collapseOnMobile}`}
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} aria-label={t('Email')} className={`${iconBtn} ${collapseOnMobile}`}>
              <Mail className="h-4 w-4" />
            </a>
          )}
        </nav>

        {showAccept && (
          <Button
            size="sm"
            className="shrink-0 bg-green-700 text-white hover:bg-green-800"
            onClick={onAccept}
          >
            <CheckCircle className="mr-1.5 h-4 w-4" />
            {t('Accept')}
          </Button>
        )}
      </div>
    </header>
  )
}
