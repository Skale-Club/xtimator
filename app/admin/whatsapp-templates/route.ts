import { requireAdmin } from '@/lib/auth/admin-context'

export async function GET() {
  await requireAdmin()
  return new Response(null, { status: 307, headers: { location: '/admin/inbox/settings?tab=templates', 'cache-control': 'private, no-store' } })
}
