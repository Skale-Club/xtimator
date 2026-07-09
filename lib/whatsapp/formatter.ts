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
import { formatMoney } from '@/lib/money/currency'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import {
  resolvePresentationSettings,
  isSectionVisible,
  type PresentationSettings,
} from '@/lib/estimate/presentation-settings'

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
  discount_type?: string | null
  discount_value?: number
  discount_amount?: number
  tax_rate: number
  tax_amount: number
  /** Phase 134 (v4.11): persisted deposit fields — read, never recomputed (GUARD-03) */
  deposit_type?: string | null
  deposit_value?: number | null
  balance_due?: number | null
  payment_terms: string | null
  timeline: string | null
  sections: FormatterSection[]
  /** Phase 52: language of AI-generated content; drives label translation */
  language?: 'en' | 'pt' | 'es'
  currency_code?: string | null
}

interface FormatterLabels {
  greetingWithName: (name: string) => string
  greetingAnon: string
  intro: (company: string) => string
  introAnon: string
  subtotal: string
  discount: (type: string | null | undefined, value: number) => string
  tax: (pct: string) => string
  total: string
  deposit: string
  balanceDue: string
  closing: string
  regards: string
}

const LABELS: Record<'en' | 'pt' | 'es', FormatterLabels> = {
  en: {
    greetingWithName: (n) => `Hello ${n},`,
    greetingAnon: 'Hello,',
    intro: (c) => `Thank you for reaching out to ${c}! Here's your estimate:`,
    introAnon: "Here's your estimate:",
    subtotal: 'Subtotal',
    discount: (type, value) =>
      type === 'percentage' ? `Discount (${value}%)` : 'Discount',
    tax: (pct) => `Tax (${pct}%)`,
    total: 'Total Estimate',
    deposit: 'Deposit',
    balanceDue: 'Balance Due',
    closing:
      "Let me know if you have any questions or would like to schedule. I'd be happy to assist you!",
    regards: 'Best regards,',
  },
  pt: {
    greetingWithName: (n) => `Olá ${n},`,
    greetingAnon: 'Olá,',
    intro: (c) => `Obrigado por entrar em contato com ${c}! Segue seu orçamento:`,
    introAnon: 'Segue seu orçamento:',
    subtotal: 'Subtotal',
    discount: (type, value) =>
      type === 'percentage' ? `Desconto (${value}%)` : 'Desconto',
    tax: (pct) => `Imposto (${pct}%)`,
    total: 'Total do Orçamento',
    deposit: 'Entrada',
    balanceDue: 'Saldo Devedor',
    closing: 'Fique à vontade para entrar em contato com dúvidas ou para agendar. Terei prazer em ajudar!',
    regards: 'Atenciosamente,',
  },
  es: {
    greetingWithName: (n) => `Hola ${n},`,
    greetingAnon: 'Hola,',
    intro: (c) => `¡Gracias por contactar a ${c}! Aquí está su presupuesto:`,
    introAnon: 'Aquí está su presupuesto:',
    subtotal: 'Subtotal',
    discount: (type, value) =>
      type === 'percentage' ? `Descuento (${value}%)` : 'Descuento',
    tax: (pct) => `Impuesto (${pct}%)`,
    total: 'Total del Presupuesto',
    deposit: 'Depósito',
    balanceDue: 'Saldo Pendiente',
    closing:
      '¿Preguntas? Con gusto le ayudamos a programar. ¡Estamos a su disposición!',
    regards: 'Saludos,',
  },
}

/**
 * Build a WhatsApp message body for the full estimate.
 * Uses plain text with line breaks — renders well in WhatsApp without
 * requiring Meta template approval.
 *
 * @param responsibleName     - Name of the person sending the estimate (owner / rep)
 * @param companyWebsite      - Company website URL shown in the sign-off
 * @param presentation_settings - SENDHUB-04 (Phase 163): trailing OPTIONAL nullable arg.
 *                              When omitted, resolver defaults preserve today's behavior
 *                              (all sections visible). No signature-object explosion
 *                              (per Phase 163 Pitfall 4) — trailing optional only.
 */
export function formatEstimateForWhatsApp(
  estimate: FormatterEstimate,
  clientName: string | null,
  companyName: string | null,
  responsibleName?: string | null,
  companyWebsite?: string | null,
  presentation_settings?: PresentationSettings | null,
): string {
  const language = estimate.language ?? 'en'
  const L = LABELS[language]
  const money = (n: number) => formatMoney(n, estimate.currency_code)
  const lines: string[] = []

  // SENDHUB-04 (Phase 163): resolve once. When arg is omitted, resolver defaults
  // preserve today's behavior (all sections visible) — retrocompat for
  // tests/unit/whatsapp/formatter.test.ts.
  const resolved = resolvePresentationSettings(presentation_settings)

  // ── Greeting + intro ─────────────────────────────────────────────────────
  lines.push(clientName ? L.greetingWithName(clientName) : L.greetingAnon)
  lines.push(companyName ? L.intro(companyName) : L.introAnon)
  lines.push('')

  // ── Sections ── SENDHUB-04: resolver-gated on 'sections' toggle ──────────
  if (isSectionVisible(resolved, 'sections')) {
    for (const section of estimate.sections) {
      lines.push(`[${section.title}]`)
      for (const item of section.items) {
        if (item.quantity > 1) {
          lines.push(
            `- ${item.description} x ${item.quantity} (${money(item.unit_price)} each): ${money(item.total)}`
          )
        } else {
          lines.push(`- ${item.description} x ${item.quantity}: ${money(item.total)}`)
        }
      }
      lines.push('')
    }
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const discountAmount = estimate.discount_amount ?? 0
  const hasDiscount = discountAmount > 0
  const hasTax = estimate.tax_rate > 0 && estimate.tax_amount > 0
  const needsSubtotal = hasDiscount || hasTax

  if (needsSubtotal) {
    lines.push(`${L.subtotal}: ${money(estimate.subtotal)}`)
  }
  if (hasDiscount) {
    const label = L.discount(estimate.discount_type, estimate.discount_value ?? 0)
    lines.push(`${label}: -${money(discountAmount)}`)
  }
  if (hasTax) {
    lines.push(
      `${L.tax((estimate.tax_rate * 100).toFixed(0))}: ${money(estimate.tax_amount)}`
    )
  }
  lines.push('')
  lines.push(`${L.total}: ${money(estimate.total)}`)
  lines.push('')

  // ── Deposit + Balance Due (Phase 134 / v4.11, PUI-02) ─────────────────────
  // Read PERSISTED server fields — no recompute (GUARD-03). Lines emit only when
  // a deposit is actually set; legacy rows stay byte-identical.
  const dep = deriveDepositDisplay({
    total: estimate.total,
    deposit_type: estimate.deposit_type ?? 'none',
    deposit_value: estimate.deposit_value ?? null,
    balance_due: estimate.balance_due ?? null,
  })
  if (dep.showDeposit) {
    lines.push(`${L.deposit}: -${money(dep.depositAmount)}`)
    lines.push(`${L.balanceDue}: ${money(dep.balanceDue)}`)
    lines.push('')
  }

  // ── Closing + sign-off ────────────────────────────────────────────────────
  lines.push(L.closing)
  lines.push('')
  lines.push(L.regards)
  if (responsibleName) lines.push(responsibleName)
  if (companyWebsite) lines.push(companyWebsite)

  return lines.join('\n')
}
