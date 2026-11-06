'use server'

import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { assertWritable } from '@/lib/demo/guard'
import { saveDraftSchema, accountDefaults, ownsDraftLogo } from '@/lib/onboarding/draft'
import { createOrUpdateCompany } from '@/lib/actions/company'
import { captureBackgroundError } from '@/lib/observability/capture'
import { ACTIVE_COMPANY_COOKIE } from '@/lib/queries/active-company'
import { serverStorage } from '@/lib/storage/server'
import { storageProxyPath } from '@/lib/storage/asset-url'
import { convertImageToWebp } from '@/lib/image/webp'

async function context() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub || (ownedAuthEnabled() && !claims.phone)) throw new Error('Authentication required')
  if (await assertWritable()) throw new Error('Read-only account')
  return { supabase, claims, userId: claims.sub as string }
}

export async function saveOnboardingDraft(input: unknown) {
  try {
    const body = saveDraftSchema.safeParse(input)
    if (!body.success) return { error: 'Could not save your draft. Please try again.' }
    const { supabase, userId } = await context()
    if (!ownsDraftLogo(body.data.values.logoUrl, userId, body.data.id)) return { error: 'Could not save your draft. Please try again.' }
    const { data, error } = await supabase.from('onboarding_drafts')
      .update({ step: body.data.step, values: body.data.values, schema_version: 3,
        client_id: body.data.clientId, client_sequence: body.data.sequence, completion_started_at: null })
      .eq('id', body.data.id).eq('user_id', userId).eq('mode', body.data.mode)
      .is('completed_at', null)
      .or(`and(or(completion_started_at.is.null,completion_started_at.lt.${new Date(Date.now() - 300_000).toISOString()}),or(client_id.is.null,client_id.neq.${body.data.clientId},client_sequence.lt.${body.data.sequence}))`)
      .select('last_activity_at,revision').maybeSingle()
    if (!error && !data) {
      const current = await supabase.from('onboarding_drafts').select('last_activity_at,revision,client_id,client_sequence,completed_at')
        .eq('id', body.data.id).eq('user_id', userId).eq('mode', body.data.mode).maybeSingle()
      if (!current.error && current.data && (current.data.completed_at || (current.data.client_id === body.data.clientId && Number(current.data.client_sequence) >= body.data.sequence))) {
        return { savedAt: current.data.last_activity_at as string, revision: current.data.revision as number }
      }
    }
    if (error || !data) return { error: 'Could not save your draft. Please try again.' }
    return { savedAt: data.last_activity_at as string, revision: data.revision as number }
  } catch (error) {
    captureBackgroundError('onboarding.autosave')(error)
    return { error: 'Could not save your draft. Please try again.' }
  }
}

export async function uploadOnboardingDraftLogo(form: FormData) {
  try {
    const { supabase, userId } = await context()
    const id = form.get('draftId')
    const file = form.get('file')
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || !(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      return { error: 'Could not save your logo. Please try again.' }
    }
    const draft = await supabase.from('onboarding_drafts').select('id').eq('id', id).eq('user_id', userId).is('completed_at', null).maybeSingle()
    if (draft.error || !draft.data) return { error: 'Could not save your logo. Please try again.' }
    const key = `${userId}/onboarding/${id}/${randomUUID()}.webp`
    await serverStorage(supabase).upload('logos', key, await convertImageToWebp(file), { contentType: 'image/webp', upsert: false })
    return { url: storageProxyPath('logos', key) }
  } catch (error) {
    captureBackgroundError('onboarding.logoDraft')(error)
    return { error: 'Could not save your logo. Please try again.' }
  }
}

export async function completeOnboarding(input: unknown) {
  const body = saveDraftSchema.safeParse(input)
  if (!body.success || body.data.values.companyName.trim().length < 2) return { error: 'Company name must be at least 2 characters' }
  const { supabase, claims, userId } = await context()
  const saved = await saveOnboardingDraft(body.data)
  if (saved.error) return saved
  const lease = await supabase.from('onboarding_drafts').update({ completion_started_at: new Date().toISOString() })
    .eq('id', body.data.id).eq('user_id', userId).is('completed_at', null)
    .or(`completion_started_at.is.null,completion_started_at.lt.${new Date(Date.now() - 300_000).toISOString()}`)
    .select('id').maybeSingle()
  if (lease.error || !lease.data) return { error: 'Setup is already being completed. Please try again shortly.' }
  const release = async () => { await supabase.from('onboarding_drafts').update({ completion_started_at: null }).eq('id', body.data.id).eq('user_id', userId).is('completed_at', null) }
  try {
    const result = await createOrUpdateCompany({
      ...body.data.values, ...accountDefaults(claims),
      // The onboarding region is intentionally free-form, not a postal address.
      address: '', state: '', zip: '', licenseNumber: '', insuranceInfo: '',
      logoUrl: body.data.values.logoUrl || undefined,
    }, { mode: body.data.mode })
    await release()
    return result
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT;')) {
      const jar = await cookies()
      const marked = await supabase.from('onboarding_drafts').update({
        completed_at: new Date().toISOString(), completed_company_id: jar.get(ACTIVE_COMPANY_COOKIE)?.value ?? null,
      }).eq('id', body.data.id).eq('user_id', userId).is('completed_at', null)
      if (marked.error) captureBackgroundError('onboarding.markCompleted')(marked.error)
      throw error
    }
    await release()
    captureBackgroundError('onboarding.complete')(error)
    return { error: 'Could not finish setup. Please try again.' }
  }
}
