import 'server-only'
/**
 * lib/agent-tools/create-service.ts
 *
 * NEUT — channel-neutral "add a price-book service" capability. Mirrors the
 * dashboard server action createPriceBookItem (lib/actions/price-book.ts) but
 * stripped of the cookie-session auth wrapper: the caller passes a trusted
 * service-role client and the resolved companyId. Reuses priceBookItemSchema
 * and the same effectiveUnitPrice derivation so the agent path and the UI path
 * write identical rows.
 *
 * Scope: agents create FIXED-price services only. The area_based /
 * base_plus_addons pricing models are multi-field UI flows and stay dashboard-
 * only; an agent that needs them should point the owner at the Price Book page.
 *
 * T-lrf-01: `companyId` and `supabase` are TRUSTED closure/positional params
 * resolved upstream from the owner identity — they are NEVER LLM tool-input
 * fields. `currency_code` is read from the company row, never from LLM input.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { priceBookItemSchema, type PriceBookItemFormValues } from '@/lib/schemas/price-book'

export type CreateServiceInput = {
  name: string
  unitPrice: number
  unit?: string
  notes?: string
  folderId?: string | null
}

export type CreateServiceResult =
  | { ok: true; id: string; name: string; unitPrice: number; currencyCode: string }
  | { ok: false; message: string }

/** Same derivation as lib/actions/price-book.ts — kept in sync deliberately. */
function effectiveUnitPrice(form: PriceBookItemFormValues): number {
  if (form.pricing_type === 'area_based') return form.minimum_price ?? 0
  if (form.pricing_type === 'base_plus_addons') return form.base_price ?? 0
  return form.unit_price
}

export async function createPriceBookService(
  supabase: SupabaseClient,
  companyId: string,
  input: CreateServiceInput,
): Promise<CreateServiceResult> {
  // Validate through the SAME schema the dashboard form uses (defense in depth).
  const parsed = priceBookItemSchema.safeParse({
    name: input.name,
    unit: input.unit ?? '',
    unit_price: input.unitPrice,
    notes: input.notes ?? '',
    folder_id: input.folderId ?? null,
    pricing_type: 'fixed',
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  // currency_code is a company property, never an LLM-supplied value.
  const { data: company } = await supabase
    .from('companies')
    .select('currency_code')
    .eq('id', companyId)
    .single()
  const currencyCode =
    (company as { currency_code?: string | null } | null)?.currency_code ?? 'USD'

  const { data, error } = await supabase
    .from('company_price_book')
    .insert({
      company_id: companyId,
      currency_code: currencyCode,
      folder_id: parsed.data.folder_id ?? null,
      name: parsed.data.name,
      unit: parsed.data.unit || null,
      unit_price: effectiveUnitPrice(parsed.data),
      notes: parsed.data.notes || null,
      pricing_type: 'fixed',
    })
    .select('id, name, unit_price, currency_code')
    .single()

  if (error || !data) {
    return { ok: false, message: 'Failed to save the service. Please try again.' }
  }
  return {
    ok: true,
    id: (data as { id: string }).id,
    name: (data as { name: string }).name,
    unitPrice: (data as { unit_price: number }).unit_price,
    currencyCode: (data as { currency_code: string }).currency_code,
  }
}
