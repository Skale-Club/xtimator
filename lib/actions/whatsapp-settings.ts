'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { isDemoSession, DEMO_READONLY_MESSAGE } from '@/lib/demo/guard'

// company_whatsapp is RLS deny-all (no policies), so it can only be read/written
// by the service client. We validate the user + active company with the
// authenticated client, then operate on company_whatsapp via `svc` scoped to the
// validated companyId — never trusting client-supplied ids.
type AuthSuccess = { ok: true; svc: SupabaseClient; companyId: string }
type AuthFailure = { ok: false; errorMsg: string }

async function getAuthContext(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { ok: false, errorMsg: 'Not authenticated' }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { ok: false, errorMsg: 'No company found' }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { ok: false, errorMsg: 'No company found' }

  // company_whatsapp is written via the service client, which bypasses RLS, so
  // the demo read-only RLS policies do NOT protect it. This app-layer guard is
  // the only thing stopping a demo visitor from modifying delivery format.
  if (await isDemoSession()) return { ok: false, errorMsg: DEMO_READONLY_MESSAGE }

  return { ok: true, svc: requireServiceClient(), companyId: company.id }
}

export type WhatsAppSettingsResult =
  | { ok: true }
  | { ok: false; error: string }

export async function updateDeliveryFormat(
  format: 'share_link' | 'formatted_text' | 'pdf_attachment'
): Promise<WhatsAppSettingsResult> {
  const ctx = await getAuthContext()
  if (!ctx.ok) return { ok: false, error: ctx.errorMsg }
  const { svc, companyId } = ctx

  const { error } = await svc
    .from('company_whatsapp')
    .update({ delivery_format: format })
    .eq('company_id', companyId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/integrations')
  return { ok: true }
}
