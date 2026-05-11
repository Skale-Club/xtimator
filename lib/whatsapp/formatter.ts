/**
 * Phase 44: WhatsApp formatted-text estimate builder.
 * Phase 52: i18n labels per estimate language (SEED-016).
 *
 * Produces a WhatsApp-friendly plain-text estimate that works without
 * Meta template approval (free-form messages to opted-in contacts).
 *
 * AI-generated content (summary, item descriptions) is already in the
 * target language because the AI prompt was language-aware. This formatter
 * only translates the structural labels (Subtotal, Total, Timeline, etc.).
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
  /** Phase 52: language of AI-generated content; drives label translation */
  language?: 'en' | 'pt' | 'es'
}

interface FormatterLabels {
  greetingWithName: (name: string) => string
  greetingAnon: string
  fromCompany: (name: string) => string
  fromAnon: string
  subtotal: string
  tax: (pct: string) => string
  total: string
  timeline: string
  payment: string
  closing: string
}

const LABELS: Record<'en' | 'pt' | 'es', FormatterLabels> = {
  en: {
    greetingWithName: (n) => `Hi ${n},`,
    greetingAnon: 'Hi,',
    fromCompany: (c) => `*${c}* has prepared an estimate for you:`,
    fromAnon: 'Here is your estimate:',
    subtotal: 'Subtotal',
    tax: (pct) => `Tax (${pct}%)`,
    total: 'Total',
    timeline: 'Timeline',
    payment: 'Payment',
    closing: 'Questions? Just reply to this message.',
  },
  pt: {
    greetingWithName: (n) => `Olá ${n},`,
    greetingAnon: 'Olá,',
    fromCompany: (c) => `*${c}* preparou um orçamento para você:`,
    fromAnon: 'Aqui está seu orçamento:',
    subtotal: 'Subtotal',
    tax: (pct) => `Imposto (${pct}%)`,
    total: 'Total',
    timeline: 'Prazo',
    payment: 'Pagamento',
    closing: 'Dúvidas? É só responder esta mensagem.',
  },
  es: {
    greetingWithName: (n) => `Hola ${n},`,
    greetingAnon: 'Hola,',
    fromCompany: (c) => `*${c}* ha preparado un presupuesto para usted:`,
    fromAnon: 'Aquí está su presupuesto:',
    subtotal: 'Subtotal',
    tax: (pct) => `Impuesto (${pct}%)`,
    total: 'Total',
    timeline: 'Plazo',
    payment: 'Pago',
    closing: '¿Preguntas? Solo responda este mensaje.',
  },
}

/**
 * Locale-aware currency formatter.
 * USD remains the system currency; the locale affects format only.
 */
function formatCurrency(value: number, language: 'en' | 'pt' | 'es'): string {
  const locale =
    language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-MX' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

/**
 * Build a WhatsApp message body for the full estimate.
 * Uses *bold* and line breaks — renders well in WhatsApp.
 */
export function formatEstimateForWhatsApp(
  estimate: FormatterEstimate,
  clientName: string | null,
  companyName: string | null
): string {
  const language = estimate.language ?? 'en'
  const L = LABELS[language]
  const money = (n: number) => formatCurrency(n, language)
  const lines: string[] = []

  lines.push(clientName ? L.greetingWithName(clientName) : L.greetingAnon)
  lines.push('')
  lines.push(companyName ? L.fromCompany(companyName) : L.fromAnon)

  if (estimate.summary) {
    lines.push('')
    lines.push(estimate.summary)
  }

  lines.push('')
  lines.push('─────────────────')

  for (const section of estimate.sections) {
    lines.push('')
    lines.push(`*${section.title}* — ${money(section.subtotal)}`)
    for (const item of section.items) {
      const unitLabel = item.unit ? ` ${item.unit}` : ''
      lines.push(
        `  • ${item.description} — ${item.quantity}${unitLabel} × ${money(item.unit_price)} = ${money(item.total)}`
      )
    }
  }

  lines.push('')
  lines.push('─────────────────')

  if (estimate.tax_rate > 0) {
    lines.push(`${L.subtotal}: ${money(estimate.subtotal)}`)
    lines.push(`${L.tax((estimate.tax_rate * 100).toFixed(0))}: ${money(estimate.tax_amount)}`)
  }
  lines.push(`*${L.total}: ${money(estimate.total)}*`)

  if (estimate.timeline) {
    lines.push('')
    lines.push(`${L.timeline}: ${estimate.timeline}`)
  }
  if (estimate.payment_terms) {
    lines.push(`${L.payment}: ${estimate.payment_terms}`)
  }

  lines.push('')
  lines.push(L.closing)

  return lines.join('\n')
}
