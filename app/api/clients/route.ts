'use server'

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null

  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'No company found' }, { status: 403 })
  }

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, phone')
    .eq('company_id', company.id)
    .order('name')

  return NextResponse.json(clients ?? [])
}