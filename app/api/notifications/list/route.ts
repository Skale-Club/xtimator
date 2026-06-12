import { NextRequest, NextResponse } from 'next/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { listNotificationsPage } from '@/lib/notifications/queries'

/**
 * GET /api/notifications/list
 *
 * Query params:
 *   - cursor: ISO timestamp (created_at) — pagination cursor
 *   - limit:  number (default 20, max 100)
 *
 * Returns: { items: NotificationRow[], nextCursor: string | null }
 *
 * Scope: caller's company + (null user_id OR their own user_id).
 * Enforced via service-role + explicit WHERE clauses in `listNotificationsPage`.
 */
export async function GET(req: NextRequest) {
  const claims = await getAuthClaims()
  if (!claims?.sub) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const company = await getActiveCompany()
  if (!company) {
    return NextResponse.json({ error: 'no_company' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor')
  const limitRaw = searchParams.get('limit')
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100) : 20

  const result = await listNotificationsPage({
    companyId: company.id,
    userId: claims.sub as string,
    cursor: cursor ?? null,
    limit,
  })

  return NextResponse.json(result)
}
