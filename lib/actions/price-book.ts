'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PriceBookItemFormValues } from '@/lib/schemas/price-book'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

export async function createPriceBookItem(formData: PriceBookItemFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data, error } = await supabase
    .from('company_price_book')
    .insert({
      company_id: company.id,
      category: formData.category,
      name: formData.name,
      unit: formData.unit || null,
      unit_price: formData.unit_price,
      notes: formData.notes || null,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to create item. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data }
}

export async function updatePriceBookItem(
  itemId: string,
  formData: PriceBookItemFormValues
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { data, error } = await supabase
    .from('company_price_book')
    .update({
      category: formData.category,
      name: formData.name,
      unit: formData.unit || null,
      unit_price: formData.unit_price,
      notes: formData.notes || null,
    })
    .eq('id', itemId)
    .select()
    .single()

  if (error) return { error: 'Failed to update item. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data }
}

export async function deletePriceBookItem(itemId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('company_price_book')
    .delete()
    .eq('id', itemId)

  if (error) return { error: 'Failed to delete item. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data: { deleted: true } }
}

export async function importPriceBookItems(
  rows: PriceBookItemFormValues[]
): Promise<
  | { data: { imported: number; skipped: number } }
  | { error: string }
> {
  // Wave 0 stub — Wave 1 fills this in per RESEARCH Pattern 2:
  //   1. getAuthContext()
  //   2. server-side re-validate every row with priceBookItemSchema.safeParse
  //   3. fetch existing (category, name) pairs for company → Set
  //   4. filter rows against existing keys (case-insensitive)
  //   5. supabase.from('company_price_book').insert(survivors) — single bulk insert
  //   6. revalidatePath('/settings/price-book')
  //   7. return { data: { imported, skipped } } | { error }
  void rows // silence unused-arg warning in skeleton
  return { error: 'not implemented (Wave 0 stub)' }
}
