import { NextRequest, NextResponse } from 'next/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/notifications/mark-all-read
 *
 * Marks every unread notification scoped to (company + user) as read.
 * Returns { updated: number }.
 */
export async function POST(_req: NextRequest) {
  const claims = await getAuthClaims()
  if (!claims?.sub) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const company = await getActiveCompany()
  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 404 })
  }

  const svc = requireServiceClient()
  const { data, error } = await svc
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('company_id', company.id)
    .is('read_at', null)
    .or(`user_id.is.null,user_id.eq.${claims.sub}`)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ updated: (data ?? []).length })
}
