'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function getOwnerContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' as const }

  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', claims.sub)
    .single()

  if (!membership || membership.role !== 'owner') {
    return { error: 'Only company owners can manage staff' as const }
  }

  const denied = await assertWritable()
  if (denied) return denied

  return { companyId, userId: claims.sub as string }
}

export interface StaffMember {
  user_id: string
  display_name: string | null
  email: string | null
  created_at: string
}

export async function createStaffMember(name: string, email: string) {
  const ctx = await getOwnerContext()
  if ('error' in ctx) return { error: ctx.error }

  const service = requireServiceClient()
  const tempPassword = generateTempPassword()

  const { data: userData, error: authError } = await service.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (authError || !userData.user) {
    const msg = authError?.message ?? ''
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return { error: 'This email is already registered.' }
    }
    return { error: msg || 'Failed to create staff account.' }
  }

  const { error: memberError } = await service
    .from('company_members')
    .insert({
      user_id: userData.user.id,
      company_id: ctx.companyId,
      role: 'staff',
      display_name: name,
      email,
    })

  if (memberError) {
    await service.auth.admin.deleteUser(userData.user.id)
    return { error: 'Failed to add staff member.' }
  }

  revalidatePath('/settings/staff')
  return { success: true as const, tempPassword }
}

export async function listStaffMembers(): Promise<{ staff: StaffMember[]; error?: string }> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { staff: [], error: 'Not authenticated' }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { staff: [], error: 'No company found' }

  const service = requireServiceClient()
  const { data, error } = await service
    .from('company_members')
    .select('user_id, display_name, email, created_at')
    .eq('company_id', companyId)
    .eq('role', 'staff')
    .order('created_at', { ascending: true })

  if (error) return { staff: [], error: error.message }
  return { staff: (data as StaffMember[]) ?? [] }
}

export async function removeStaffMember(userId: string) {
  const ctx = await getOwnerContext()
  if ('error' in ctx) return { error: ctx.error }

  const service = requireServiceClient()
  const { error } = await service
    .from('company_members')
    .delete()
    .eq('company_id', ctx.companyId)
    .eq('user_id', userId)
    .eq('role', 'staff')

  if (error) return { error: 'Failed to remove staff member.' }

  revalidatePath('/settings/staff')
  return { success: true as const }
}
