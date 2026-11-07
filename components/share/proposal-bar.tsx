'use client'

import type { ReactNode } from 'react'
import { CheckCircle, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

/** Digits-only phone for wa.me. A bare 10-digit number is a US number, so the
 *  country code is prepended (wa.me requires one). */
export function whatsappDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `1${digits}` : digits
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
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.1.82.83-3.02-.2-.31a8.2 8.2 0 1 1 6.95 3.83Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.17.25-.63.8-.77.96-.14.17-.28.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.1-.5.11-.11.25-.28.37-.42.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.19 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.54.1.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  )
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
}: ProposalBarProps) {
  const { t } = useTranslation()
  const waDigits = phone ? whatsappDigits(phone) : ''

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
              {t('Estimate')} #{estimateNumber} · {estimateDate}
            </p>
          </div>
        </div>

        {trailing}

        <div className="shrink-0 text-right">
          <p className="hidden text-[11px] leading-none text-muted-foreground sm:block">
            {t('Total')}
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
          {phone && waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className={`${iconBtn} ${collapseOnMobile}`}
            >
              <WhatsAppIcon className="h-4 w-4" />
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
            className="shrink-0 bg-green-600 text-white hover:bg-green-700"
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
