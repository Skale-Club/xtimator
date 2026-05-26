'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ClientFormValues } from '@/lib/schemas/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

export async function createClientAction(formData: ClientFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      company_id: company.id,
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      city: formData.city || null,
      state: formData.state || null,
      zip: formData.zip || null,
      notes: formData.notes || null,
      preferred_language: formData.preferred_language || null,
    })
    .select()
    .single()

  if (error) return { error: 'Failed to create client. Please try again.' }

  revalidatePath('/clients')
  return { data: client }
}

export async function updateClientAction(clientId: string, formData: ClientFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { data: client, error } = await supabase
    .from('clients')
    .update({
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      city: formData.city || null,
      state: formData.state || null,
      zip: formData.zip || null,
      notes: formData.notes || null,
      preferred_language: formData.preferred_language || null,
    })
    .eq('id', clientId)
    .select()
    .single()

  if (error) return { error: 'Failed to update client. Please try again.' }

  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { data: client }
}

export async function patchClientContactAction(
  clientId: string,
  data: { name: string; email: string | null; phone: string | null }
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('clients')
    .update({ name: data.name, email: data.email || null, phone: data.phone || null })
    .eq('id', clientId)

  if (error) return { error: 'Failed to update client.' }

  revalidatePath('/clients')
  return { data: { updated: true } }
}

export async function deleteClientAction(clientId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Count orphaned projects before deletion
  const { count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)

  if (error) return { error: 'Failed to delete client. Please try again.' }

  revalidatePath('/clients')
  return { data: { deleted: true, orphanedProjects: count ?? 0 } }
}
