// lib/ai/normalize.ts
import type { EstimateOutput, LineItemOutput } from './types'

export function normalizeOutput(raw: Record<string, unknown>): EstimateOutput {
  const rawClientName = raw.suggested_client_name
  const suggestedClientName =
    typeof rawClientName === 'string' && rawClientName.trim().length > 0
      ? rawClientName.trim()
      : null

  const sections = (raw.sections as Array<{ title: string; items: Array<Record<string, unknown>> }>).map(section => ({
    title: section.title,
    items: section.items.map((item): LineItemOutput => ({
      description: item.description as string,
      quantity: item.quantity as number,
      unit: item.unit as string | undefined,
      unit_price: item.unit_price as number,
      // D-15 defensive fallback: anything other than exact 'price_book' becomes 'ai_estimate'
      // This covers undefined, null, missing field, and unexpected values from the model.
      price_source: item.price_source === 'price_book' ? 'price_book' : 'ai_estimate',
    })),
  }))
  return {
    suggested_project_name: raw.suggested_project_name as string,
    suggested_client_name: suggestedClientName,
    summary: raw.summary as string,
    notes: raw.notes as string | undefined,
    timeline: raw.timeline as string | undefined,
    payment_terms: raw.payment_terms as string | undefined,
    warranty_terms: raw.warranty_terms as string | undefined,
    sections,
  }
}
