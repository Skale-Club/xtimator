import { getAdminContext } from '@/lib/auth/admin-context'

export async function GET() {
  const admin = await getAdminContext()
  return new Response(null, { status: 307, headers: { location: admin ? '/admin/pages' : '/api/logout', 'cache-control': 'private, no-store' } })
}
