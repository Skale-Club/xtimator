'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ClientFormValues } from '@/lib/schemas/client'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { serverStorage } from '@/lib/storage/server'
import { storageProxyPath } from '@/lib/storage/asset-url'
import { convertImageToWebp } from '@/lib/image/webp'

const MAX_LOGO_SIZE = 2 * 1024 * 1024
const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  // getActiveCompanyId() already validated membership (company_members FK →
  // companies), so the company row provably exists — skip a redundant SELECT.
  const company = { id: activeCompanyId }

  const denied = await assertWritable()
  if (denied) return denied

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

export async function removeClientLogo(clientId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('clients')
    .update({ logo_url: null })
    .eq('id', clientId)

  if (error) return { error: 'Failed to remove logo.' }

  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { data: { removed: true } }
}

/**
 * Server-side logo upload for a client — replaces the previous client-side
 * direct-to-storage upload so the file goes through WebP conversion (sharp
 * only runs server-side) and the same auth/company-membership + demo-write
 * gate as every other client mutation in this file.
 */
export async function uploadClientLogoAction(clientId: string, formData: FormData) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file provided.' }
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) return { error: 'Unsupported image format. Please upload a PNG, JPG, or WebP file.' }
  if (file.size > MAX_LOGO_SIZE) return { error: 'Logo must be under 2MB.' }

  // Phase 188 (PROV-01): serverStorage() honors the server-wide provider
  // selection. In Supabase mode this is byte-identical to the prior Supabase-only factory call
  // — same user-scoped client, same storage.objects RLS. In R2 mode the client
  // is ignored and that RLS layer does not exist, so getAuthContext()'s
  // assertWritable() + getActiveCompanyId() company-membership check above is
  // the sole authorization gate for this object.
  const storage = serverStorage(supabase)
  const path = `${company.id}/clients/${clientId}/logo.webp`
  let url: string
  try {
    const webpBuffer = await convertImageToWebp(file)
    await storage.upload('logos', path, webpBuffer, { contentType: 'image/webp', upsert: true })
    url = storageProxyPath('logos', path)
  } catch (err) {
    console.error('[uploadClientLogoAction] upload error:', err)
    return { error: 'Failed to upload logo. Please try again.' }
  }

  const { error } = await supabase.from('clients').update({ logo_url: url }).eq('id', clientId)
  if (error) return { error: 'Failed to save logo.' }

  revalidatePath('/clients')
  revalidatePath(`/clients/${clientId}`)
  return { data: { url } }
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
