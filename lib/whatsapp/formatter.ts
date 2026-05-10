/**
 * Phase 44: WhatsApp formatted-text estimate builder.
 *
 * Produces a WhatsApp-friendly plain-text estimate that works without
 * Meta template approval (free-form messages to opted-in contacts).
 */

export type FormatterItem = {
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
}

export type FormatterSection = {
  title: string
  subtotal: number
  items: FormatterItem[]
}

export type FormatterEstimate = {
  summary: string | null
  total: number
  subtotal: number
  tax_rate: number
  tax_amount: number
  payment_terms: string | null
  timeline: string | null
  sections: FormatterSection[]
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

/**
 * Build a WhatsApp message body for the full estimate.
 * Uses *bold* and line breaks — renders well in WhatsApp.
 */
export function formatEstimateForWhatsApp(
  estimate: FormatterEstimate,
  clientName: string | null,
  companyName: string | null
): string {
  const lines: string[] = []

  const greeting = clientName ? `Hi ${clientName},` : 'Hi,'
  lines.push(greeting)
  lines.push('')

  const from = companyName ? `*${companyName}* has prepared an estimate for you:` : 'Here is your estimate:'
  lines.push(from)

  if (estimate.summary) {
    lines.push('')
    lines.push(estimate.summary)
  }

  lines.push('')
  lines.push('─────────────────')

  for (const section of estimate.sections) {
    lines.push('')
    lines.push(`*${section.title}* — ${usd(section.subtotal)}`)
    for (const item of section.items) {
      const unitLabel = item.unit ? ` ${item.unit}` : ''
      lines.push(`  • ${item.description} — ${item.quantity}${unitLabel} × ${usd(item.unit_price)} = ${usd(item.total)}`)
    }
  }

  lines.push('')
  lines.push('─────────────────')

  if (estimate.tax_rate > 0) {
    lines.push(`Subtotal: ${usd(estimate.subtotal)}`)
    lines.push(`Tax (${(estimate.tax_rate * 100).toFixed(0)}%): ${usd(estimate.tax_amount)}`)
  }
  lines.push(`*Total: ${usd(estimate.total)}*`)

  if (estimate.timeline) {
    lines.push('')
    lines.push(`Timeline: ${estimate.timeline}`)
  }
  if (estimate.payment_terms) {
    lines.push(`Payment: ${estimate.payment_terms}`)
  }

  lines.push('')
  lines.push('Questions? Just reply to this message.')

  return lines.join('\n')
}
