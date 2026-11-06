// lib/estimate/document/terms-text.ts
//
// SEED-056 Phase E: the payment / timeline / warranty / notes blocks as plain
// text, for the channels that have no page layout (WhatsApp message, the
// {{items_breakdown}} variable of the plain-text send template). Same rules as
// every other rendering: a block is emitted only when its presentation section
// is visible AND its text is non-empty, in the same order the PDF prints the
// cards (payment, timeline, warranty, notes). Labels come from the document
// labels so every channel agrees.

import { LABELS } from '@/lib/estimate/document/labels'
import {
  isSectionVisible,
  type ResolvedPresentationSettings,
} from '@/lib/estimate/presentation-settings'

export interface TermsTextSource {
  payment_terms?: string | null
  timeline?: string | null
  warranty_terms?: string | null
  notes?: string | null
  language?: 'en' | 'pt' | 'es' | string | null
}

export function termsTextBlocks(
  estimate: TermsTextSource,
  resolved: ResolvedPresentationSettings,
): string[] {
  const language = estimate.language === 'pt' || estimate.language === 'es' ? estimate.language : 'en'
  const L = LABELS[language]
  const candidates = [
    { section: 'payment_terms', label: L.paymentTerms, text: estimate.payment_terms },
    { section: 'timeline', label: L.timeline, text: estimate.timeline },
    { section: 'warranty_terms', label: L.warranty, text: estimate.warranty_terms },
    { section: 'notes', label: L.notes, text: estimate.notes },
  ] as const

  const blocks: string[] = []
  for (const { section, label, text } of candidates) {
    const body = typeof text === 'string' ? text.trim() : ''
    if (!body || !isSectionVisible(resolved, section)) continue
    blocks.push(`${label}:\n${body}`)
  }
  return blocks
}
