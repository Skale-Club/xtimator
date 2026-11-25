import { formatCurrency } from '@/lib/utils/format'
import { formatDate } from '@/lib/utils/format-date'
import type { ChangeOrderStatus } from '@/lib/change-orders/types'

/** Typographic minus, used for credits everywhere in the change order UI. */
export const MINUS = '−'

/** "+$800.00", "−$50.00" or "$0.00": a signed contract delta. */
export function formatSigned(value: number, currencyCode: string): string {
  if (value > 0) return `+${formatCurrency(value, currencyCode)}`
  if (value < 0) return `${MINUS}${formatCurrency(Math.abs(value), currencyCode)}`
  return formatCurrency(0, currencyCode)
}

/** Short status date on the same UTC contract day as public and PDF documents. */
export function shortDate(iso?: string | null): string {
  if (!iso) return ''
  return formatDate(iso, { month: 'short', day: 'numeric' })
}

/** Where a change order stands. A view proves it was shared, like for estimates. */
export function deriveChangeOrderStatus(i: {
  sentAt?: string | null
  viewCount?: number
  clientResponse?: string | null
}): ChangeOrderStatus {
  if (i.clientResponse === 'accepted') return 'accepted'
  if (i.clientResponse === 'declined') return 'declined'
  if (i.sentAt || (i.viewCount ?? 0) > 0) return 'sent'
  return 'draft'
}

/** Chip tones, same palette as the estimate status chip. */
export const STATUS_TONE: Record<ChangeOrderStatus, { pill: string; dot: string }> = {
  draft: { pill: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  sent: { pill: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  accepted: { pill: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]', dot: 'bg-[hsl(var(--success))]' },
  declined: {
    pill: 'bg-[hsl(var(--destructive-text)/0.12)] text-[hsl(var(--destructive-text))]',
    dot: 'bg-[hsl(var(--destructive-text))]',
  },
}

/** Text colour of a signed amount: brand when it adds, red when it removes. */
export function amountTone(value: number): string {
  if (value > 0) return 'text-primary'
  if (value < 0) return 'text-[hsl(var(--destructive-text))]'
  return 'text-foreground'
}
