'use server'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'

export async function GET() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pre-launch audit fix: getActiveCompanyId() resolves via company_members,
  // so this works for STAFF members too — the previous
  // companies.user_id = claims.sub lookup only ever matched the account owner.
  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return NextResponse.json({ error: 'No company found' }, { status: 403 })
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, phone')
    .eq('company_id', companyId)
    .order('name')

  return NextResponse.json(clients ?? [])
}