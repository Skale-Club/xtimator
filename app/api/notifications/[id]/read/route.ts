import { NextRequest, NextResponse } from 'next/server'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * PATCH /api/notifications/[id]/read
 *
 * Marks a single notification as read (`read_at = now()`).
 * Uses service role + explicit WHERE clause (company + user scope) since
 * RLS forbids client UPDATE on `notifications`.
 *
 * Returns 204 on success.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const claims = await getAuthClaims()
  if (!claims?.sub) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const company = await getCachedCompany(claims.sub as string)
  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 404 })
  }
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 })
  }

  const svc = requireServiceClient()
  const { error } = await svc
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', company.id)
    .or(`user_id.is.null,user_id.eq.${claims.sub}`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
